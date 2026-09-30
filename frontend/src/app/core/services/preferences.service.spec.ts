import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { PreferencesService } from './preferences.service';
import { SupabaseService } from './supabase.service';
import { Availability } from '../models/profile.model';
import { ALL_NIGHTS_MASK, nightsToMask } from '../utils/nights';

describe('PreferencesService', () => {
  let service: PreferencesService;
  let session: ReturnType<typeof signal<{ user: { id: string } } | null>>;
  let upserted: Record<string, unknown> | null;

  const availabilityFor = (mask: number): Availability =>
    ({ user_id: 'user-1', nights_mask: mask, area_ids: [], travel_km: 10 });

  beforeEach(() => {
    session = signal<{ user: { id: string } } | null>({ user: { id: 'user-1' } });
    upserted = null;

    // Minimal stand-in for the PostgREST builder chain used by the service.
    const db = {
      from: () => ({
        upsert: (row: Record<string, unknown>) => {
          upserted = row;
          return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
        }
      })
    };

    TestBed.configureTestingModule({
      providers: [
        PreferencesService,
        { provide: SupabaseService, useValue: { session, db } }
      ]
    });

    service = TestBed.inject(PreferencesService);
  });

  describe('saveAvailability', () => {
    it('stores a normal mask unchanged', async () => {
      await service.saveAvailability(nightsToMask([1, 3, 5]), [], 10);
      expect(upserted!['nights_mask']).toBe(nightsToMask([1, 3, 5]));
    });

    it('clamps a mask wider than nine nights', async () => {
      // The schema has CHECK (nights_mask between 0 and 511). Without the clamp
      // this would be a failed insert at save time rather than a silent fix.
      await service.saveAvailability(0b1111111111111, [], 10);
      expect(upserted!['nights_mask']).toBe(ALL_NIGHTS_MASK);
    });

    it('accepts an empty selection', async () => {
      await service.saveAvailability(0, [], 10);
      expect(upserted!['nights_mask']).toBe(0);
    });

    it('stores the areas the user will travel to', async () => {
      await service.saveAvailability(nightsToMask([2]), [7, 9], 10);
      expect(upserted!['area_ids']).toEqual([7, 9]);
    });

    it('clamps a travel radius above the schema maximum', async () => {
      // CHECK (travel_km between 1 and 50). Clamping here turns a rejected
      // save into a saved profile with a sane radius.
      await service.saveAvailability(nightsToMask([2]), [], 999);
      expect(upserted!['travel_km']).toBe(50);
    });

    it('clamps a travel radius below the schema minimum', async () => {
      await service.saveAvailability(nightsToMask([2]), [], 0);
      expect(upserted!['travel_km']).toBe(1);
    });

    it('rounds a fractional radius', async () => {
      await service.saveAvailability(nightsToMask([2]), [], 7.6);
      expect(upserted!['travel_km']).toBe(8);
    });

    it('refuses when nobody is signed in', async () => {
      session.set(null);
      await expectAsync(service.saveAvailability(1, [], 10)).toBeRejectedWithError('not_signed_in');
    });
  });

  describe('savePreferences', () => {
    it('always writes the owning user id', async () => {
      // The row is keyed on user_id, and RLS checks it. Omitting it would let a
      // caller attempt to write someone else's preferences.
      await service.savePreferences({ skill: 'pro' });
      expect(upserted!['user_id']).toBe('user-1');
      expect(upserted!['skill']).toBe('pro');
    });

    it('refuses when nobody is signed in', async () => {
      session.set(null);
      await expectAsync(service.savePreferences({ skill: 'pro' }))
        .toBeRejectedWithError('not_signed_in');
    });
  });

  describe('isComplete', () => {
    it('is false before any night is picked', () => {
      // A zero mask overlaps with nobody, so such a user can never be matched.
      service.availability.set(availabilityFor(0));
      expect(service.isComplete()).toBeFalse();
    });

    it('is true once at least one night is picked', () => {
      service.availability.set(availabilityFor(nightsToMask([4])));
      expect(service.isComplete()).toBeTrue();
    });

    it('is false with no availability row at all', () => {
      service.availability.set(null);
      expect(service.isComplete()).toBeFalse();
    });
  });

  it('clear() drops both signals on sign-out', () => {
    service.availability.set(availabilityFor(ALL_NIGHTS_MASK));
    service.clear();
    expect(service.availability()).toBeNull();
    expect(service.preferences()).toBeNull();
  });
});
