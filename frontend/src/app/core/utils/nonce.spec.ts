import { makeNonce, randomNonce } from './nonce';

describe('nonce', () => {
  it('generates 64 hex characters (32 bytes)', () => {
    expect(randomNonce()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never repeats', () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomNonce()));
    expect(seen.size).toBe(200);
  });

  it('hashes the raw value, and the two differ', async () => {
    // The whole point: Google gets the hash, Supabase gets the raw value, and
    // Supabase hashes what it holds to compare. Sending the same string to
    // both fails with a nonce mismatch that explains nothing.
    const { raw, hashed } = await makeNonce();
    expect(raw).not.toBe(hashed);
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the SHA-256 of the raw value, hex encoded', async () => {
    const { raw, hashed } = await makeNonce();

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const expected = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    expect(hashed).toBe(expected);
  });

  it('pads single-digit bytes', async () => {
    // A byte below 0x10 rendered as one character would shift every later
    // character and silently produce a hash Supabase cannot match.
    const { hashed } = await makeNonce();
    expect(hashed.length).toBe(64);
  });
});
