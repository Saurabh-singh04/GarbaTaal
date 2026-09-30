import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

/**
 * The single Supabase client for the app.
 *
 * Most of GarbaTaal talks to Postgres through here rather than through the .NET
 * API, because the free-tier API container sleeps and a 40-second cold start on
 * "send request" or "open chat" is a lost user. Supabase is always awake.
 *
 * What protects this data is RLS, not this file. Anything reachable with the
 * anon key must be safe to expose to any signed-in user.
 *
 * SSR: auth is browser-only. The client's auth module reaches for localStorage
 * and a token-refresh timer, neither of which exist on the server — leaving it
 * enabled during prerendering hangs the build indefinitely. So on the server we
 * build a storage-less, timer-less client that can still read public tables
 * (cities, venues) for the prerendered SEO pages, and nothing else.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly client: SupabaseClient;

  /** Current session, as a signal so templates react without manual subscriptions. */
  readonly session = signal<Session | null>(null);

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: this.isBrowser
        ? {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        : {
            // Server: no storage to persist to, no URL to parse, and an auto-refresh
            // timer would keep the Node process alive forever.
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
    });

    if (this.isBrowser) {
      void this.client.auth.getSession().then(({ data }) => this.session.set(data.session));
      this.client.auth.onAuthStateChange((_event, session) => this.session.set(session));
    }
  }

  get db(): SupabaseClient {
    return this.client;
  }

  /**
   * Google sign-in. Supabase handles the OAuth round trip, so there is no
   * client-side Google SDK to load and no ID token to verify by hand — the
   * problem GoogleTokenValidator solves in the ResumeMatcher backend is handled
   * upstream here.
   */
  signInWithGoogle(redirectTo: string = window.location.origin) {
    return this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });
  }

  /**
   * Sign in with an ID token from Google Identity Services — the same flow
   * ResumeMatcher uses, where Google's own button hands back a credential in
   * the page and nothing navigates away.
   *
   * Two things this buys over the redirect above. The account chooser shows
   * OUR app name rather than the project's supabase.co hostname, which is the
   * single most trust-damaging thing a signed-out visitor can see. And the
   * user never leaves the page, so a half-finished onboarding survives.
   *
   * Unlike ResumeMatcher, the token is handed to Supabase rather than to our
   * own API: Supabase verifies it against Google's keys and mints the session
   * that RLS needs. Every policy keys off auth.uid(), so a token minted
   * anywhere else would leave the browser able to read nothing.
   */
  signInWithGoogleIdToken(idToken: string, nonce: string) {
    return this.client.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
      nonce
    });
  }

  async signOut(): Promise<void> {
    if (!this.isBrowser) return;
    await this.client.auth.signOut();
    this.session.set(null);
  }

  /**
   * Access token for calls to the .NET API. Reads from the live session so a
   * refreshed token is picked up automatically rather than being cached stale.
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.isBrowser) return null;
    const { data } = await this.client.auth.getSession();
    return data.session?.access_token ?? null;
  }
}
