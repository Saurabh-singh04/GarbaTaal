import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DiscoveryService } from './discovery.service';
import { SupabaseService } from './supabase.service';
import { ProfileService } from './profile.service';
import { PreferencesService } from './preferences.service';

/**
 * The rule these tests exist to enforce:
 *
 *   A signed-in user must NEVER be shown an invented dancer.
 *
 * An honest empty deck is recoverable. A real user who matches with someone who
 * does not exist is a screenshot, and "the profiles are fake" is the accusation
 * that ends apps in this category — the one a police advisory is already
 * circling. Nationally the thin-city case is the common one, which makes the
 * temptation to pad decks stronger, not weaker.
 */
describe('DiscoveryService', () => {
  let service: DiscoveryService;
  let session: ReturnType<typeof signal<{ user: { id: string } } | null>>;

  /** Stand-in for the PostgREST builder chain. Returns no rows. */
  const emptyDb = () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self, eq: self, neq: self, in: self, not: self,
      order: self, limit: self, gt: self,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      then: undefined
    });
    // Awaiting the chain itself yields an empty result set.
    (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
      resolve({ data: [], error: null });
    return { from: () => chain, rpc: async () => ({ data: null, error: null }) };
  };

  beforeEach(() => {
    session = signal<{ user: { id: string } } | null>(null);

    TestBed.configureTestingModule({
      providers: [
        DiscoveryService,
        { provide: SupabaseService, useValue: { session, db: emptyDb() } },
        { provide: ProfileService, useValue: { profile: signal(null) } },
        {
          provide: PreferencesService,
          useValue: { availability: signal(null), preferences: signal(null) }
        }
      ]
    });

    service = TestBed.inject(DiscoveryService);
  });

  describe('signed out', () => {
    beforeEach(async () => {
      session.set(null);
      await service.loadDeck();
    });

    it('shows the preview deck', () => {
      expect(service.deck().length).toBeGreaterThan(0);
    });

    it('marks itself as a preview so the UI can label it', () => {
      expect(service.isPreview()).toBeTrue();
    });

    it('flags EVERY card as a sample', () => {
      // If one slips through unflagged, the banner renders but that card looks
      // real. All or nothing.
      for (const c of service.deck()) {
        expect(c.is_sample).withContext(`${c.first_name} is not flagged`).toBeTrue();
      }
    });

    it('gives every sample a sample- id', () => {
      for (const c of service.deck()) {
        expect(c.id.startsWith('sample-')).withContext(c.id).toBeTrue();
      }
    });
  });

  describe('signed in with an empty database', () => {
    beforeEach(async () => {
      session.set({ user: { id: 'real-user-1' } });
      await service.loadDeck();
    });

    it('shows NO cards rather than padding with samples', () => {
      // The assertion this whole file exists for.
      expect(service.deck().length).toBe(0);
    });

    it('contains no sample dancer under any circumstance', () => {
      const samples = service.deck().filter(c => c.is_sample || c.id.startsWith('sample-'));
      expect(samples).toEqual([]);
    });

    it('is not flagged as a preview', () => {
      expect(service.isPreview()).toBeFalse();
    });

    it('explains the emptiness as a thin city, not as being caught up', () => {
      // "You're all caught up" shown to someone who has seen nobody is a lie,
      // and it removes the one action that helps: inviting friends.
      expect(service.deckState()).toBe('thin_city');
    });
  });

  describe('deck state', () => {
    it('starts ready', () => {
      expect(service.deckState()).toBe('ready');
    });

    it('reports no_nights when the user has picked no nights', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          DiscoveryService,
          {
            provide: SupabaseService,
            useValue: { session: signal({ user: { id: 'u1' } }), db: emptyDb() }
          },
          { provide: ProfileService, useValue: { profile: signal(null) } },
          {
            provide: PreferencesService,
            useValue: {
              // nights_mask 0 overlaps with nobody, so no ranking can help.
              availability: signal({ user_id: 'u1', nights_mask: 0, area_ids: [], travel_km: 10 }),
              preferences: signal(null)
            }
          }
        ]
      });

      const s = TestBed.inject(DiscoveryService);
      await s.loadDeck();

      expect(s.deckState()).toBe('no_nights');
    });
  });

  // ── Location affinity ────────────────────────────────────────────────────
  // This is the product. The user's stated motive is "on the basis of the
  // location user get the partner match", so these assertions are the spec.
  //
  // It mirrors location_affinity() in supabase/migrations/0003. If the two
  // ever disagree, the cached deck and the live deck rank differently and the
  // same two people are near-neighbours on one screen and strangers on the next.
  describe('locationAffinity', () => {
    // Private by design: nothing outside the service should be able to
    // recompute someone's reach. Tested through a cast rather than widened.
    const affinity = (myProfile: unknown, myAvail: unknown, prof: unknown, pAvail: unknown) =>
      (service as unknown as {
        locationAffinity: (a: unknown, b: unknown, c: unknown, d: unknown) => number;
      }).locationAffinity(myProfile, myAvail, prof, pAvail);

    const me = { city_id: 1, area_id: 10 };
    const noAreas = { area_ids: [], travel_km: 10 };

    it('scores a different city as zero', () => {
      // Nobody crosses cities for a garba night. A cross-city card is a card
      // that can never become an evening.
      expect(affinity(me, noAreas, { city_id: 2, area_id: 10 }, noAreas)).toBe(0);
    });

    it('scores the same area highest', () => {
      expect(affinity(me, noAreas, { city_id: 1, area_id: 10 }, noAreas)).toBe(1);
    });

    it('ranks a mutual travel overlap just below the same area', () => {
      const mine = { area_ids: [20], travel_km: 15 };
      const theirs = { area_ids: [10], travel_km: 15 };
      expect(affinity(me, mine, { city_id: 1, area_id: 20 }, theirs)).toBe(0.85);
    });

    it('ranks a one-way reach below a mutual one', () => {
      // I would travel to them; they would not travel to me. Worth showing,
      // but it must not outrank a pair who would both make the trip.
      const mine = { area_ids: [20], travel_km: 20 };
      const theirs = { area_ids: [], travel_km: 5 };
      const oneWay = affinity(me, mine, { city_id: 1, area_id: 20 }, theirs);
      const mutual = affinity(me, mine, { city_id: 1, area_id: 20 }, { area_ids: [10], travel_km: 20 });

      expect(oneWay).toBe(0.6);
      expect(oneWay).toBeLessThan(mutual);
    });

    it('still scores same-city strangers above zero', () => {
      // In a thin city this is the difference between a deck and a blank
      // screen, and same-city is a true statement about them.
      expect(affinity(me, noAreas, { city_id: 1, area_id: 99 }, noAreas)).toBe(0.3);
    });

    it('is symmetric', () => {
      // A ranks B exactly as B ranks A. Without this, one of the pair sees the
      // other near the top of the deck and never appears in theirs.
      const a = { city_id: 1, area_id: 10 };
      const b = { city_id: 1, area_id: 20 };
      const aAvail = { area_ids: [20], travel_km: 15 };
      const bAvail = { area_ids: [10], travel_km: 15 };

      expect(affinity(a, aAvail, b, bAvail)).toBe(affinity(b, bAvail, a, aAvail));
    });

    it('survives a candidate who has never set availability', () => {
      // Most real rows look like this for the first few days after launch.
      expect(affinity(me, noAreas, { city_id: 1, area_id: 10 }, null)).toBe(1);
      expect(affinity(me, null, { city_id: 1, area_id: 99 }, null)).toBe(0.3);
    });

    it('scores a missing profile as zero rather than throwing', () => {
      expect(affinity(null, noAreas, { city_id: 1, area_id: 10 }, noAreas)).toBe(0);
      expect(affinity(me, noAreas, null, noAreas)).toBe(0);
    });
  });
});
