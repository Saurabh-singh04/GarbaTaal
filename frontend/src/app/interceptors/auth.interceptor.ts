import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { SupabaseService } from '../core/services/supabase.service';
import { environment } from '../../environments/environment';

/**
 * Attaches the signed-in user's Supabase access token to API calls.
 *
 * Replaces ResumeMatcher's api-key.interceptor, which sent one shared X-Api-Key
 * for every user. That key ships in the browser bundle, so it proves nothing
 * about who is calling — the backend there identifies users by an email in the
 * request body instead. Fine for a resume tool, fatal for an app with private
 * chat.
 *
 * Here the token is per-user, signed by Supabase, short-lived, and validated
 * server-side against the JWT secret.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Only our own API. Never leak the user's token to Razorpay, R2 or any CDN.
  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }

  const supabase = inject(SupabaseService);

  return from(supabase.getAccessToken()).pipe(
    switchMap(token => {
      if (!token) {
        return next(req);
      }
      return next(req.clone({
        setHeaders: { Authorization: `Bearer ${token}` }
      }));
    })
  );
};
