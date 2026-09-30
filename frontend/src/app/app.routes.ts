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
    // Ungated, like /discover. Signed out it renders a labelled example so the
    // whole product can be walked through before anyone commits to an account;
    // RLS returns nothing real to an anonymous client either way.
    path: 'matches',
    loadComponent: () =>
      import('./features/matches/matches.component').then(m => m.MatchesComponent),
    title: 'Your people — GarbaTaal'
  },
  {
    path: 'profile/photos',
    loadComponent: () =>
      import('./features/photos/photo-manager.component').then(m => m.PhotoManagerComponent),
    title: 'Your photos — GarbaTaal'
  },
  {
    path: 'chat/:matchId',
    loadComponent: () =>
      import('./features/chat/chat.component').then(m => m.ChatComponent),
    title: 'Chat — GarbaTaal'
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
