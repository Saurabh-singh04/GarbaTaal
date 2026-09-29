import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ProfileService } from './profile.service';
import { SupabaseService } from './supabase.service';
import { Profile } from '../models/profile.model';

/**
 * ProfileService decides whether a user is onboarded, banned or paying. Every
 * guard and the entire paywall read off it, so its state machine is worth
 * pinning down.
 */
describe('ProfileService', () => {
  let service: ProfileService;
  let session: ReturnType<typeof signal<{ user: { id: string } } | null>>;

  const profileFor = (over: Partial<Profile> = {}): Profile => ({
    id: 'user-1',
    first_name: 'Riya',
    date_of_birth: '2000-01-01',
    gender: 'female',
    looking_for: ['male'],
    city_id: 1,
    area_id: null,
    bio: null,
    primary_photo_url: null,
    pass_expires_at: null,
    is_verified: false,
    is_banned: false,
    is_paused: false,
    last_active_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...over
  });

  beforeEach(() => {
    session = signal<{ user: { id: string } } | null>(null);

    TestBed.configureTestingModule({
      providers: [
        ProfileService,
        { provide: SupabaseService, useValue: { session, db: {} } }
      ]
    });

    service = TestBed.inject(ProfileService);
  });

  describe('state', () => {
    it('is loading until the first load settles', () => {
      expect(service.state()).toBe('loading');
    });

    it('is signed_out with no session', () => {
      service.loading.set(false);
      expect(service.state()).toBe('signed_out');
    });

    it('is needs_onboarding for a signed-in user with no profile row', () => {
      // The state that exists between Google sign-in and a created profile.
      // Treating it as an error here would send every new user to a dead end.
      session.set({ user: { id: 'user-1' } });
      service.loading.set(false);
      service.profile.set(null);

      expect(service.state()).toBe('needs_onboarding');
    });

    it('is ready for a complete profile', () => {
      session.set({ user: { id: 'user-1' } });
      service.loading.set(false);
      service.profile.set(profileFor());

      expect(service.state()).toBe('ready');
    });

    it('is banned for a banned profile', () => {
      session.set({ user: { id: 'user-1' } });
      service.loading.set(false);
      service.profile.set(profileFor({ is_banned: true }));

      expect(service.state()).toBe('banned');
    });
  });

  describe('hasPass', () => {
    it('is false when no pass was ever bought', () => {
      service.profile.set(profileFor({ pass_expires_at: null }));
      expect(service.hasPass()).toBeFalse();
    });

    it('is true while the pass is in date', () => {
      const future = new Date(Date.now() + 86_400_000).toISOString();
      service.profile.set(profileFor({ pass_expires_at: future }));

      expect(service.hasPass()).toBeTrue();
    });

    it('is false once the festival has ended', () => {
      // Reverting to free must be silent and automatic — no "your subscription
      // ended" moment for a product that only exists for nine nights.
      const past = new Date(Date.now() - 86_400_000).toISOString();
      service.profile.set(profileFor({ pass_expires_at: past }));

      expect(service.hasPass()).toBeFalse();
    });

    it('is false with no profile at all', () => {
      service.profile.set(null);
      expect(service.hasPass()).toBeFalse();
    });
  });

  describe('create', () => {
    it('refuses when nobody is signed in', async () => {
      await expectAsync(service.create({
        first_name: 'Riya', date_of_birth: '2000-01-01', gender: 'female',
        looking_for: ['male'], city_id: 1, area_id: null, photo: null
      })).toBeRejectedWithError('not_signed_in');
    });

    it('refuses an under-18 date of birth', async () => {
      session.set({ user: { id: 'user-1' } });
      const underage = new Date();
      underage.setFullYear(underage.getFullYear() - 15);

      await expectAsync(service.create({
        first_name: 'Kid',
        date_of_birth: underage.toISOString().slice(0, 10),
        gender: 'male', looking_for: ['female'], city_id: 1, area_id: null, photo: null
      })).toBeRejectedWithError('under_18');
    });

    it('refuses without a city', async () => {
      session.set({ user: { id: 'user-1' } });

      await expectAsync(service.create({
        first_name: 'Riya', date_of_birth: '2000-01-01', gender: 'female',
        looking_for: ['male'], city_id: null, area_id: null, photo: null
      })).toBeRejectedWithError('city_required');
    });
  });

  it('clear() drops the cached profile on sign-out', () => {
    service.profile.set(profileFor());
    service.clear();
    expect(service.profile()).toBeNull();
  });
});
