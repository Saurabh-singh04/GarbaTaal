import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SafetyService, REPORT_REASONS } from './safety.service';
import { SupabaseService } from './supabase.service';

const ME = '11111111-1111-1111-1111-111111111111';
const THEM = '22222222-2222-2222-2222-222222222222';

describe('SafetyService', () => {
  function configure(
    session: unknown,
    fail: { block?: boolean; report?: boolean } = {}
  ) {
    const calls: Array<{ table: string; op: string; row?: unknown }> = [];

    const db = {
      from: (table: string) => ({
        upsert: (row: unknown) => {
          calls.push({ table, op: 'upsert', row });
          return Promise.resolve({
            error: table === 'blocks' && fail.block ? { message: 'boom' } : null
          });
        },
        insert: (row: unknown) => {
          calls.push({ table, op: 'insert', row });
          return Promise.resolve({
            error: table === 'reports' && fail.report ? { message: 'boom' } : null
          });
        },
        delete: () => ({
          eq: () => ({
            eq: () => {
              calls.push({ table, op: 'delete' });
              return Promise.resolve({ error: null });
            }
          })
        })
      })
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        SafetyService,
        { provide: SupabaseService, useValue: { session: signal(session), db } }
      ]
    });

    return { service: TestBed.inject(SafetyService), calls };
  }

  it('lists money first among report reasons', () => {
    // It is the scam the cyber cell advisory describes and the only one with
    // a real-world financial cost. Alphabetical order would bury it.
    expect(REPORT_REASONS[0].value).toBe('asking_money');
  });

  it('blocks without requiring a reason', async () => {
    const { service, calls } = configure({ user: { id: ME } });

    const ok = await service.blockAndReport(THEM);

    expect(ok).toBeTrue();
    expect(calls.filter((c) => c.table === 'blocks').length).toBe(1);
    // Someone who wants out should get out in one tap. Demanding a reason is
    // how you make people give up and stop using the app instead.
    expect(calls.filter((c) => c.table === 'reports').length).toBe(0);
  });

  it('always blocks when reporting', async () => {
    const { service, calls } = configure({ user: { id: ME } });

    await service.blockAndReport(THEM, 'asking_money', 'wanted 500 advance');

    // Leaving a reported person able to message you while a human reviews it
    // is the wrong default for whoever just told us something is wrong.
    expect(calls.map((c) => c.table)).toEqual(['blocks', 'reports']);
  });

  it('blocks before reporting, so a failed report still protects', async () => {
    const { service, calls } = configure({ user: { id: ME } }, { report: true });

    const ok = await service.blockAndReport(THEM, 'harassment');

    expect(calls[0].table).toBe('blocks');
    // The block landed. Reporting failure must not read as "nothing happened".
    expect(ok).toBeTrue();
    expect(service.error()).toContain('Blocked');
  });

  it('reports failure when the block itself fails', async () => {
    const { service } = configure({ user: { id: ME } }, { block: true });

    const ok = await service.blockAndReport(THEM, 'harassment');

    expect(ok).toBeFalse();
    expect(service.error()).toBeTruthy();
  });

  it('refuses when signed out', async () => {
    const { service, calls } = configure(null);

    const ok = await service.blockAndReport(THEM);

    expect(ok).toBeFalse();
    expect(calls.length).toBe(0);
  });

  it('refuses to block yourself', async () => {
    const { service, calls } = configure({ user: { id: ME } });

    // The schema has CHECK (reporter_id <> reported_id); catching it here
    // avoids a confusing database error on a nonsensical tap.
    const ok = await service.blockAndReport(ME);

    expect(ok).toBeFalse();
    expect(calls.length).toBe(0);
  });

  it('trims empty details to null rather than storing whitespace', async () => {
    const { service, calls } = configure({ user: { id: ME } });

    await service.blockAndReport(THEM, 'other', '   ');

    const report = calls.find((c) => c.table === 'reports')?.row as { details: unknown };
    expect(report.details).toBeNull();
  });
});
