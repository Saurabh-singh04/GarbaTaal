-- ═══════════════════════════════════════════════════════════════════════════
-- Profile photos in Supabase Storage
--
-- Chosen over R2/ImageKit/Cloudinary for one architectural reason, not for
-- price: an upload here goes straight from the browser, authorized by the
-- user's own JWT against the policies below. Every alternative needs a
-- server to mint a signed upload token, which puts the sleeping .NET
-- container back on a path a user waits on — the one thing this design
-- exists to avoid.
--
-- The free tier gives 1 GB of storage and separate 5 GB uncached / 5 GB
-- cached egress quotas. That carries roughly 500–1,000 active dancers
-- through the nine nights, but ONLY with client-side compression: a raw
-- phone photo is ~3 MB, a 600x800 WebP is ~45 KB, and the difference is 65x.
-- See frontend/src/app/core/utils/image.ts — the limit enforced below is the
-- backstop, not the plan.
--
-- Guarded on the storage schema so this file is harmless on a plain Postgres
-- (CI applies ALL_IN_ONE.sql to a bare postgis image, which has no storage
-- schema and would otherwise fail here).
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present — skipping (expected on plain Postgres/CI)';
    return;
  end if;

  -- ── The bucket ─────────────────────────────────────────────────────────
  -- Public read: a deck card has to render a photo for someone who is not
  -- the owner, and signed URLs for every card would be a round trip per
  -- image. Moderation is enforced by photos.is_approved in the app, and an
  -- unapproved photo is simply never referenced.
  --
  -- 2 MB ceiling with compression targeting ~45 KB. It exists to stop an
  -- uncompressed upload from eating 1/500th of the quota in one go, not as
  -- the expected size.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'photos', 'photos', true, 2097152,
    array['image/webp', 'image/jpeg', 'image/png']
  )
  on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- ── Policies ───────────────────────────────────────────────────────────
  -- Path convention: photos/<user_id>/<position>.webp
  -- storage.foldername(name) splits on '/', so [1] is the owner's uuid. Every
  -- write policy below compares that folder to auth.uid(), which is what
  -- stops one user writing into another user's folder.

  drop policy if exists photos_public_read on storage.objects;
  create policy photos_public_read on storage.objects
    for select using (bucket_id = 'photos');

  drop policy if exists photos_owner_insert on storage.objects;
  create policy photos_owner_insert on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  drop policy if exists photos_owner_update on storage.objects;
  create policy photos_owner_update on storage.objects
    for update to authenticated
    using (
      bucket_id = 'photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  -- Deleting your own photo has to work: "take my picture down" is a request
  -- we must never make someone email us about.
  drop policy if exists photos_owner_delete on storage.objects;
  create policy photos_owner_delete on storage.objects
    for delete to authenticated
    using (
      bucket_id = 'photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  raise notice 'storage bucket "photos" configured';
end $$;
