/**
 * Client-side image compression, done before upload.
 *
 * This is the single decision that makes free-tier photo hosting viable. A
 * photo straight off a phone is ~3 MB; the same image at 600x800 WebP is
 * ~45 KB. At 3 MB, the 1 GB bucket holds 330 photos and a month of egress is
 * gone in an afternoon. At 45 KB it holds thousands and lasts the festival.
 *
 * It also runs in the browser, so no server is involved and the upload path
 * stays independent of the sleeping .NET container.
 */

/** Long edge of a full profile photo. Enough for a full-screen phone view. */
export const FULL_MAX_EDGE = 800;

/** Long edge of a deck thumbnail. A card never renders larger than this. */
export const THUMB_MAX_EDGE = 400;

/** WebP quality. 0.75 is where artefacts stop being visible on faces. */
export const WEBP_QUALITY = 0.75;

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  /** image/webp, or the original type if WebP is unsupported. */
  type: string;
}

/**
 * Fit within a square bound while preserving aspect ratio.
 * Never upscales — enlarging a small photo adds bytes and no detail.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };

  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

/**
 * True if this browser can actually encode WebP.
 *
 * canvas.toBlob() does not reject an unsupported type — it silently falls
 * back to PNG, which for a photo is several times LARGER than the JPEG we
 * started with. Checking first is what stops "compression" from tripling the
 * upload on an old browser.
 */
export function supportsWebp(): boolean {
  if (typeof document === 'undefined') return false;   // SSR
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

/**
 * Decode, downscale and re-encode an image file.
 *
 * Rejects rather than silently passing the original through: an upload that
 * quietly stays 3 MB would exhaust the storage quota without any visible
 * failure, and a visible error is far cheaper to diagnose.
 */
export async function compressImage(
  file: File,
  maxEdge: number = FULL_MAX_EDGE,
  quality: number = WEBP_QUALITY
): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('not_an_image');
  }

  const bitmap = await loadBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');

  // Photographs only, so quality over speed.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);

  // Release the decoded bitmap promptly — these are large, and a user
  // reordering four photos can otherwise hold several in memory at once.
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

  const type = supportsWebp() ? 'image/webp' : 'image/jpeg';
  const blob = await canvasToBlob(canvas, type, quality);

  return { blob, width, height, type };
}

/**
 * Full-size image, plus a thumbnail only when one is actually needed.
 *
 * Only the primary photo is ever rendered on a deck card, so photos 2–4 do
 * not need a thumbnail. Generating one anyway costs ~15 KB per photo of a
 * 1 GB quota that nothing will ever read — with three photos per user that
 * is the difference between roughly 5,800 and 7,000 users on the free tier.
 */
export async function compressForUpload(
  file: File,
  position: number
): Promise<{ full: CompressedImage; thumb: CompressedImage | null }> {
  const full = await compressImage(file, FULL_MAX_EDGE);
  const thumb = position === 1 ? await compressImage(file, THUMB_MAX_EDGE) : null;
  return { full, thumb };
}

/** Storage object path. Must match the RLS policy in migration 0006. */
export function photoPath(
  userId: string,
  position: number,
  variant: 'full' | 'thumb',
  type: string
): string {
  const ext = type === 'image/webp' ? 'webp' : 'jpg';
  return `${userId}/${position}-${variant}.${ext}`;
}

// ── internals ─────────────────────────────────────────────────────────────

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap applies EXIF orientation, so a portrait photo taken on
  // a phone does not arrive rotated. The <img> fallback below does not, which
  // is why it is a fallback.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Safari has shipped versions that reject the options argument.
      try {
        return await createImageBitmap(file);
      } catch {
        /* fall through */
      }
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode_failed'));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode_failed'))),
      type,
      quality
    );
  });
}
