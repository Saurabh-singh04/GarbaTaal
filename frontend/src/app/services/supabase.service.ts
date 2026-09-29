import { Injectable, signal } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/**
 * The single Supabase client for the app.
 *
 * Most of GarbaTaal talks to Postgres through here rather than through the .NET
 * API, because the free-tier API container sleeps and a 40-second cold start on
 * "send request" or "open chat" is a lost user. Supabase is always awake.
 *
 * What protects this data is RLS, not this file. Anything reachable with the
 * anon key must be safe to expose to any signed-in user.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly client: SupabaseClient;

  /** Current session, as a signal so templates can react without manual subscriptions. */
  readonly session = signal<Session | null>(null);

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    this.client.auth.getSession().then(({ data }) => this.session.set(data.session));
    this.client.auth.onAuthStateChange((_event, session) => this.session.set(session));
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

  signOut() {
    return this.client.auth.signOut();
  }

  /**
   * Access token for calls to the .NET API. Reads from the live session so a
   * refreshed token is picked up automatically rather than being cached stale.
   */
  async getAccessToken(): Promise<string | null> {
    const { data } = await this.client.auth.getSession();
    return data.session?.access_token ?? null;
  }
}
