import {
  Component, ElementRef, inject, signal, input, output,
  AfterViewInit, OnDestroy, PLATFORM_ID, viewChild
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseService } from '../core/services/supabase.service';
import { makeNonce } from '../core/utils/nonce';
import { environment } from '../../environments/environment';

declare const google: any;

const GIS_SRC = 'https://accounts.google.com/gsi/client';

/**
 * Google's own rendered sign-in button — the same approach as ResumeMatcher's
 * auth modal, with the client id living in environment.ts rather than in a
 * dashboard.
 *
 * The credential goes to Supabase instead of to our API, so the session it
 * produces is one RLS understands. See SupabaseService.signInWithGoogleIdToken.
 *
 * GIS does not always render: ad blockers, strict tracking protection and
 * embedded webviews all break it, and it fails silently. So this always
 * exposes a plain fallback that uses the redirect flow, rather than leaving
 * someone staring at an empty box with no way in.
 */
@Component({
  selector: 'gt-google-signin',
  standalone: true,
  template: `
    <div class="gs-wrap">
      <div #host class="gs-host" [class.gs-hidden]="!rendered()"></div>

      @if (!rendered()) {
        <button type="button" class="gs-fallback" [disabled]="busy()" (click)="redirectSignIn()">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {{ busy() ? 'Opening Google…' : label() }}
        </button>
      }

      @if (error(); as e) {
        <p class="gs-error" role="alert">{{ e }}</p>
      }
    </div>
  `,
  styles: [`
    .gs-wrap { display: grid; gap: .5rem; justify-items: stretch; }
    .gs-host { min-height: 0; }
    .gs-hidden { display: none; }

    .gs-fallback {
      display: inline-flex; align-items: center; justify-content: center; gap: .6rem;
      width: 100%; padding: .85rem 1.25rem;
      background: #fff; color: #1f1f1f;
      border: 1px solid #dadce0; border-radius: .6rem;
      font: inherit; font-weight: 600; cursor: pointer;
    }
    .gs-fallback:hover:not(:disabled) { background: #f7f8f8; }
    .gs-fallback:disabled { opacity: .6; cursor: default; }
    .gs-fallback:focus-visible { outline: 2px solid #f59e0b; outline-offset: 2px; }

    .gs-error { margin: 0; font-size: .82rem; color: #ff8686; text-align: center; }
  `]
})
export class GoogleSigninButtonComponent implements AfterViewInit, OnDestroy {
  private readonly supabase = inject(SupabaseService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');

  /** Where to land after a successful sign-in. */
  readonly next = input('/discover');
  readonly label = input('Start free with Google');

  readonly signedIn = output<void>();

  readonly rendered = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  private rawNonce = '';
  private resizeObserver?: ResizeObserver;

  async ngAfterViewInit(): Promise<void> {
    if (!this.isBrowser) return;
    if (!environment.googleClientId || environment.googleClientId.startsWith('REPLACE')) {
      // Not configured yet: leave the fallback button, which still works via
      // the redirect flow once the provider is enabled.
      return;
    }

    try {
      await loadGis();
      const { raw, hashed } = await makeNonce();
      this.rawNonce = raw;

      google.accounts.id.initialize({
        client_id: environment.googleClientId,
        callback: (res: { credential?: string }) => void this.onCredential(res),
        // Google receives the HASH; Supabase receives the raw value below.
        nonce: hashed,
        auto_select: false,
        cancel_on_tap_outside: true,
        // FedCM is the only path that still works once third-party cookies are
        // gone, which is already the default in several browsers.
        use_fedcm_for_prompt: true
      });

      this.renderButton();

      // Google's button is rendered at a fixed pixel width, so it does not
      // reflow with its container. Re-render on resize or it sits at the old
      // width after an orientation change.
      this.resizeObserver = new ResizeObserver(() => this.renderButton());
      this.resizeObserver.observe(this.host().nativeElement);

      this.rendered.set(true);
    } catch {
      // Blocked, offline, or an embedded webview. The fallback stays visible.
      this.rendered.set(false);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private renderButton(): void {
    const el = this.host().nativeElement;
    const width = Math.min(400, Math.max(200, el.clientWidth || 320));

    google.accounts.id.renderButton(el, {
      theme: 'filled_blue',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      width
    });
  }

  private async onCredential(res: { credential?: string }): Promise<void> {
    if (!res?.credential) {
      this.error.set('Google did not return a sign-in. Please try again.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);

    try {
      const { error } = await this.supabase.signInWithGoogleIdToken(
        res.credential,
        this.rawNonce
      );

      if (error) {
        // The two that actually happen: the client id is not in Supabase's
        // allowed list, or the nonce did not survive a reload.
        this.error.set(
          error.message?.toLowerCase().includes('nonce')
            ? 'That sign-in expired. Please try again.'
            : 'Could not complete sign-in. Please try again.'
        );
        return;
      }

      this.signedIn.emit();
      window.location.assign(this.next());
    } catch {
      this.error.set('Could not complete sign-in. Check your connection.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Full-page redirect via Supabase. Used when GIS cannot render. */
  async redirectSignIn(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const redirectTo =
        `${window.location.origin}/auth/callback?next=${encodeURIComponent(this.next())}`;
      const { error } = await this.supabase.signInWithGoogle(redirectTo);
      if (error) throw error;
    } catch {
      this.error.set('Could not open Google sign-in. Check your connection.');
      this.busy.set(false);
    }
  }
}

/** Loads the GIS script once, shared across every instance on the page. */
let gisPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (gisPromise) return gisPromise;

  gisPromise = new Promise<void>((resolve, reject) => {
    if (typeof google !== 'undefined' && google?.accounts?.id) return resolve();

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('gis_failed')));
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('gis_failed'));
    document.head.appendChild(script);
  }).catch((e) => {
    // Let a later attempt retry rather than caching the failure forever.
    gisPromise = null;
    throw e;
  });

  return gisPromise;
}
