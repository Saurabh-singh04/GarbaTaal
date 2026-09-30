import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatchesService, IncomingRequest } from './matches.service';
import { SupabaseService } from './supabase.service';

const ME = '11111111-1111-1111-1111-111111111111';
const THEM = '22222222-2222-2222-2222-222222222222';

/** Minimal stand-in for the PostgREST builder chain the service uses. */
function dbWith(tables: Record<string, unknown[]>, rpc?: (args: unknown) => unknown) {
  const chain = (rows: unknown[]) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gt', 'in', 'order']) {
      b[m] = () => b;
    }
    // Awaiting the builder resolves it, exactly as PostgREST does.
    (b as { then: unknown }).then = (res: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(res);
    return b;
  };

  return {
    from: (table: string) => chain(tables[table] ?? []),
    rpc: async (_name: string, args: unknown) => ({
      data: rpc ? rpc(args) : { ok: true, matched: false },
      error: null
    })
  };
}

function makeRequest(over: Partial<IncomingRequest> = {}): IncomingRequest {
  return {
    id: 'req-1',
    from: { id: THEM, first_name: 'Riya', age: 23, photo_url: null, is_verified: false },
    note: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    ...over
  };
}

function configure(db: unknown) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      MatchesService,
      { provide: SupabaseService, useValue: { session: signal({ user: { id: ME } }), db } }
    ]
  });
  return TestBed.inject(MatchesService);
}

describe('MatchesService', () => {
  describe('load', () => {
    it('splits requests into received and sent by direction', () => {
      // Both directions come back in one query because RLS allows reading a
      // request you are either side of. Getting this backwards would show
      // someone an "accept" button on their own outgoing request.
      const service = configure(
        dbWith({
          requests: [
            { id: 'a', from_user_id: THEM, to_user_id: ME, note: null,
              created_at: 'x', expires_at: 'y' },
            { id: 'b', from_user_id: ME, to_user_id: THEM, note: null,
              created_at: 'x', expires_at: 'y' }
          ],
          matches: [],
          profiles: [],
          messages: []
        })
      );

      return service.load().then(() => {
        expect(service.incoming().map((r) => r.id)).toEqual(['a']);
        expect(service.outgoing().map((r) => r.id)).toEqual(['b']);
      });
    });

    it('resolves the other person on a match from either side of the pair', async () => {
      // matches stores user_low/user_high, not me/them. Whether I am low or
      // high depends on uuid ordering, so both cases must resolve to THEM.
      const service = configure(
        dbWith({
          requests: [],
          matches: [
            { id: 'm1', user_low: ME, user_high: THEM, created_at: 'x' },
            { id: 'm2', user_low: THEM, user_high: ME, created_at: 'x' }
          ],
          profiles: [
            { id: THEM, first_name: 'Riya', date_of_birth: '2000-01-01',
              primary_photo_url: null, is_verified: true }
          ],
          messages: []
        })
      );

      await service.load();
      expect(service.matches().map((m) => m.other.id)).toEqual([THEM, THEM]);
      expect(service.matches()[0].other.first_name).toBe('Riya');
    });

    it('shows a neutral card for someone RLS will not return', async () => {
      // They blocked us, paused, or were banned between requesting and now.
      // Dropping the row would leave a request that can be neither accepted
      // nor explained.
      const service = configure(
        dbWith({
          requests: [
            { id: 'a', from_user_id: THEM, to_user_id: ME, note: null,
              created_at: 'x', expires_at: 'y' }
          ],
          matches: [],
          profiles: [],          // RLS returns nothing for THEM
          messages: []
        })
      );

      await service.load();
      expect(service.incoming().length).toBe(1);
      expect(service.incoming()[0].from.first_name).toBe('Someone');
    });

    it('takes only the newest message per thread', async () => {
      const service = configure(
        dbWith({
          requests: [],
          matches: [{ id: 'm1', user_low: ME, user_high: THEM, created_at: 'x' }],
          profiles: [
            { id: THEM, first_name: 'Riya', date_of_birth: '2000-01-01',
              primary_photo_url: null, is_verified: false }
          ],
          // Newest first, as the query orders them.
          messages: [
            { match_id: 'm1', body: 'latest',  created_at: '2026-10-02', sender_id: THEM },
            { match_id: 'm1', body: 'older',   created_at: '2026-10-01', sender_id: ME }
          ]
        })
      );

      await service.load();
      expect(service.matches()[0].last_message).toBe('latest');
    });

    it('marks their turn only when the newest message is theirs', async () => {
      const mine = dbWith({
        requests: [],
        matches: [{ id: 'm1', user_low: ME, user_high: THEM, created_at: 'x' }],
        profiles: [{ id: THEM, first_name: 'Riya', date_of_birth: '2000-01-01',
                     primary_photo_url: null, is_verified: false }],
        messages: [{ match_id: 'm1', body: 'hi', created_at: 'z', sender_id: ME }]
      });

      const service = configure(mine);
      await service.load();
      expect(service.matches()[0].their_turn).toBeFalse();
    });

    it('counts only received requests in the nav badge', async () => {
      const service = configure(
        dbWith({
          requests: [
            { id: 'a', from_user_id: THEM, to_user_id: ME, note: null, created_at: 'x', expires_at: 'y' },
            { id: 'b', from_user_id: ME, to_user_id: THEM, note: null, created_at: 'x', expires_at: 'y' }
          ],
          matches: [], profiles: [], messages: []
        })
      );

      await service.load();
      // A badge that counted your own outgoing requests would never clear.
      expect(service.pendingCount()).toBe(1);
    });
  });

  describe('respond', () => {
    it('removes the card immediately on accept', async () => {
      const service = configure(dbWith({}, () => ({ ok: true, matched: true, match_id: 'm9' })));
      service.incoming.set([makeRequest()]);

      const res = await service.respond(makeRequest(), true);

      expect(res.matched).toBeTrue();
      expect(res.match_id).toBe('m9');
      expect(service.incoming().length).toBe(0);
    });

    it('restores the card when the RPC fails for an unexplained reason', async () => {
      // Losing someone's request to a transient error is not recoverable by
      // the user — they cannot ask again, and the sender is never told.
      const service = configure(dbWith({}, () => ({ ok: false, error: 'unavailable' })));
      service.incoming.set([makeRequest()]);

      const res = await service.respond(makeRequest(), true);

      expect(res.ok).toBeFalse();
      expect(service.incoming().length).toBe(1);
    });

    it('keeps an expired request removed rather than restoring it', async () => {
      const service = configure(dbWith({}, () => ({ ok: false, error: 'expired' })));
      service.incoming.set([makeRequest()]);

      await service.respond(makeRequest(), false);

      // It genuinely is gone; putting it back would offer a decision the RPC
      // will reject every time.
      expect(service.incoming().length).toBe(0);
    });

    it('restores the card when the call throws', async () => {
      const db = {
        from: () => ({ select: () => ({}) }),
        rpc: async () => { throw new Error('offline'); }
      };
      const service = configure(db);
      service.incoming.set([makeRequest()]);

      const res = await service.respond(makeRequest(), true);

      expect(res.error).toBe('network');
      expect(service.incoming().length).toBe(1);
    });

    it('declines without reporting a match', async () => {
      const service = configure(dbWith({}, () => ({ ok: true, matched: false })));
      service.incoming.set([makeRequest()]);

      const res = await service.respond(makeRequest(), false);

      expect(res.ok).toBeTrue();
      expect(res.matched).toBeFalse();
    });
  });
});
