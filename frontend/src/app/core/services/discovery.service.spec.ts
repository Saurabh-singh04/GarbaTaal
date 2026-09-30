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
              availability: signal({ user_id: 'u1', nights_mask: 0, venue_ids: [] }),
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
});
