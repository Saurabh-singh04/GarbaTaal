import { Injectable, inject, signal, computed } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { MiniProfile } from './matches.service';
import { ageOn } from '../utils/age';

/**
 * One conversation.
 *
 * Almost all of the rules live in Postgres, not here: `enforce_message_policy`
 * rate-limits, caps free users at two conversations, delays contact sharing
 * until both sides have written ten messages, and holds anything combining
 * contact details with payment language. This service's job is to send, to
 * listen, and to explain a rejection in words a person can act on.
 *
 * A held message is invisible to everyone including its sender, because the
 * RLS read policy excludes `is_held`. So we keep the sent copy locally and
 * mark it — silently dropping someone's message is how you get accused of
 * censoring, and it is also just confusing.
 */

export interface ChatMessage {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  mine: boolean;
  /** Set locally when the trigger held it. Never comes back from a read. */
  held_reason?: 'contact_too_early' | 'contact_with_payment' | null;
  pending?: boolean;
  failed?: boolean;
}

/** Why a send was refused, in words rather than a Postgres error code. */
const SEND_ERRORS: Record<string, string> = {
  rate_limited:
    'Slow down a moment — that is a lot of messages in one minute.',
  conversation_limit:
    'Free accounts can chat in two conversations at a time. The Navratri Pass opens the rest.',
  account_suspended:
    'This account has been suspended.'
};

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly supabase = inject(SupabaseService);

  readonly messages = signal<ChatMessage[]>([]);
  readonly other = signal<MiniProfile | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly sending = signal(false);

  /** True when showing an illustrative conversation to a signed-out visitor. */
  readonly isPreview = signal(false);

  private channel: RealtimeChannel | null = null;
  private matchId: string | null = null;

  /**
   * Counts toward the contact-sharing gate, which needs TEN from each side.
   * Surfacing it is the difference between "why was my number held?" and a
   * visible rule people can see themselves approaching.
   */
  readonly myCount = computed(
    () => this.messages().filter((m) => m.mine && !m.failed).length
  );
  readonly theirCount = computed(
    () => this.messages().filter((m) => !m.mine).length
  );
  readonly contactUnlocked = computed(
    () => this.myCount() >= 10 && this.theirCount() >= 10
  );

  async open(matchId: string): Promise<void> {
    this.matchId = matchId;
    this.loading.set(true);
    this.error.set(null);
    this.messages.set([]);

    const me = this.supabase.session()?.user?.id;

    // Signed out: show a written sample so the screen can be judged without
    // an account. Flagged, and nothing here is ever sent anywhere.
    if (!me) {
      this.isPreview.set(true);
      this.other.set(SAMPLE_OTHER);
      this.messages.set(sampleThread(matchId));
      this.loading.set(false);
      return;
    }

    this.isPreview.set(false);

    try {
      const { data: match, error: matchErr } = await this.supabase.db
        .from('matches')
        .select('id, user_low, user_high')
        .eq('id', matchId)
        .maybeSingle();

      // RLS returns nothing rather than forbidding, so "not found" and "not
      // yours" are indistinguishable here — and should be. Telling someone a
      // match exists but is not theirs leaks that the pair exists.
      if (matchErr || !match) {
        this.error.set('This conversation is not available.');
        this.loading.set(false);
        return;
      }

      const otherId = match.user_low === me ? match.user_high : match.user_low;

      const [{ data: prof }, { data: rows }] = await Promise.all([
        this.supabase.db
          .from('profiles')
          .select('id, first_name, date_of_birth, primary_photo_url, is_verified')
          .eq('id', otherId)
          .maybeSingle(),
        this.supabase.db
          .from('messages')
          .select('id, match_id, sender_id, body, created_at')
          .eq('match_id', matchId)
          .order('created_at', { ascending: true })
          .limit(200)
      ]);

      this.other.set(
        prof
          ? {
              id: prof.id,
              first_name: prof.first_name,
              age: prof.date_of_birth ? ageOn(prof.date_of_birth) : null,
              photo_url: prof.primary_photo_url ?? null,
              is_verified: !!prof.is_verified
            }
          : { id: otherId, first_name: 'Someone', age: null, photo_url: null, is_verified: false }
      );

      this.messages.set(
        (rows ?? []).map((r) => ({ ...r, mine: r.sender_id === me }))
      );

      this.subscribe(matchId, me);
    } catch {
      this.error.set('Could not open this chat.');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Send. The message appears immediately with `pending`, then is replaced by
   * the row the database actually stored — which may differ, because the
   * trigger can mark it held.
   */
  async send(body: string): Promise<void> {
    const text = body.trim();
    if (!text || this.sending()) return;

    if (this.isPreview()) {
      this.error.set('This is a preview. Sign in to start a real conversation.');
      return;
    }

    const me = this.supabase.session()?.user?.id;
    if (!me || !this.matchId) return;

    const tempId = `pending-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      match_id: this.matchId,
      sender_id: me,
      body: text,
      created_at: new Date().toISOString(),
      mine: true,
      pending: true
    };

    this.messages.update((list) => [...list, optimistic]);
    this.sending.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabase.db
        .from('messages')
        .insert({ match_id: this.matchId, sender_id: me, body: text })
        .select('id, match_id, sender_id, body, created_at, is_held, flagged_reason')
        .single();

      if (error) {
        // The trigger raises bare strings; Postgres wraps them in a message.
        const key = Object.keys(SEND_ERRORS).find((k) => error.message?.includes(k));
        this.error.set(key ? SEND_ERRORS[key] : 'Message not sent. Try again.');
        this.messages.update((list) =>
          list.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m))
        );
        return;
      }

      this.messages.update((list) =>
        list.map((m) =>
          m.id === tempId
            ? {
                id: data.id,
                match_id: data.match_id,
                sender_id: data.sender_id,
                body: data.body,
                created_at: data.created_at,
                mine: true,
                held_reason: data.is_held ? data.flagged_reason : null
              }
            : m
        )
      );
    } catch {
      this.error.set('Message not sent. Check your connection.');
      this.messages.update((list) =>
        list.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m))
      );
    } finally {
      this.sending.set(false);
    }
  }

  close(): void {
    if (this.channel) {
      void this.supabase.db.removeChannel(this.channel);
      this.channel = null;
    }
    this.matchId = null;
    this.messages.set([]);
    this.other.set(null);
    this.error.set(null);
  }

  // ── internals ───────────────────────────────────────────────────────────

  /**
   * Realtime insert stream for this thread.
   *
   * Only their messages are appended. Our own already appear optimistically,
   * and adding the echo would duplicate every line we send.
   */
  private subscribe(matchId: string, me: string): void {
    if (this.channel) void this.supabase.db.removeChannel(this.channel);

    this.channel = this.supabase.db
      .channel(`chat:${matchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        (payload) => {
          const row = payload.new as {
            id: string; match_id: string; sender_id: string;
            body: string; created_at: string; is_held?: boolean;
          };
          if (row.sender_id === me) return;
          if (row.is_held) return;              // under review; nobody sees it
          if (this.messages().some((m) => m.id === row.id)) return;

          this.messages.update((list) => [
            ...list,
            { ...row, mine: false }
          ]);
        }
      )
      .subscribe();
  }
}

// ── Preview data ──────────────────────────────────────────────────────────
// Shown only when signed out, and labelled in the UI. A real user must never
// see an invented person — see the note in DiscoveryService.

const SAMPLE_OTHER: MiniProfile = {
  id: 'sample-other',
  first_name: 'Riya',
  age: 24,
  photo_url: null,
  is_verified: true
};

function sampleThread(matchId: string): ChatMessage[] {
  const base = Date.now() - 40 * 60_000;
  const at = (min: number) => new Date(base + min * 60_000).toISOString();

  return [
    ['Hey! Saw we both have nights 4 and 7 free 🙂', false, 0],
    ['Yes! And you are in Satellite too — that is five minutes from me', true, 2],
    ['Perfect. Are you doing Dodhiyu or mostly 3-taali?', false, 5],
    ['Both, but Dodhiyu is where I actually enjoy myself', true, 7],
    ['Same. Most people tire out by the third round 😄', false, 9],
    ['Shall we plan for night 4? We can meet somewhere public first', true, 12]
  ].map(([body, theirs, min], i) => ({
    id: `sample-msg-${i}`,
    match_id: matchId,
    sender_id: theirs ? 'sample-other' : 'me',
    body: body as string,
    created_at: at(min as number),
    mine: !theirs
  }));
}
