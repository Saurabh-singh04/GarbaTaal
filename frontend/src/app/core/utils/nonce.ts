/**
 * Nonce for the Google ID-token sign-in flow.
 *
 * Google and Supabase want the same nonce in two different forms: Google is
 * given the SHA-256 hash, and Supabase is given the raw value. Supabase then
 * hashes what it holds and compares. Send the same string to both and sign-in
 * fails with a nonce mismatch that says nothing about why.
 *
 * The point of it is replay: an ID token lifted from one page cannot be
 * presented on another, because the nonce baked into it will not match.
 */

export interface NoncePair {
  /** Sent to Supabase, in signInWithIdToken. */
  raw: string;
  /** Sent to Google, in accounts.id.initialize. */
  hashed: string;
}

/** 32 bytes of CSPRNG output, hex encoded. */
export function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export async function makeNonce(): Promise<NoncePair> {
  const raw = randomNonce();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return { raw, hashed: toHex(new Uint8Array(digest)) };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
