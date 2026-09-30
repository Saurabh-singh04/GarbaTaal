import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { compressForUpload, photoPath } from '../utils/image';

/**
 * Profile photos, in Supabase Storage.
 *
 * The upload goes straight from the browser to Storage, authorized by the
 * user's own JWT against the policies in migration 0006. No server signs
 * anything, which is what keeps photo upload independent of the sleeping
 * .NET container.
 *
 * Compression happens before the upload, not after. A phone photo is ~3 MB
 * and the free tier holds 1 GB; at full size that is 330 photos for the whole
 * product. See image.ts — the 2 MB bucket ceiling is a backstop, not a plan.
 */

export const MAX_PHOTOS = 3;

export interface ProfilePhoto {
  position: number;
  url: string;
  /** False until a human approves it. Others never see an unapproved photo. */
  is_approved: boolean;
  uploading?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PhotoService {
  private readonly supabase = inject(SupabaseService);

  readonly photos = signal<ProfilePhoto[]>([]);
  readonly error = signal<string | null>(null);
  readonly busyPosition = signal<number | null>(null);
  readonly isPreview = signal(false);

  async load(): Promise<void> {
    const me = this.supabase.session()?.user?.id;

    if (!me) {
      this.isPreview.set(true);
      this.photos.set([]);
      return;
    }

    this.isPreview.set(false);
    const { data } = await this.supabase.db
      .from('photos')
      .select('position, url, is_approved')
      .eq('user_id', me)
      .order('position');

    this.photos.set((data ?? []) as ProfilePhoto[]);
  }

  /**
   * Compress, upload, record. Returns false and sets `error` on failure —
   * there is no partial success worth reporting, because a photo row pointing
   * at an object that was not stored renders as a broken image forever.
   */
  async upload(file: File, position: number): Promise<boolean> {
    const me = this.supabase.session()?.user?.id;
    if (!me) {
      this.error.set('Sign in to add photos.');
      return false;
    }

    this.error.set(null);
    this.busyPosition.set(position);

    try {
      const { full, thumb } = await compressForUpload(file, position);

      const fullPath = photoPath(me, position, 'full', full.type);
      const { error: upErr } = await this.supabase.db.storage
        .from('photos')
        .upload(fullPath, full.blob, {
          contentType: full.type,
          cacheControl: '31536000',
          // Replacing a photo reuses the path; the cache-buster below is what
          // makes the new one actually appear.
          upsert: true
        });

      if (upErr) throw upErr;

      if (thumb) {
        const thumbPath = photoPath(me, position, 'thumb', thumb.type);
        await this.supabase.db.storage
          .from('photos')
          .upload(thumbPath, thumb.blob, {
            contentType: thumb.type,
            cacheControl: '31536000',
            upsert: true
          });
      }

      const { data: pub } = this.supabase.db.storage.from('photos').getPublicUrl(fullPath);

      // A one-year cache on a path that gets reused means a replaced photo
      // would keep serving the old bytes. The version query makes each upload
      // a distinct URL to the CDN and to every browser that already cached it.
      const url = `${pub.publicUrl}?v=${Date.now()}`;

      const { error: rowErr } = await this.supabase.db
        .from('photos')
        .upsert(
          { user_id: me, position, url, is_approved: false },
          { onConflict: 'user_id,position' }
        );

      if (rowErr) throw rowErr;

      // The deck reads profiles.primary_photo_url, not the photos table, so
      // slot 1 has to be mirrored there or the card stays blank.
      if (position === 1) {
        await this.supabase.db
          .from('profiles')
          .update({ primary_photo_url: url })
          .eq('id', me);
      }

      await this.load();
      return true;
    } catch (err: unknown) {
      this.error.set(messageFor(err));
      return false;
    } finally {
      this.busyPosition.set(null);
    }
  }

  async remove(position: number): Promise<void> {
    const me = this.supabase.session()?.user?.id;
    if (!me) return;

    this.busyPosition.set(position);
    try {
      // Storage objects first. A row without objects renders broken; objects
      // without a row are invisible and cost a few KB until the next upload
      // overwrites them — the cheaper way to fail.
      await this.supabase.db.storage
        .from('photos')
        .remove([
          photoPath(me, position, 'full', 'image/webp'),
          photoPath(me, position, 'full', 'image/jpeg'),
          photoPath(me, position, 'thumb', 'image/webp'),
          photoPath(me, position, 'thumb', 'image/jpeg')
        ]);

      await this.supabase.db
        .from('photos')
        .delete()
        .eq('user_id', me)
        .eq('position', position);

      if (position === 1) {
        await this.supabase.db
          .from('profiles')
          .update({ primary_photo_url: null })
          .eq('id', me);
      }

      await this.load();
    } catch (err: unknown) {
      this.error.set(messageFor(err));
    } finally {
      this.busyPosition.set(null);
    }
  }
}

/**
 * Storage errors arrive as opaque objects. These three are the ones a user
 * can actually do something about; everything else gets a plain retry.
 */
function messageFor(err: unknown): string {
  const msg = (err as { message?: string })?.message?.toLowerCase() ?? '';

  if (msg.includes('not_an_image')) return 'That file is not an image.';
  if (msg.includes('decode_failed')) return 'That image could not be opened. Try another.';
  if (msg.includes('exceeded') || msg.includes('too large')) {
    return 'That photo is too large even after compressing. Try a different one.';
  }
  if (msg.includes('row-level security') || msg.includes('unauthorized')) {
    return 'Sign in again to add photos.';
  }
  return 'Upload failed. Try again.';
}
