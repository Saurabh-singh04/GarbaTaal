import { Routes } from '@angular/router';
import { authGuard, onboardedGuard, notOnboardedGuard } from './core/guards/auth.guard';

/**
 * Every feature route is lazy. The ResumeMatcher frontend shipped a 1.19 MB
 * initial bundle before it was split; starting lazy avoids paying that down
 * later, and matters more here — users open this on mobile data, at a garba
 * ground, on a network shared by thousands of people.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/landing/landing.component').then(m => m.LandingComponent),
    title: 'GarbaTaal — Find your dance crew for Navratri'
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./features/auth/callback.component').then(m => m.AuthCallbackComponent),
    title: 'Signing in… — GarbaTaal'
  },
  {
    path: 'onboarding',
    canActivate: [authGuard, notOnboardedGuard],
    loadComponent: () =>
      import('./features/onboarding/onboarding.component').then(m => m.OnboardingComponent),
    title: 'Set up your profile — GarbaTaal'
  },

  // ── Built next (modules 4 and 6) ────────────────────────────────────────
  {
    path: 'profile/dance',
    canActivate: [authGuard, onboardedGuard],
    loadComponent: () =>
      import('./features/dance-profile/dance-profile.component').then(m => m.DanceProfileComponent),
    title: 'Dance profile — GarbaTaal'
  },
  {
    // Deliberately UNGUARDED. Signed out, this renders a labelled preview so
    // someone can feel the product before committing — the single highest-
    // leverage thing on a competitor's page. Real data is never at risk here:
    // RLS returns nothing to an anonymous client, and DiscoveryService serves
    // clearly-flagged sample dancers instead of querying for people.
    path: 'discover',
    loadComponent: () =>
      import('./features/discover/discover.component').then(m => m.DiscoverComponent),
    title: 'Discover — GarbaTaal'
  },
  {
    // Guarded, unlike /discover: there is nothing meaningful to preview here,
    // and RLS would return an empty inbox to a signed-out visitor anyway.
    path: 'matches',
    canActivate: [authGuard, onboardedGuard],
    loadComponent: () =>
      import('./features/matches/matches.component').then(m => m.MatchesComponent),
    title: 'Your people — GarbaTaal'
  },
  {
    path: 'suspended',
    loadComponent: () =>
      import('./features/placeholder/placeholder.component').then(m => m.PlaceholderComponent),
    data: {
      heading: 'Account suspended',
      note: 'This account has been suspended for breaking our community guidelines.'
    },
    title: 'Account suspended — GarbaTaal'
  },

  { path: '**', redirectTo: '' }
];
