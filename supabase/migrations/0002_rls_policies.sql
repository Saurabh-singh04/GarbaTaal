-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security
--
-- With no Supabase-side RLS there is nothing between one user and another
-- user's private messages, because the Angular client talks to Postgres
-- directly. These policies ARE the authorization layer for every read path.
--
-- Principle: deny by default, then grant the narrowest thing that works.
-- Tables with NO policy below are unreachable by `authenticated` entirely
-- and are touched only by the service role (the .NET worker / Edge Functions).
-- ═══════════════════════════════════════════════════════════════════════════

alter table cities            enable row level security;
alter table areas             enable row level security;
alter table venues            enable row level security;
alter table profiles          enable row level security;
alter table photos            enable row level security;
alter table preferences       enable row level security;
alter table availability      enable row level security;
alter table devices           enable row level security;
alter table deck_cache        enable row level security;
alter table swipes            enable row level security;
alter table requests          enable row level security;
alter table matches           enable row level security;
alter table blocks            enable row level security;
alter table messages          enable row level security;
alter table plans             enable row level security;
alter table orders            enable row level security;
alter table entitlements      enable row level security;
alter table daily_quota       enable row level security;
alter table reports           enable row level security;

-- These are service-role only. RLS is enabled and NO policy is created, so
-- `authenticated` cannot read or write them at all.
alter table bans              enable row level security;
alter table audit_log         enable row level security;
alter table webhook_events    enable row level security;
alter table contact_share_log enable row level security;


-- ── Helper: is there a block in either direction? ────────────────────────
-- A block must be symmetric in effect: the blocker disappears for the blocked
-- user too, otherwise blocking tells the other person they were blocked.
create or replace function is_blocked_pair(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function is_match_participant(m uuid, u uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from matches
    where id = m and is_active and (user_low = u or user_high = u)
  );
$$;


-- ── Catalog: public, read-only ───────────────────────────────────────────
-- Anonymous read matters: the prerendered /garba-partner/<city> SEO pages
-- are built without a logged-in user.
drop policy if exists catalog_read_cities on cities;
create policy catalog_read_cities on cities for select using (true);
drop policy if exists catalog_read_areas on areas;
create policy catalog_read_areas on areas  for select using (true);
drop policy if exists catalog_read_venues on venues;
create policy catalog_read_venues on venues for select using (true);


-- ── Profiles ─────────────────────────────────────────────────────────────
drop policy if exists profiles_read_own on profiles;
create policy profiles_read_own on profiles
  for select using (id = auth.uid());

-- Others are visible only if not banned, not paused, and no block exists.
-- date_of_birth is still readable here, so the client must never render it —
-- restrict it properly with a view before launch if you expose more fields.
drop policy if exists profiles_read_others on profiles;
create policy profiles_read_others on profiles
  for select using (
    id <> auth.uid()
    and is_banned = false
    and is_paused = false
    and not is_blocked_pair(auth.uid(), id)
  );

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles
  for insert with check (id = auth.uid());


-- ── Photos ───────────────────────────────────────────────────────────────
drop policy if exists photos_own on photos;
create policy photos_own on photos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Other people's photos only once a human has approved them. An unreviewed
-- upload is never shown to anyone.
drop policy if exists photos_read_approved on photos;
create policy photos_read_approved on photos
  for select using (
    user_id <> auth.uid()
    and is_approved = true
    and not is_blocked_pair(auth.uid(), user_id)
  );


-- ── Dance profile & availability: own write, public read ─────────────────
drop policy if exists prefs_own on preferences;
create policy prefs_own on preferences for all    using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists prefs_read on preferences;
create policy prefs_read on preferences for select using (true);
drop policy if exists avail_own on availability;
create policy avail_own on availability for all   using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists avail_read on availability;
create policy avail_read on availability for select using (true);
drop policy if exists devices_own on devices;
create policy devices_own on devices for all        using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ── Deck: strictly your own ──────────────────────────────────────────────
-- Written only by the service role (the cron deck builder).
drop policy if exists deck_read_own on deck_cache;
create policy deck_read_own on deck_cache
  for select using (user_id = auth.uid());


-- ── Swipes: yours only, and never readable by the person you swiped on ───
drop policy if exists swipes_own on swipes;
create policy swipes_own on swipes
  for all using (actor_id = auth.uid()) with check (actor_id = auth.uid());


-- ── Requests ─────────────────────────────────────────────────────────────
drop policy if exists requests_read on requests;
create policy requests_read on requests
  for select using (from_user_id = auth.uid() or to_user_id = auth.uid());

-- No INSERT/UPDATE policy on purpose: requests are created and answered ONLY
-- through the SECURITY DEFINER functions in 0003, which enforce quota, blocks
-- and the atomic mutual-match transaction. A direct insert would bypass all of it.


-- ── Matches ──────────────────────────────────────────────────────────────
drop policy if exists matches_read on matches;
create policy matches_read on matches
  for select using (user_low = auth.uid() or user_high = auth.uid());


-- ── Blocks ───────────────────────────────────────────────────────────────
drop policy if exists blocks_own on blocks;
create policy blocks_own on blocks
  for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());


-- ── Messages ─────────────────────────────────────────────────────────────
-- The single most important policy in the schema. Get this wrong and every
-- private conversation is public.
drop policy if exists messages_read on messages;
create policy messages_read on messages
  for select using (
    is_match_participant(match_id, auth.uid())
    and is_held = false
  );

drop policy if exists messages_send on messages;
create policy messages_send on messages
  for insert with check (
    sender_id = auth.uid()
    and is_match_participant(match_id, auth.uid())
  );
-- No UPDATE and no DELETE policy: messages are immutable once sent, which is
-- what makes the log worth anything when police or a report review asks.


-- ── Plans ────────────────────────────────────────────────────────────────
drop policy if exists plans_read on plans;
create policy plans_read on plans
  for select using (is_match_participant(match_id, auth.uid()));

drop policy if exists plans_write on plans;
create policy plans_write on plans
  for insert with check (
    proposed_by = auth.uid() and is_match_participant(match_id, auth.uid())
  );

drop policy if exists plans_confirm on plans;
create policy plans_confirm on plans
  for update using (is_match_participant(match_id, auth.uid()));


-- ── Commerce: read your own, write nothing ───────────────────────────────
-- Orders and entitlements are written ONLY by Edge Functions and the .NET
-- reconciler using the service role. A client that could insert an
-- entitlement row could grant itself the ₹99 pass for free.
drop policy if exists orders_read_own on orders;
create policy orders_read_own on orders       for select using (user_id = auth.uid());
drop policy if exists entitlements_read_own on entitlements;
create policy entitlements_read_own on entitlements for select using (user_id = auth.uid());
drop policy if exists quota_read_own on daily_quota;
create policy quota_read_own on daily_quota  for select using (user_id = auth.uid());


-- ── Reports: file them, see your own, never see anyone else's ────────────
drop policy if exists reports_insert on reports;
create policy reports_insert on reports
  for insert with check (reporter_id = auth.uid());

drop policy if exists reports_read_own on reports;
create policy reports_read_own on reports
  for select using (reporter_id = auth.uid());
