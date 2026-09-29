import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PLATFORM_ID } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { SupabaseService } from '../services/supabase.service';
import { ProfileService } from '../services/profile.service';

/**
 * Requires a signed-in user.
 *
 * These guards are UX, not security. Anyone can edit the JS bundle and route
 * themselves anywhere — what actually protects data is RLS in Postgres. The
 * guard exists so a signed-out user sees the landing page instead of an empty
 * deck that silently returns zero rows.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const platformId = inject(PLATFORM_ID);
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  // During SSR there is no session in the request, so every guarded route would
  // redirect and prerender the landing page instead of the real one. Let it
  // through on the server; the browser re-evaluates on hydration.
  if (isPlatformServer(platformId)) return true;

  if (supabase.session()) return true;

  return router.createUrlTree(['/'], {
    queryParams: { next: state.url }
  });
};

/**
 * Requires a completed profile. Sends a signed-in user with no profile row into
 * onboarding rather than into a half-working app.
 */
export const onboardedGuard: CanActivateFn = async (_route, state) => {
  const platformId = inject(PLATFORM_ID);
  const supabase = inject(SupabaseService);
  const profiles = inject(ProfileService);
  const router = inject(Router);

  if (isPlatformServer(platformId)) return true;

  if (!supabase.session()) {
    return router.createUrlTree(['/'], { queryParams: { next: state.url } });
  }

  const profile = profiles.profile() ?? await profiles.load();

  if (!profile) return router.createUrlTree(['/onboarding']);
  if (profile.is_banned) return router.createUrlTree(['/suspended']);

  return true;
};

/**
 * The inverse: keeps a fully onboarded user out of the onboarding flow, so
 * re-running it cannot overwrite an existing profile.
 */
export const notOnboardedGuard: CanActivateFn = async () => {
  const platformId = inject(PLATFORM_ID);
  const supabase = inject(SupabaseService);
  const profiles = inject(ProfileService);
  const router = inject(Router);

  if (isPlatformServer(platformId)) return true;

  if (!supabase.session()) return router.createUrlTree(['/']);

  const profile = profiles.profile() ?? await profiles.load();

  return profile ? router.createUrlTree(['/discover']) : true;
};
