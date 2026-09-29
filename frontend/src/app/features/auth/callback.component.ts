import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { ProfileService } from '../../core/services/profile.service';

/**
 * Where Google sends the user back to.
 *
 * The Supabase client parses the session out of the URL itself
 * (detectSessionInUrl), so this screen only waits for that to land, then decides
 * whether the user needs onboarding or goes straight into the app.
 */
@Component({
  selector: 'gt-auth-callback',
  standalone: true,
  template: `
    <main class="container centre">
      @if (error()) {
        <h1>Sign-in didn't complete</h1>
        <p class="hint">{{ error() }}</p>
        <button class="btn btn-primary" (click)="retry()">Try again</button>
      } @else {
        <div class="spinner" aria-hidden="true"></div>
        <p class="hint" role="status">Signing you in…</p>
      }
    </main>
  `,
  styles: [`
    .centre {
      min-height: 70vh;
      display: grid; place-content: center; justify-items: center;
      text-align: center; gap: 1rem;
    }
    .spinner {
      width: 32px; height: 32px;
      border: 3px solid var(--border);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class AuthCallbackComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly profiles = inject(ProfileService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const next = this.route.snapshot.queryParamMap.get('next') ?? '/discover';

    // The SDK resolves the session asynchronously after parsing the URL, so poll
    // briefly rather than assuming it is ready on the first tick.
    const session = await this.waitForSession();

    if (!session) {
      this.error.set('We couldn’t confirm your Google account. Please try signing in again.');
      return;
    }

    const profile = await this.profiles.load();
    await this.router.navigateByUrl(profile ? next : '/onboarding');
  }

  retry(): void {
    void this.router.navigate(['/']);
  }

  private async waitForSession(timeoutMs = 8000): Promise<unknown> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (this.supabase.session()) return this.supabase.session();
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    return null;
  }
}
