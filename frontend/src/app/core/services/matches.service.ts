import { Injectable, inject, signal, computed } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { ageOn } from '../utils/age';

/**
 * Requests and matches — the inbox.
 *
 * This is the highest-leverage screen in the product. It closes the core loop
 * (discover → request → match → chat), and the received list is also the
 * feature the competitor charges ₹199/month for as "see who liked you". The
 * data is already there: a pending request row IS a like.
 *
 * Writes go through respond_to_request(), never directly. `requests` and
 * `matches` have no INSERT or UPDATE policy, so the RPC is the only path and
 * it holds the row lock that stops a double-accept creating two chat rooms.
 */

/** The little we show about someone before they are a match. */
export interface MiniProfile {
  id: string;
  first_name: string;
  age: number | null;
  photo_url: string | null;
  is_verified: boolean;
}

export interface IncomingRequest {
  id: string;
  from: MiniProfile;
  note: string | null;
  created_at: string;
  expires_at: string;
}

export interface OutgoingRequest {
  id: string;
  to: MiniProfile;
  created_at: string;
  expires_at: string;
}

export interface MatchSummary {
  match_id: string;
  other: MiniProfile;
  created_at: string;
  last_message: string | null;
  last_message_at: string | null;
  /** True when the newest message is theirs — the closest thing to unread
   *  without a read-receipts table, and honest about what it means. */
  their_turn: boolean;
}

@Injectable({ providedIn: 'root' })
export class MatchesService {
  private readonly supabase = inject(SupabaseService);

  readonly incoming = signal<IncomingRequest[]>([]);
  readonly outgoing = signal<OutgoingRequest[]>([]);
  readonly matches = signal<MatchSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** True when showing illustrative rows to a signed-out visitor. */
  readonly isPreview = signal(false);

  /** Drives the nav badge. Requests are what need a decision. */
  readonly pendingCount = computed(() => this.incoming().length);

  async load(): Promise<void> {
    const me = this.supabase.session()?.user?.id;

    // Signed out: render a labelled example so the screen can be judged
    // without an account. These are never shown to a signed-in user — see
    // the note in DiscoveryService about why that line matters.
    if (!me) {
      this.isPreview.set(true);
      this.incoming.set(SAMPLE_INCOMING);
      this.matches.set(SAMPLE_MATCHES);
      this.outgoing.set(SAMPLE_OUTGOING);
      return;
    }

    this.isPreview.set(false);
    this.loading.set(true);
    this.error.set(null);

    try {
      const nowIso = new Date().toISOString();

      // expire_old_requests() only runs on the nightly cron, so a request can
      // be past expires_at and still say 'pending'. Filtering here as well
      // means the list never offers a decision the RPC would then reject.
      const [reqRes, matchRes] = await Promise.all([
        this.supabase.db
          .from('requests')
          .select('id, from_user_id, to_user_id, note, created_at, expires_at')
          .eq('status', 'pending')
          .gt('expires_at', nowIso)
          .order('created_at', { ascending: false }),
        this.supabase.db
          .from('matches')
          .select('id, user_low, user_high, created_at')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
      ]);

      if (reqRes.error) throw reqRes.error;
      if (matchRes.error) throw matchRes.error;

      const requests = reqRes.data ?? [];
      const matchRows = matchRes.data ?? [];

      // Every person referenced across all three lists, fetched once. Doing
      // this per row is what made the first deck loader slow.
      const otherIds = new Set<string>();
      for (const r of requests) {
        otherIds.add(r.from_user_id === me ? r.to_user_id : r.from_user_id);
      }
      for (const m of matchRows) {
        otherIds.add(m.user_low === me ? m.user_high : m.user_low);
      }

      const people = await this.fetchProfiles([...otherIds]);
      const matchIds = matchRows.map((m) => m.id);
      const latest = await this.fetchLatestMessages(matchIds);

      this.incoming.set(
        requests
          .filter((r) => r.to_user_id === me)
          .map((r) => ({
            id: r.id,
            from: people.get(r.from_user_id) ?? unknownPerson(r.from_user_id),
            note: r.note,
            created_at: r.created_at,
            expires_at: r.expires_at
          }))
      );

      this.outgoing.set(
        requests
          .filter((r) => r.from_user_id === me)
          .map((r) => ({
            id: r.id,
            to: people.get(r.to_user_id) ?? unknownPerson(r.to_user_id),
            created_at: r.created_at,
            expires_at: r.expires_at
          }))
      );

      this.matches.set(
        matchRows.map((m) => {
          const otherId = m.user_low === me ? m.user_high : m.user_low;
          const last = latest.get(m.id);
          return {
            match_id: m.id,
            other: people.get(otherId) ?? unknownPerson(otherId),
            created_at: m.created_at,
            last_message: last?.body ?? null,
            last_message_at: last?.created_at ?? null,
            their_turn: last ? last.sender_id !== me : false
          };
        })
      );
    } catch {
      this.error.set('Could not load your matches. Pull down to try again.');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Accept or decline. Returns the new match id when accepting creates one.
   *
   * Removes the row from the list before awaiting, because the alternative —
   * a spinner on a card you have already decided about — reads as a failure
   * and gets tapped twice. On error it is put back.
   */
  async respond(
    request: IncomingRequest,
    accept: boolean
  ): Promise<{ ok: boolean; matched: boolean; match_id?: string; error?: string }> {
    const before = this.incoming();
    this.incoming.update((list) => list.filter((r) => r.id !== request.id));

    try {
      const { data, error } = await this.supabase.db.rpc('respond_to_request', {
        request_id: request.id,
        accept
      });
      if (error) throw error;

      const res = data as { ok: boolean; matched?: boolean; match_id?: string; error?: string };

      if (!res.ok) {
        // 'expired' and 'not_found' are both genuinely gone — leave them
        // removed. Anything else is unexplained, so restore the card rather
        // than silently losing someone's request.
        if (res.error !== 'expired' && res.error !== 'not_found') {
          this.incoming.set(before);
        }
        return { ok: false, matched: false, error: res.error };
      }

      if (res.matched) await this.load();
      return { ok: true, matched: !!res.matched, match_id: res.match_id };
    } catch {
      this.incoming.set(before);
      return { ok: false, matched: false, error: 'network' };
    }
  }

  // ── internals ───────────────────────────────────────────────────────────

  private async fetchProfiles(ids: string[]): Promise<Map<string, MiniProfile>> {
    const out = new Map<string, MiniProfile>();
    if (!ids.length) return out;

    const { data } = await this.supabase.db
      .from('profiles')
      .select('id, first_name, date_of_birth, primary_photo_url, is_verified')
      .in('id', ids);

    for (const p of data ?? []) {
      out.set(p.id, {
        id: p.id,
        first_name: p.first_name,
        age: p.date_of_birth ? ageOn(p.date_of_birth) : null,
        photo_url: p.primary_photo_url ?? null,
        is_verified: !!p.is_verified
      });
    }
    return out;
  }

  /**
   * Newest message per match, in one query rather than one per thread.
   *
   * Rows come back newest-first, so the first row seen for a match id is its
   * latest. Held messages are invisible here because the RLS read policy
   * already excludes them — a message being reviewed must not preview in
   * someone's inbox.
   */
  private async fetchLatestMessages(
    matchIds: string[]
  ): Promise<Map<string, { body: string; created_at: string; sender_id: string }>> {
    const out = new Map<string, { body: string; created_at: string; sender_id: string }>();
    if (!matchIds.length) return out;

    const { data } = await this.supabase.db
      .from('messages')
      .select('match_id, body, created_at, sender_id')
      .in('match_id', matchIds)
      .order('created_at', { ascending: false });

    for (const m of data ?? []) {
      if (!out.has(m.match_id)) {
        out.set(m.match_id, {
          body: m.body,
          created_at: m.created_at,
          sender_id: m.sender_id
        });
      }
    }
    return out;
  }
}

/**
 * Stand-in for someone RLS will not show us — they blocked us, paused, or
 * were banned between their request and us opening the inbox. Rendering a
 * neutral card is better than dropping the row, which would leave a request
 * that can be neither accepted nor explained.
 */
function unknownPerson(id: string): MiniProfile {
  return { id, first_name: 'Someone', age: null, photo_url: null, is_verified: false };
}

// ── Preview data ──────────────────────────────────────────────────────────
// Signed-out only, and labelled in the UI.

const hoursFromNow = (h: number) =>
  new Date(Date.now() + h * 3_600_000).toISOString();
const hoursAgo = (h: number) =>
  new Date(Date.now() - h * 3_600_000).toISOString();

const SAMPLE_INCOMING: IncomingRequest[] = [
  {
    id: 'sample-req-1',
    from: { id: 'sample-1', first_name: 'Meera', age: 24, photo_url: null, is_verified: true },
    note: 'We both have nights 4 and 7 — and you are in Satellite too!',
    created_at: hoursAgo(3),
    expires_at: hoursFromNow(45)
  },
  {
    id: 'sample-req-2',
    from: { id: 'sample-2', first_name: 'Aarav', age: 26, photo_url: null, is_verified: false },
    note: null,
    created_at: hoursAgo(20),
    expires_at: hoursFromNow(28)
  }
];

const SAMPLE_MATCHES: MatchSummary[] = [
  {
    match_id: 'sample-match-1',
    other: { id: 'sample-3', first_name: 'Riya', age: 24, photo_url: null, is_verified: true },
    created_at: hoursAgo(26),
    last_message: 'Shall we plan for night 4? We can meet somewhere public first',
    last_message_at: hoursAgo(1),
    their_turn: false
  },
  {
    match_id: 'sample-match-2',
    other: { id: 'sample-4', first_name: 'Kabir', age: 25, photo_url: null, is_verified: true },
    created_at: hoursAgo(50),
    last_message: 'Dodhiyu till the lights go out 😄',
    last_message_at: hoursAgo(9),
    their_turn: true
  }
];

const SAMPLE_OUTGOING: OutgoingRequest[] = [
  {
    id: 'sample-out-1',
    to: { id: 'sample-5', first_name: 'Pooja', age: 23, photo_url: null, is_verified: false },
    created_at: hoursAgo(6),
    expires_at: hoursFromNow(42)
  }
];
