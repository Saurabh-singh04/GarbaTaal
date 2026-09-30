import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { PhotoService, MAX_PHOTOS } from './photo.service';
import { SupabaseService } from './supabase.service';
import { photoPath } from '../utils/image';

const ME = '11111111-1111-1111-1111-111111111111';

describe('PhotoService', () => {
  function configure(session: unknown, storage: Record<string, unknown> = {}) {
    const uploads: Array<{ path: string; opts: Record<string, unknown> }> = [];
    const removed: string[][] = [];
    const rows: Array<Record<string, unknown>> = [];

    const table = () => {
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'delete', 'update']) b[m] = () => b;
      b['upsert'] = (row: Record<string, unknown>) => {
        rows.push(row);
        return Promise.resolve({ error: null });
      };
      (b as { then: unknown }).then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(res);
      return b;
    };

    const db = {
      from: () => table(),
      storage: {
        from: () => ({
          upload: (path: string, _blob: unknown, opts: Record<string, unknown>) => {
            uploads.push({ path, opts });
            return Promise.resolve({ error: storage['uploadError'] ?? null });
          },
          remove: (paths: string[]) => {
            removed.push(paths);
            return Promise.resolve({ error: null });
          },
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://cdn.test/${path}` }
          })
        })
      }
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PhotoService,
        { provide: SupabaseService, useValue: { session: signal(session), db } }
      ]
    });

    return { service: TestBed.inject(PhotoService), uploads, removed, rows };
  }

  /** A real 1x1 PNG, so canvas decoding in compressImage actually succeeds. */
  function tinyPng(): File {
    const b64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new File([bytes], 'x.png', { type: 'image/png' });
  }

  it('caps the product at three photos', () => {
    // The storage maths in SETUP.md assumes three. Raising this silently
    // changes how many users fit in the 1 GB free tier.
    expect(MAX_PHOTOS).toBe(3);
  });

  it('refuses to upload when signed out', async () => {
    const { service, uploads } = configure(null);

    const ok = await service.upload(tinyPng(), 1);

    expect(ok).toBeFalse();
    expect(uploads.length).toBe(0);
    expect(service.error()).toContain('Sign in');
  });

  it('marks a signed-out visitor as preview', async () => {
    const { service } = configure(null);
    await service.load();
    expect(service.isPreview()).toBeTrue();
  });

  it('rejects a non-image without touching storage', async () => {
    const { service, uploads } = configure({ user: { id: ME } });

    const ok = await service.upload(
      new File(['not an image'], 'a.txt', { type: 'text/plain' }), 1);

    expect(ok).toBeFalse();
    expect(uploads.length).toBe(0);
    expect(service.error()).toBe('That file is not an image.');
  });

  it('uploads under the owner uuid, which is what the RLS policy checks', async () => {
    // Migration 0006 compares (storage.foldername(name))[1] to auth.uid().
    // If the uuid stops being the first path segment every upload 403s.
    const { service, uploads } = configure({ user: { id: ME } });

    await service.upload(tinyPng(), 1);

    expect(uploads.length).toBeGreaterThan(0);
    expect(uploads[0].path.split('/')[0]).toBe(ME);
  });

  it('writes a thumbnail for the main photo only', async () => {
    const first = configure({ user: { id: ME } });
    await first.service.upload(tinyPng(), 1);
    expect(first.uploads.some((u) => u.path.includes('thumb'))).toBeTrue();

    const second = configure({ user: { id: ME } });
    await second.service.upload(tinyPng(), 2);
    // Positions 2 and 3 never reach a deck card, so a thumbnail for them is
    // quota spent on bytes nothing reads.
    expect(second.uploads.some((u) => u.path.includes('thumb'))).toBeFalse();
  });

  it('cache-busts the stored URL', async () => {
    // The object is uploaded with a one-year cache on a path that gets reused,
    // so without a version the replaced photo keeps serving the old bytes.
    const { service, rows } = configure({ user: { id: ME } });

    await service.upload(tinyPng(), 1);

    const url = rows.find((r) => 'url' in r)?.['url'] as string;
    expect(url).toContain('?v=');
  });

  it('stores photos unapproved', async () => {
    const { service, rows } = configure({ user: { id: ME } });

    await service.upload(tinyPng(), 1);

    // Others must never see a photo no human has looked at.
    expect(rows.find((r) => 'is_approved' in r)?.['is_approved']).toBeFalse();
  });

  it('removes every variant and extension when deleting', async () => {
    const { service, removed } = configure({ user: { id: ME } });

    await service.remove(2);

    const paths = removed[0];
    expect(paths).toContain(photoPath(ME, 2, 'full', 'image/webp'));
    expect(paths).toContain(photoPath(ME, 2, 'thumb', 'image/webp'));
    // Browsers without WebP wrote .jpg, so deleting only .webp would leave
    // those objects orphaned and still counting against the quota.
    expect(paths).toContain(photoPath(ME, 2, 'full', 'image/jpeg'));
  });
});
