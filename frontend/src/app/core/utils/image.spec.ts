import { fitWithin, photoPath, supportsWebp, FULL_MAX_EDGE, THUMB_MAX_EDGE } from './image';

describe('fitWithin', () => {
  it('leaves an already-small image alone', () => {
    // Upscaling adds bytes and no detail, which is the opposite of the point.
    expect(fitWithin(300, 400, 800)).toEqual({ width: 300, height: 400 });
  });

  it('scales a portrait photo by its long edge', () => {
    expect(fitWithin(3000, 4000, 800)).toEqual({ width: 600, height: 800 });
  });

  it('scales a landscape photo by its long edge', () => {
    expect(fitWithin(4000, 3000, 800)).toEqual({ width: 800, height: 600 });
  });

  it('handles a square', () => {
    expect(fitWithin(2000, 2000, 400)).toEqual({ width: 400, height: 400 });
  });

  it('preserves aspect ratio to within a pixel', () => {
    const r = fitWithin(4032, 3024, 800);          // a real iPhone 4:3 frame
    expect(Math.abs(r.width / r.height - 4032 / 3024)).toBeLessThan(0.01);
  });

  it('never returns a zero dimension for an extreme panorama', () => {
    // 8000x200 scaled to 400 would round the short edge to 10, and a 0 here
    // would make canvas.toBlob throw at upload time.
    const r = fitWithin(8000, 200, 400);
    expect(r.width).toBe(400);
    expect(r.height).toBeGreaterThan(0);
  });

  it('returns zeroes for a degenerate input rather than dividing by zero', () => {
    expect(fitWithin(0, 0, 800)).toEqual({ width: 0, height: 0 });
  });

  it('keeps a thumbnail meaningfully smaller than a full image', () => {
    // The quota maths assumes a deck card loads the thumbnail, not the full
    // photo. If these ever converge, egress roughly quadruples.
    const full = fitWithin(3000, 4000, FULL_MAX_EDGE);
    const thumb = fitWithin(3000, 4000, THUMB_MAX_EDGE);
    expect(thumb.width * thumb.height).toBeLessThan(full.width * full.height / 3);
  });
});

describe('photoPath', () => {
  it('puts the file under the owner uuid, which is what RLS checks', () => {
    // Migration 0006 compares (storage.foldername(name))[1] to auth.uid().
    // If the uuid stops being the first path segment, every upload 403s.
    const p = photoPath('11111111-1111-1111-1111-111111111111', 1, 'full', 'image/webp');
    expect(p.split('/')[0]).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('distinguishes full from thumb in the same folder', () => {
    const u = '11111111-1111-1111-1111-111111111111';
    expect(photoPath(u, 1, 'full', 'image/webp'))
      .not.toBe(photoPath(u, 1, 'thumb', 'image/webp'));
  });

  it('uses a jpg extension when WebP is unavailable', () => {
    expect(photoPath('u', 2, 'full', 'image/jpeg')).toContain('.jpg');
    expect(photoPath('u', 2, 'full', 'image/webp')).toContain('.webp');
  });

  it('separates the four photo positions', () => {
    const u = 'abc';
    const paths = [1, 2, 3, 4].map((i) => photoPath(u, i, 'full', 'image/webp'));
    expect(new Set(paths).size).toBe(4);
  });
});

describe('supportsWebp', () => {
  it('returns a boolean without throwing', () => {
    // Guards the case that matters: toBlob() silently emits PNG for an
    // unsupported type, and a PNG photo is larger than the JPEG we started
    // with — "compression" that inflates the upload.
    expect(typeof supportsWebp()).toBe('boolean');
  });
});
