import { Injectable, inject, signal, computed } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { ProfileService } from './profile.service';
import { PreferencesService } from './preferences.service';
import {
  DeckCandidate,
  SwipeResult,
  DeckState,
  DanceStyle,
  SkillLevel,
  TempoPref,
  GarbaStep,
  UserIntent
} from '../models/profile.model';
import { maskToNights, sharedNightCount } from '../utils/nights';

@Injectable({ providedIn: 'root' })
export class DiscoveryService {
  private readonly supabase = inject(SupabaseService);
  private readonly profileService = inject(ProfileService);
  private readonly prefsService = inject(PreferencesService);

  readonly deck = signal<DeckCandidate[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly lastSwiped = signal<{ candidate: DeckCandidate; liked: boolean } | null>(null);

  /** Why the deck is empty, so the UI can say something true instead of guessing. */
  readonly deckState = signal<DeckState>('ready');

  /** True when the cards on screen are the signed-out preview, not real people. */
  readonly isPreview = signal(false);

  readonly currentCandidate = computed(() => this.deck()[0] ?? null);
  readonly hasMore = computed(() => this.deck().length > 0);

  /**
   * Loads the ranked discovery deck.
   *
   * Signed out → an explicitly-labelled preview so someone can feel the product
   * before committing. Signed in → real people only. Sample dancers are NEVER
   * mixed into a real deck, however thin the local pool is; an honest empty
   * state is recoverable, a fake profile is not.
   */
  async loadDeck(): Promise<void> {
    const userId = this.supabase.session()?.user?.id;
    if (!userId) {
      this.isPreview.set(true);
      this.deckState.set('ready');
      this.deck.set(this.getSampleDancers());
      this.loading.set(false);
      return;
    }

    this.isPreview.set(false);

    this.loading.set(true);
    this.error.set(null);

    try {
      // 1. Get current user's profile and availability for matching calculation
      const myProfile = this.profileService.profile();
      const myAvail = this.prefsService.availability();
      const myPrefs = this.prefsService.preferences();

      const myNightsMask = myAvail?.nights_mask ?? 511; // default to all nights if unset
      const myVenueIds = new Set(myAvail?.venue_ids ?? []);
      const myLookingFor = new Set(myProfile?.looking_for ?? ['female', 'male']);

      // 2. Fetch IDs already swiped by me
      const { data: swipedRows } = await this.supabase.db
        .from('swipes')
        .select('target_id')
        .eq('actor_id', userId);

      const swipedIds = new Set((swipedRows ?? []).map(r => r.target_id));

      // 3. Try precomputed deck_cache first
      const { data: cachedDeck, error: cacheErr } = await this.supabase.db
        .from('deck_cache')
        .select('candidate_id, rank, score, reasons')
        .eq('user_id', userId)
        .order('rank', { ascending: true })
        .limit(20);

      const candidates: DeckCandidate[] = [];

      if (!cacheErr && cachedDeck && cachedDeck.length > 0) {
        for (const item of cachedDeck) {
          if (swipedIds.has(item.candidate_id)) continue;

          const { data: prof } = await this.supabase.db
            .from('profiles')
            .select('*')
            .eq('id', item.candidate_id)
            .single();

          if (prof && !prof.is_banned && !prof.is_paused) {
            const { data: pPrefs } = await this.supabase.db
              .from('preferences')
              .select('*')
              .eq('user_id', prof.id)
              .maybeSingle();

            const { data: pAvail } = await this.supabase.db
              .from('availability')
              .select('*')
              .eq('user_id', prof.id)
              .maybeSingle();

            candidates.push(
              this.buildCandidate(
                prof,
                pPrefs,
                pAvail,
                item.reasons as string[],
                item.score
              )
            );
          }
        }
      }

      // 4. If deck_cache had no candidates, query profiles directly
      if (candidates.length === 0) {
        const { data: others, error: othersErr } = await this.supabase.db
          .from('profiles')
          .select('*')
          .neq('id', userId)
          .eq('is_banned', false)
          .eq('is_paused', false)
          .limit(25);

        if (!othersErr && others) {
          for (const prof of others) {
            if (swipedIds.has(prof.id)) continue;
            // Filter by looking_for if configured
            if (myLookingFor.size > 0 && !myLookingFor.has(prof.gender)) continue;

            const [{ data: pPrefs }, { data: pAvail }] = await Promise.all([
              this.supabase.db.from('preferences').select('*').eq('user_id', prof.id).maybeSingle(),
              this.supabase.db.from('availability').select('*').eq('user_id', prof.id).maybeSingle()
            ]);

            const reasons = this.generateReasons(
              myNightsMask,
              myVenueIds,
              myPrefs?.steps ?? [],
              pPrefs,
              pAvail
            );

            candidates.push(this.buildCandidate(prof, pPrefs, pAvail, reasons));
          }
        }
      }

      // 5. Say something true about an empty deck rather than padding it.
      //
      // A thin city is a real state and the user can act on it (invite friends,
      // widen nights). Inventing dancers to fill the gap would hand a real user
      // a match with a person who does not exist — the single fastest way to
      // lose trust in this category, and nationally the thin-city case is the
      // common one, not the exception.
      if (candidates.length === 0) {
        if (myNightsMask === 0) {
          this.deckState.set('no_nights');
        } else if (swipedIds.size > 0) {
          this.deckState.set('caught_up');
        } else {
          this.deckState.set('thin_city');
        }
      } else {
        this.deckState.set('ready');
      }

      this.deck.set(candidates);
    } catch (err: unknown) {
      this.error.set('Could not load dancers. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Swipe on a candidate:
   * - liked = true: calls Postgres RPC send_request (detects mutual match)
   * - liked = false: writes to swipes table
   */
  async swipe(candidate: DeckCandidate, liked: boolean, note?: string): Promise<SwipeResult> {
    // Remove from top of deck immediately for snappy UI
    this.deck.update(list => list.filter(c => c.id !== candidate.id));
    this.lastSwiped.set({ candidate, liked });

    try {
      // If it's a seed/demo profile, handle locally
      if (candidate.id.startsWith('sample-')) {
        // Deterministic fun: match on specific demo profiles (e.g. Riya or Kabir)
        const isDemoMatch = liked && (candidate.first_name === 'Riya' || candidate.first_name === 'Kabir');
        return {
          ok: true,
          matched: isDemoMatch,
          match_id: isDemoMatch ? 'sample-match-' + Date.now() : undefined
        };
      }

      const userId = this.supabase.session()?.user?.id;
      if (!userId) return { ok: false, matched: false, error: 'not_authenticated' };

      if (liked) {
        const { data, error } = await this.supabase.db.rpc('send_request', {
          target_id: candidate.id,
          note: note ?? null
        });

        if (error) throw error;
        const res = data as { ok: boolean; matched?: boolean; match_id?: string; error?: string };

        return {
          ok: res.ok,
          matched: !!res.matched,
          match_id: res.match_id,
          error: res.error
        };
      } else {
        await this.supabase.db
          .from('swipes')
          .insert({ actor_id: userId, target_id: candidate.id, liked: false });

        return { ok: true, matched: false };
      }
    } catch (err) {
      // Re-insert if failed
      this.deck.update(list => [candidate, ...list]);
      return { ok: false, matched: false, error: 'swipe_failed' };
    }
  }

  /**
   * Undo the last swiped card (Rewind feature).
   */
  async rewind(): Promise<void> {
    const last = this.lastSwiped();
    if (!last) return;

    const userId = this.supabase.session()?.user?.id;

    if (userId && !last.candidate.id.startsWith('sample-')) {
      await this.supabase.db
        .from('swipes')
        .delete()
        .eq('actor_id', userId)
        .eq('target_id', last.candidate.id);
    }

    this.deck.update(list => [last.candidate, ...list]);
    this.lastSwiped.set(null);
  }

  private buildCandidate(
    prof: any,
    prefs: any,
    avail: any,
    reasons: string[],
    score?: number
  ): DeckCandidate {
    const age = prof.date_of_birth
      ? Math.floor((Date.now() - new Date(prof.date_of_birth).getTime()) / (365.25 * 24 * 3600 * 1000))
      : 23;

    return {
      id: prof.id,
      first_name: prof.first_name,
      age: Math.max(18, age),
      gender: prof.gender,
      bio: prof.bio,
      photo_url: prof.primary_photo_url || null,
      is_verified: !!prof.is_verified,
      preferences: {
        style: (prefs?.style as DanceStyle) || 'garba',
        skill: (prefs?.skill as SkillLevel) || 'good',
        tempo: (prefs?.tempo as TempoPref) || 'traditional',
        steps: (prefs?.steps as GarbaStep[]) || ['3_taali', 'dodhiyu'],
        intent: (prefs?.intent as UserIntent) || 'dance_only',
        wants_group: !!prefs?.wants_group,
        going_with_friends: !!prefs?.going_with_friends
      },
      availability: {
        nights_mask: avail?.nights_mask ?? 0,
        venue_names: ['Garba Ground']
      },
      reasons: reasons.length > 0 ? reasons : ['🌙 Shares festival nights', '💃 Dances Garba'],
      score
    };
  }

  private generateReasons(
    myNMask: number,
    myVenues: Set<number>,
    mySteps: GarbaStep[],
    pPrefs: any,
    pAvail: any
  ): string[] {
    const reasons: string[] = [];
    const sharedN = sharedNightCount(myNMask, pAvail?.nights_mask ?? 0);
    if (sharedN > 0) {
      reasons.push(`🌙 ${sharedN} night${sharedN > 1 ? 's' : ''} in common`);
    }

    const candVenues: number[] = pAvail?.venue_ids ?? [];
    if (candVenues.some(v => myVenues.has(v))) {
      reasons.push('🏟️ Same Garba venue');
    }

    const candSteps: GarbaStep[] = pPrefs?.steps ?? [];
    const commonStep = candSteps.find(s => mySteps.includes(s));
    if (commonStep) {
      const stepName = commonStep === 'dodhiyu' ? 'Dodhiyu' : commonStep.replace('_', ' ');
      reasons.push(`💃 Both know ${stepName}`);
    } else if (pPrefs?.skill === 'pro') {
      reasons.push('⭐ Dodhiyu Pro');
    }

    return reasons;
  }

  /**
   * Illustrative dancers for the signed-out preview ONLY.
   *
   * Every one is flagged is_sample so the UI can label it, and loadDeck() never
   * mixes these into a signed-in user's deck.
   */
  private getSampleDancers(): DeckCandidate[] {
    return [
      {
        id: 'sample-1',
        is_sample: true,
        first_name: 'Riya',
        age: 22,
        gender: 'female',
        bio: 'Fast Dodhiyu enthusiast! Coming all 9 nights with my dandiya sticks ready. Looking for someone who can match the energy after 10 PM.',
        photo_url: '/garba-couple.webp',
        is_verified: true,
        preferences: {
          style: 'both',
          skill: 'pro',
          tempo: 'fast',
          steps: ['3_taali', 'dodhiyu', 'hinch'],
          intent: 'dance_only',
          wants_group: false,
          going_with_friends: true
        },
        availability: {
          nights_mask: 493, // Nights 1, 3, 5, 7, 8, 9
          venue_names: ['Shankus Garba Ground', 'Bhavani Complex']
        },
        reasons: ['🌙 6 nights in common', '🏟️ Same Garba venue', '💃 Both fast Dodhiyu']
      },
      {
        id: 'sample-2',
        is_sample: true,
        first_name: 'Aarav',
        age: 24,
        gender: 'male',
        bio: 'Traditional 2-Taali and 3-Taali dancer. Dancing with family first 3 nights, looking for a dance circle for the weekend rounds.',
        photo_url: '/garba-couple.webp',
        is_verified: true,
        preferences: {
          style: 'garba',
          skill: 'good',
          tempo: 'traditional',
          steps: ['2_taali', '3_taali', 'trikoniya'],
          intent: 'dance_friends',
          wants_group: true,
          going_with_friends: false
        },
        availability: {
          nights_mask: 218,
          venue_names: ['Heritage Garba Lawns']
        },
        reasons: ['🌙 4 nights in common', '👏 Both know 3-Taali', '🤝 Dance + friends']
      },
      {
        id: 'sample-3',
        is_sample: true,
        first_name: 'Pooja',
        age: 23,
        gender: 'female',
        bio: 'Love Dandiya Raas rounds! Intermediate skill, learning Popatiyu this season. Let\'s practice some steps before the main Aarti.',
        photo_url: '/garba-couple.webp',
        is_verified: false,
        preferences: {
          style: 'dandiya',
          skill: 'can_manage',
          tempo: 'medium',
          steps: ['3_taali', 'popatiyu'],
          intent: 'dance_only',
          wants_group: false,
          going_with_friends: true
        },
        availability: {
          nights_mask: 440,
          venue_names: ['City Palace Ground']
        },
        reasons: ['🌙 5 nights in common', '🥢 Both Dandiya fans', '⚡ Medium tempo']
      },
      {
        id: 'sample-4',
        is_sample: true,
        first_name: 'Kabir',
        age: 25,
        gender: 'male',
        bio: 'Navratri is my favorite week of the year! Non-stop dancing till the music stops. Looking for energetic partner for Dodhiyu rounds.',
        photo_url: '/garba-couple.webp',
        is_verified: true,
        preferences: {
          style: 'both',
          skill: 'pro',
          tempo: 'fast',
          steps: ['dodhiyu', 'hinch', '3_taali'],
          intent: 'dance_friends',
          wants_group: true,
          going_with_friends: true
        },
        availability: {
          nights_mask: 511, // All 9 nights
          venue_names: ['United Way Garba', 'City Lawns']
        },
        reasons: ['🌙 All 9 nights active', '⭐ Both Dodhiyu Pros', '🏟️ Same Garba venue']
      }
    ];
  }
}
