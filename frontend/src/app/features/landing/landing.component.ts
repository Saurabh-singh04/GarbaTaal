import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'gt-landing',
  standalone: true,
  template: `
    <main class="container landing">
      <header class="hero">
        <div class="mark" aria-hidden="true">ગ</div>
        <h1>GarbaTaal</h1>
        <!-- Dance-first framing, deliberately: this is the positioning that
             separates the product from the dating-adjacent apps drawing police
             attention in this category. -->
        <p class="tagline">Find your dance crew for {{ festival }}.</p>
        <p class="sub">
          Matched by the nights you're going, the ground you'll be at,
          and how you actually dance.
        </p>
      </header>

      <div class="card">
        <button
          class="btn btn-primary"
          type="button"
          [disabled]="busy()"
          (click)="signIn()">
          {{ busy() ? 'Opening Google…' : 'Continue with Google' }}
        </button>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <p class="hint legal">
          18+ only. By continuing you agree to our
          <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.
        </p>
      </div>

      <ul class="points">
        <li><strong>Dance first.</strong> Filter by Garba, Dandiya, skill and tempo.</li>
        <li><strong>Go as a group.</strong> Find a crew, not just one partner.</li>
        <li><strong>Public grounds only.</strong> Plans share a place and time — never your location.</li>
      </ul>

      <!-- Stated plainly and early. This category has an active scam problem and
           a police advisory; distancing the product from it is a feature. -->
      <p class="disclaimer">
        GarbaTaal does not rent, sell or supply partners.
        Never send money to anyone you meet here.
      </p>
    </main>
  `,
  styles: [`
    .landing { padding: 2.5rem 16px 4rem; }
    .hero { text-align: center; margin-bottom: 2rem; }

    .mark {
      width: 64px; height: 64px;
      margin: 0 auto 1rem;
      display: grid; place-items: center;
      background: var(--primary-soft);
      color: var(--primary);
      border-radius: 20px;
      font-size: 2rem; font-weight: 700;
    }

    .tagline { font-size: 1.125rem; font-weight: 600; margin-bottom: .5rem; }
    .sub { color: var(--text-muted); margin: 0; }

    .legal { text-align: center; margin-top: 1rem; }
    .legal a { color: var(--text-muted); }

    .points {
      list-style: none;
      padding: 0;
      margin: 2rem 0 0;
      display: grid; gap: .875rem;
    }
    .points li {
      padding-left: 1.5rem;
      position: relative;
      color: var(--text-muted);
      font-size: .9375rem;
    }
    .points li::before {
      content: '·';
      position: absolute; left: .4rem;
      color: var(--primary);
      font-size: 1.5rem; line-height: 1;
    }
    .points strong { color: var(--text); }

    .disclaimer {
      margin-top: 2.5rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--border);
      font-size: .8125rem;
      color: var(--text-muted);
      text-align: center;
    }
  `]
})
export class LandingComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly festival = environment.festival.name;
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async signIn(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);

    try {
      // Preserve where they were headed before the guard bounced them here.
      const next = this.route.snapshot.queryParamMap.get('next') ?? '/discover';
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

      const { error } = await this.supabase.signInWithGoogle(redirectTo);
      if (error) throw error;
      // On success the browser navigates to Google; nothing after this runs.
    } catch {
      this.error.set('Could not open Google sign-in. Check your connection and try again.');
      this.busy.set(false);
    }
  }
}
