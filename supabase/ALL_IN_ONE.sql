-- ═══════════════════════════════════════════════════════════════════════════
-- GarbaTaal — COMPLETE DATABASE SETUP
--
-- Paste this WHOLE file into the Supabase SQL Editor and press Run. Once.
--
--   https://supabase.com/dashboard/project/ufnnymmxocwdlnzmhcpv/sql/new
--
-- Contains every migration plus the location seed, already in order:
--   0001 schema · 0002 RLS · 0003 functions · 0004 grants · seed cities/areas
--
-- Safe to re-run: enums are guarded, tables and indexes use IF NOT EXISTS,
-- policies and triggers are dropped first, and the seed uses ON CONFLICT.
--
-- GENERATED FILE — do not edit. Change supabase/migrations/* and run
--   bash supabase/build-all-in-one.sh
-- ═══════════════════════════════════════════════════════════════════════════


-- #########################################################################
-- ## 0001_init_schema.sql
-- #########################################################################

-- ═══════════════════════════════════════════════════════════════════════════
-- GarbaTaal — core schema
--
-- Design constraints this schema is built around:
--   1. The .NET container SLEEPS on the free tier. Anything a user waits on
--      must be answerable by Postgres alone.
--   2. Free tier = 500 MB. Every column earns its place; photos live in R2
--      and only their URLs live here.
--   3. Navratri is exactly 9 nights, so "which nights" is a 9-bit integer,
--      not a join table. Overlap becomes a bitwise AND — indexable and tiny.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";
create extension if not exists postgis;      -- venue/user proximity ("near me")

-- ── Enums ────────────────────────────────────────────────────────────────
-- Enums over text+check: they cost 4 bytes instead of a string per row, and
-- a typo becomes a migration error instead of a silent bug in a WHERE clause.

do $$ begin
  create type gender as enum ('male', 'female', 'other');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type dance_style as enum ('garba', 'dandiya', 'both');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type skill_level as enum ('beginner', 'can_manage', 'good', 'pro');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type tempo_pref as enum ('traditional', 'medium', 'fast');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type user_intent as enum ('dance_only', 'dance_friends', 'open');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type request_status as enum ('pending', 'accepted', 'declined', 'expired');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type report_status as enum ('open', 'reviewing', 'actioned', 'dismissed');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type ban_kind as enum ('shadow', 'hard');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type order_status as enum ('created', 'attempted', 'paid', 'failed', 'expired', 'refunded');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type entitlement_kind as enum ('season_pass', 'verified_badge');
exception when duplicate_object then null;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- CATALOG — cities, areas, venues. Public read, admin write.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists cities (
  id          serial primary key,
  name        text not null,
  state       text not null,
  slug        text not null unique,          -- drives /garba-partner/<slug> SEO pages
  is_live     boolean not null default false, -- launch one district at a time
  created_at  timestamptz not null default now()
);

create table if not exists areas (
  id          serial primary key,
  city_id     integer not null references cities(id) on delete cascade,
  name        text not null,
  slug        text not null,
  unique (city_id, slug)
);

create table if not exists venues (
  id            serial primary key,
  city_id       integer not null references cities(id) on delete cascade,
  area_id       integer references areas(id) on delete set null,
  name          text not null,
  slug          text not null unique,
  address       text,
  location      geography(point, 4326),      -- PostGIS: enables ST_DWithin "near me"
  organizer     text,
  pass_price_inr integer,
  nights_mask   integer not null default 511, -- 511 = 0b111111111 = all 9 nights
  -- B2B fields. is_featured is what a sponsoring venue pays for.
  is_featured   boolean not null default false,
  is_claimed    boolean not null default false,
  claimed_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists venues_city_idx     on venues (city_id, area_id);
create index if not exists venues_location_idx on venues using gist (location);


-- ═══════════════════════════════════════════════════════════════════════════
-- IDENTITY
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists profiles (
  -- id IS the Supabase auth user id. One row per account, no separate mapping
  -- table, and RLS policies can compare directly against auth.uid().
  id            uuid primary key references auth.users(id) on delete cascade,

  first_name    text not null,               -- first name only; surnames are never displayed
  date_of_birth date not null,               -- stored for the 18+ gate, never shown to others
  gender        gender not null,
  looking_for   gender[] not null default '{male,female,other}',

  city_id       integer not null references cities(id),
  area_id       integer references areas(id),
  location      geography(point, 4326),      -- coarse (area centroid), never live GPS

  bio           text check (char_length(bio) <= 150),
  primary_photo_url text,                    -- R2 URL; free egress, unlike Supabase Storage

  -- Denormalised hot-path flags. Every quota check reads these instead of
  -- joining entitlements — it matters when the deck is built for every user.
  pass_expires_at timestamptz,
  is_verified   boolean not null default false,
  is_banned     boolean not null default false,
  is_paused     boolean not null default false,

  last_active_at timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- The 18+ gate, enforced by the database rather than by client-side code.
  constraint adult_only check (date_of_birth <= (current_date - interval '18 years'))
);

create index if not exists profiles_discovery_idx on profiles (city_id, area_id)
  where is_banned = false and is_paused = false;

create table if not exists photos (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  url         text not null,                 -- Cloudflare R2
  position    smallint not null check (position between 1 and 4),
  is_approved boolean not null default false, -- manual review queue feeds this
  created_at  timestamptz not null default now(),
  unique (user_id, position)
);

-- The dance profile. This is the differentiator — no live competitor matches
-- on steps, skill or tempo, and it is what keeps the product dance-first
-- rather than dating-first.
create table if not exists preferences (
  user_id      uuid primary key references profiles(id) on delete cascade,
  style        dance_style not null default 'both',
  skill        skill_level not null default 'beginner',
  tempo        tempo_pref  not null default 'medium',
  steps        text[] not null default '{}',  -- 2_taali, 3_taali, dodhiyu, hinch, popatiyu, trikoniya
  intent       user_intent not null default 'dance_only',
  wants_group  boolean not null default false,
  going_with_friends boolean not null default false,
  verified_only_messages boolean not null default false, -- women-first safety control
  updated_at   timestamptz not null default now()
);

-- Which of the 9 nights, and where. nights_mask bit N = night N.
create table if not exists availability (
  user_id     uuid primary key references profiles(id) on delete cascade,
  nights_mask integer not null default 0 check (nights_mask between 0 and 511),
  venue_ids   integer[] not null default '{}',
  updated_at  timestamptz not null default now()
);

create index if not exists availability_nights_idx on availability (nights_mask) where nights_mask > 0;

create table if not exists devices (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  fcm_token   text not null unique,
  platform    text not null default 'web',
  created_at  timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════
-- MATCHING
-- ═══════════════════════════════════════════════════════════════════════════

-- Precomputed decks. This table is why discovery works while the .NET
-- container is asleep: reading it is one indexed lookup, and the expensive
-- scoring happens in a cron job three times a night.
create table if not exists deck_cache (
  user_id      uuid not null references profiles(id) on delete cascade,
  candidate_id uuid not null references profiles(id) on delete cascade,
  rank         integer not null,
  score        numeric(5,4) not null,
  -- Shown in the UI: "3 nights together · same ground · both Dodhiyu".
  -- Explaining WHY is what makes this read as a dance app, not a dating app.
  reasons      jsonb not null default '[]',
  built_at     timestamptz not null default now(),
  primary key (user_id, candidate_id)
);

create index if not exists deck_cache_rank_idx on deck_cache (user_id, rank);

create table if not exists swipes (
  actor_id   uuid not null references profiles(id) on delete cascade,
  target_id  uuid not null references profiles(id) on delete cascade,
  liked      boolean not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, target_id)   -- also makes "already seen" an index hit
);


-- ═══════════════════════════════════════════════════════════════════════════
-- CONNECTIONS
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists requests (
  id           uuid primary key default uuid_generate_v4(),
  from_user_id uuid not null references profiles(id) on delete cascade,
  to_user_id   uuid not null references profiles(id) on delete cascade,
  note         text check (char_length(note) <= 100),
  status       request_status not null default 'pending',
  -- 48h expiry: in a 9-night festival a request that sits for a week is dead
  -- weight, and expiring them keeps the received list worth opening.
  expires_at   timestamptz not null default (now() + interval '48 hours'),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (from_user_id, to_user_id),         -- idempotent: no double requests
  check (from_user_id <> to_user_id)
);

create index if not exists requests_inbox_idx on requests (to_user_id, status, created_at desc);

-- Canonical ordered pair. Two people accepting at the same instant would
-- otherwise create two chat rooms; the CHECK + UNIQUE make that impossible
-- at the database level, so no application lock is needed.
create table if not exists matches (
  id         uuid primary key default uuid_generate_v4(),
  user_low   uuid not null references profiles(id) on delete cascade,
  user_high  uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  is_active  boolean not null default true,
  check (user_low < user_high),
  unique (user_low, user_high)
);

create index if not exists matches_user_low_idx  on matches (user_low)  where is_active;
create index if not exists matches_user_high_idx on matches (user_high) where is_active;

create table if not exists blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);


-- ═══════════════════════════════════════════════════════════════════════════
-- MESSAGING — delivered by Supabase Realtime, policed by triggers
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists messages (
  id          uuid primary key default uuid_generate_v4(),
  match_id    uuid not null references matches(id) on delete cascade,
  sender_id   uuid not null references profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  -- Set by trigger when the body contains a contact detail, or a contact
  -- detail together with payment language (the "rent a partner" scam shape).
  flagged_reason text,
  is_held     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists messages_thread_idx on messages (match_id, created_at desc);

-- Meeting plans: ground + time + a PUBLIC meeting point. Never live location,
-- never GPS. This is the safety posture and the off-platform retention play
-- in one feature.
create table if not exists plans (
  id            uuid primary key default uuid_generate_v4(),
  match_id      uuid not null references matches(id) on delete cascade,
  proposed_by   uuid not null references profiles(id) on delete cascade,
  venue_id      integer not null references venues(id),
  night_number  smallint not null check (night_number between 1 and 9),
  meet_at       timestamptz not null,
  meeting_point text not null,               -- "main gate", "food stall row"
  is_confirmed  boolean not null default false,
  created_at    timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════
-- COMMERCE — ₹99 Navratri Pass
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists orders (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references profiles(id) on delete cascade,
  razorpay_order_id text unique,
  amount_paise      integer not null check (amount_paise >= 100),
  product           entitlement_kind not null,
  status            order_status not null default 'created',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists orders_pending_idx on orders (status, created_at)
  where status in ('created', 'attempted');   -- the reconciler's sweep index

-- The ledger. Rows, not a boolean on profiles: it gives an audit trail, makes
-- a refund a revoke, and lets support comp a user without touching account state.
create table if not exists entitlements (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references profiles(id) on delete cascade,
  kind            entitlement_kind not null,
  granted_at      timestamptz not null default now(),
  expires_at      timestamptz,
  -- THE idempotency key. The fast path (signature verify), the webhook and the
  -- reconciler all try to grant; this unique index makes running all three safe.
  source_order_id uuid references orders(id) on delete set null,
  source          text not null default 'purchase',
  unique (source_order_id, kind)
);

-- Insert-first, process-after. A duplicate webhook delivery hits this unique
-- index and becomes a no-op — idempotency you cannot forget to implement.
create table if not exists webhook_events (
  id             uuid primary key default uuid_generate_v4(),
  provider_event_id text not null unique,
  event_type     text not null,
  payload        jsonb not null,
  received_at    timestamptz not null default now(),
  processed_at   timestamptz
);

-- Date-keyed so there is NO nightly reset job. A missed reset on a sleeping
-- backend would mean nobody can send requests on night four.
create table if not exists daily_quota (
  user_id       uuid not null references profiles(id) on delete cascade,
  quota_date    date not null default current_date,
  requests_used smallint not null default 0,
  primary key (user_id, quota_date)
);


-- ═══════════════════════════════════════════════════════════════════════════
-- TRUST & SAFETY
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists reports (
  id            uuid primary key default uuid_generate_v4(),
  reporter_id   uuid not null references profiles(id) on delete cascade,
  reported_id   uuid not null references profiles(id) on delete cascade,
  reason        text not null,   -- fake_profile, harassment, asking_money, nudity, underage, other
  details       text,
  message_id    uuid references messages(id) on delete set null,
  status        report_status not null default 'open',
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  check (reporter_id <> reported_id)
);

create index if not exists reports_queue_idx on reports (status, created_at);

create table if not exists bans (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       ban_kind not null,   -- 'shadow' preferred: they keep using an app nobody sees,
  reason     text not null,       -- instead of immediately creating account #2
  until      timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Append-only. No UPDATE or DELETE policy exists for this table anywhere.
create table if not exists audit_log (
  id         bigserial primary key,
  actor_id   uuid,
  action     text not null,
  subject_id uuid,
  detail     jsonb,
  created_at timestamptz not null default now()
);

-- Counts how many DISTINCT people a user has sent a contact detail to.
-- One-to-one exchange is the product working; one-to-forty is the scam.
-- That ratio, not the text itself, is the signal worth acting on.
create table if not exists contact_share_log (
  actor_id    uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (actor_id, recipient_id)
);


-- #########################################################################
-- ## 0002_rls_policies.sql
-- #########################################################################

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


-- #########################################################################
-- ## 0003_functions_and_triggers.sql
-- #########################################################################

-- ═══════════════════════════════════════════════════════════════════════════
-- Critical-path logic, in Postgres
--
-- These run as SECURITY DEFINER functions rather than .NET endpoints because
-- the free-tier container sleeps. Sending a request and accepting a match are
-- things a user waits on, so they cannot depend on a 40-second cold start.
--
-- They are also the ONLY way to write to `requests` and `matches` — there is
-- no INSERT policy on those tables, so quota, blocks and the mutual-match
-- transaction cannot be bypassed by a crafted client call.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Shared nights between two 9-bit masks ────────────────────────────────
create or replace function shared_nights(a integer, b integer)
returns integer language sql immutable as $$
  select bit_count((a & b)::bit(9));
$$;


-- ── Does this user have an active paid pass? ─────────────────────────────
create or replace function has_active_pass(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select pass_expires_at > now() from profiles where id = u), false);
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- send_request — the paywalled action
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function send_request(target_id uuid, note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me            uuid := auth.uid();
  free_limit    smallint;
  used          smallint;
  is_paid       boolean;
  reverse_req   requests%rowtype;
  new_match_id  uuid;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if me = target_id then
    return jsonb_build_object('ok', false, 'error', 'self_request');
  end if;

  -- Banned either way, or blocked either way: fail with a vague error.
  -- Never tell someone they were blocked — that turns blocking into a message.
  if exists (select 1 from profiles where id in (me, target_id) and is_banned)
     or is_blocked_pair(me, target_id)
     or not exists (select 1 from profiles where id = target_id and not is_paused)
  then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;

  is_paid := has_active_pass(me);

  if not is_paid then
    -- Day one gets 10 so a new user can see the product work before hitting a
    -- wall; after that 5/day. Women are unlimited — they are the supply side,
    -- and charging them collapses the ratio the whole app depends on.
    select case
             when p.gender = 'female' then 32767::smallint
             when p.created_at::date = current_date then 10::smallint
             else 5::smallint
           end
      into free_limit
      from profiles p where p.id = me;

    -- Atomic upsert-and-increment. One statement, so two concurrent taps
    -- cannot both spend the last request.
    insert into daily_quota (user_id, quota_date, requests_used)
    values (me, current_date, 1)
    on conflict (user_id, quota_date) do update
      set requests_used = daily_quota.requests_used + 1
      where daily_quota.requests_used < free_limit
    returning requests_used into used;

    if used is null then
      return jsonb_build_object('ok', false, 'error', 'quota_exhausted',
                                'limit', free_limit, 'paywall', 'out_of_requests');
    end if;
  end if;

  -- Did they already request US? Then this is a mutual yes — make the match
  -- here, in the same transaction, instead of waiting for them to accept.
  select * into reverse_req from requests
   where from_user_id = target_id and to_user_id = me and status = 'pending';

  if found then
    update requests set status = 'accepted', responded_at = now()
     where id = reverse_req.id;

    insert into matches (user_low, user_high)
    values (least(me, target_id), greatest(me, target_id))
    on conflict (user_low, user_high) do update set is_active = true
    returning id into new_match_id;

    return jsonb_build_object('ok', true, 'matched', true, 'match_id', new_match_id);
  end if;

  insert into requests (from_user_id, to_user_id, note)
  values (me, target_id, note)
  on conflict (from_user_id, to_user_id) do nothing;

  insert into swipes (actor_id, target_id, liked) values (me, target_id, true)
  on conflict do nothing;

  return jsonb_build_object('ok', true, 'matched', false);
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- respond_to_request — accept creates the match atomically
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function respond_to_request(request_id uuid, accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  req    requests%rowtype;
  mid    uuid;
begin
  select * into req from requests
   where id = request_id and to_user_id = me and status = 'pending'
   for update;                                  -- row lock: no double-accept

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if req.expires_at < now() then
    update requests set status = 'expired' where id = req.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  update requests
     set status = case when accept then 'accepted' else 'declined' end::request_status,
         responded_at = now()
   where id = req.id;

  if not accept then
    return jsonb_build_object('ok', true, 'matched', false);
  end if;

  -- least()/greatest() + the UNIQUE(user_low, user_high) constraint is what
  -- makes simultaneous accepts produce ONE chat room instead of two.
  insert into matches (user_low, user_high)
  values (least(me, req.from_user_id), greatest(me, req.from_user_id))
  on conflict (user_low, user_high) do update set is_active = true
  returning id into mid;

  return jsonb_build_object('ok', true, 'matched', true, 'match_id', mid);
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Message policy — enforced by trigger, not by application code
-- ═══════════════════════════════════════════════════════════════════════════

-- Strips the separators people use to evade a naive regex, so "9 8 7 6 5..."
-- and "98765.43210" both normalise to the same digit run.
create or replace function looks_like_contact(body text)
returns boolean language plpgsql immutable as $$
declare normalized text;
begin
  normalized := regexp_replace(lower(body), '[\s\.\-\(\)_]', '', 'g');
  return normalized ~ '[6-9][0-9]{9}'          -- Indian mobile
      or normalized ~ '\+?91[6-9][0-9]{9}'
      or normalized ~ '(insta|snap|telegram|whatsapp|wa\.me)';
end;
$$;

create or replace function mentions_money(body text)
returns boolean language sql immutable as $$
  select lower(body) ~ '(₹|rs\.?|rupee|paisa|advance|booking|upi|gpay|paytm|phonepe|package|payment|charge)';
$$;

create or replace function enforce_message_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count  integer;
  my_msgs       integer;
  their_msgs    integer;
  active_convos integer;
  other_id      uuid;
begin
  if exists (select 1 from profiles where id = new.sender_id and is_banned) then
    raise exception 'account_suspended';
  end if;

  -- Flood control: 20 messages/minute is generous for a real person and
  -- ruinous for a script.
  select count(*) into recent_count from messages
   where sender_id = new.sender_id and created_at > now() - interval '1 minute';
  if recent_count >= 20 then
    raise exception 'rate_limited';
  end if;

  -- Free tier: 2 active conversations. Two (not one) so that match #2 is not
  -- ghosted — a woman who matches and then gets silence concludes the app is
  -- fake, and that costs more than the ₹99 it might earn.
  if not has_active_pass(new.sender_id) then
    select count(distinct match_id) into active_convos
      from messages where sender_id = new.sender_id and match_id <> new.match_id;
    if active_convos >= 2 then
      raise exception 'conversation_limit';
    end if;
  end if;

  -- Contact sharing: delayed, not blocked. A real pair clears 10 messages each
  -- in one evening; a spammer working 40 profiles will not invest that.
  if looks_like_contact(new.body) then
    select count(*) into my_msgs    from messages where match_id = new.match_id and sender_id = new.sender_id;
    select count(*) into their_msgs from messages where match_id = new.match_id and sender_id <> new.sender_id;

    if my_msgs < 10 or their_msgs < 10 then
      new.is_held := true;
      new.flagged_reason := 'contact_too_early';
    end if;

    -- Contact details AND payment language together is the "rent a partner"
    -- scam shape the cyber cell is looking at. Always held, always reviewed.
    if mentions_money(new.body) then
      new.is_held := true;
      new.flagged_reason := 'contact_with_payment';
    end if;

    select case when m.user_low = new.sender_id then m.user_high else m.user_low end
      into other_id from matches m where m.id = new.match_id;

    -- One-to-one exchange is the product working. One-to-forty is the scam.
    -- This table is what tells them apart.
    insert into contact_share_log (actor_id, recipient_id)
    values (new.sender_id, other_id) on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_policy on messages;
create trigger messages_policy before insert on messages
  for each row execute function enforce_message_policy();


-- ── Keep the denormalised hot-path flag in sync with the ledger ──────────
create or replace function sync_pass_expiry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'season_pass' then
    update profiles set pass_expires_at = new.expires_at where id = new.user_id;
  elsif new.kind = 'verified_badge' then
    update profiles set is_verified = true where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists entitlements_sync on entitlements;
create trigger entitlements_sync after insert on entitlements
  for each row execute function sync_pass_expiry();


-- ── Expire stale requests (called by the nightly cron) ───────────────────
create or replace function expire_old_requests()
returns integer language sql security definer set search_path = public as $$
  with done as (
    update requests set status = 'expired'
     where status = 'pending' and expires_at < now()
    returning 1
  ) select count(*)::integer from done;
$$;


-- #########################################################################
-- ## 0004_grants.sql
-- #########################################################################

-- ═══════════════════════════════════════════════════════════════════════════
-- Explicit privilege grants.
--
-- Supabase sets default privileges so that tables created through its dashboard
-- are granted to anon/authenticated/service_role automatically. Tables created
-- by a raw migration may not pick those up depending on how the migration is
-- applied — and the failure mode is confusing: RLS policies look correct but
-- every query returns "permission denied for table".
--
-- Granting explicitly makes behaviour identical locally, in CI and in production.
-- RLS still decides WHICH ROWS are visible; these grants only decide whether the
-- role may address the table at all.
-- ═══════════════════════════════════════════════════════════════════════════

grant usage on schema public to anon, authenticated, service_role;

-- Anonymous: only the public catalog, and only for reading. This is what the
-- prerendered city/venue SEO pages are built from.
grant select on cities, areas, venues to anon;

-- Signed-in users. RLS narrows every one of these to their own rows.
grant select, insert, update, delete on
  profiles, photos, preferences, availability, devices,
  swipes, blocks, messages, plans, reports
to authenticated;

grant select on
  cities, areas, venues, deck_cache, requests, matches,
  orders, entitlements, daily_quota
to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- The service role bypasses RLS entirely; it is used only by the .NET worker
-- and Edge Functions, never by the browser.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- The RPCs are the only path that may write to requests/matches.
grant execute on function send_request(uuid, text)        to authenticated;
grant execute on function respond_to_request(uuid, boolean) to authenticated;
grant execute on function shared_nights(integer, integer)  to authenticated, anon;
grant execute on function expire_old_requests()            to service_role;


-- #########################################################################
-- ## 0001_cities_areas.sql
-- #########################################################################

-- ═══════════════════════════════════════════════════════════════════════════
-- Cities and areas — pan-India
--
-- Tiering via cities.is_live, which the app already respects (CatalogService
-- filters on it, and onboarding only offers live cities):
--
--   Tier A  is_live = true   launch markets, seeded with areas and venues
--   Tier B  is_live = false  real garba culture, thinner data — fast follow
--   Tier C  is_live = false  SEO capture + waitlist; flip to true when density
--                            arrives
--
-- Ahmedabad / Gandhinagar / Vadodara / Surat are deliberately NOT live. The
-- incumbent holds indexed city pages there; fighting for those four first
-- wastes the one advantage we have, which is that the rest of India is open.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tier A: launch ────────────────────────────────────────────────────────
insert into cities (name, state, slug, is_live) values
  ('Rajkot',      'Gujarat',        'rajkot',      true),
  ('Mumbai',      'Maharashtra',    'mumbai',      true),
  ('Pune',        'Maharashtra',    'pune',        true),
  ('Indore',      'Madhya Pradesh', 'indore',      true),
  ('Jaipur',      'Rajasthan',      'jaipur',      true),
  ('Thane',       'Maharashtra',    'thane',       true),
  ('Delhi',       'Delhi',          'delhi',       true),
  ('Bengaluru',   'Karnataka',      'bengaluru',   true),
  ('Hyderabad',   'Telangana',      'hyderabad',   true),
  ('Bhopal',      'Madhya Pradesh', 'bhopal',      true)
on conflict (slug) do nothing;

-- ── Tier B: fast follow ───────────────────────────────────────────────────
insert into cities (name, state, slug, is_live) values
  ('Nashik',      'Maharashtra',    'nashik',      false),
  ('Nagpur',      'Maharashtra',    'nagpur',      false),
  ('Navi Mumbai', 'Maharashtra',    'navi-mumbai', false),
  ('Udaipur',     'Rajasthan',      'udaipur',     false),
  ('Jodhpur',     'Rajasthan',      'jodhpur',     false),
  ('Bhavnagar',   'Gujarat',        'bhavnagar',   false),
  ('Jamnagar',    'Gujarat',        'jamnagar',    false),
  ('Anand',       'Gujarat',        'anand',       false),
  ('Ujjain',      'Madhya Pradesh', 'ujjain',      false),
  ('Gurugram',    'Haryana',        'gurugram',    false),
  ('Noida',       'Uttar Pradesh',  'noida',       false),
  ('Jabalpur',    'Madhya Pradesh', 'jabalpur',    false)
on conflict (slug) do nothing;

-- ── Tier C: SEO capture + waitlist ────────────────────────────────────────
insert into cities (name, state, slug, is_live) values
  ('Ahmedabad',   'Gujarat',        'ahmedabad',   false),
  ('Gandhinagar', 'Gujarat',        'gandhinagar', false),
  ('Vadodara',    'Gujarat',        'vadodara',    false),
  ('Surat',       'Gujarat',        'surat',       false),
  ('Junagadh',    'Gujarat',        'junagadh',    false),
  ('Gandhidham',  'Gujarat',        'gandhidham',  false),
  ('Kota',        'Rajasthan',      'kota',        false),
  ('Chennai',     'Tamil Nadu',     'chennai',     false),
  ('Kolkata',     'West Bengal',    'kolkata',     false),
  ('Lucknow',     'Uttar Pradesh',  'lucknow',     false),
  ('Chandigarh',  'Chandigarh',     'chandigarh',  false),
  ('Ghaziabad',   'Uttar Pradesh',  'ghaziabad',   false)
on conflict (slug) do nothing;


-- ═══════════════════════════════════════════════════════════════════════════
-- Areas for the five focus cities.
--
-- Areas do the work GPS is not allowed to do: they let "near me" mean
-- something without ever tracking anyone. Real neighbourhood names matter —
-- a user picks the one they actually say out loud.
-- ═══════════════════════════════════════════════════════════════════════════

insert into areas (city_id, name, slug)
select c.id, a.name, a.slug
from cities c
join (values
  -- Rajkot
  ('rajkot', 'Kalavad Road',         'kalavad-road'),
  ('rajkot', 'University Road',      'university-road'),
  ('rajkot', 'Race Course',          'race-course'),
  ('rajkot', 'Gondal Road',          'gondal-road'),
  ('rajkot', 'Mavdi',                'mavdi'),
  ('rajkot', 'Raiya Road',           'raiya-road'),
  ('rajkot', '150 Feet Ring Road',   '150-feet-ring-road'),
  ('rajkot', 'Jamnagar Road',        'jamnagar-road'),

  -- Mumbai
  ('mumbai', 'Borivali',             'borivali'),
  ('mumbai', 'Kandivali',            'kandivali'),
  ('mumbai', 'Malad',                'malad'),
  ('mumbai', 'Andheri',              'andheri'),
  ('mumbai', 'Vile Parle',           'vile-parle'),
  ('mumbai', 'Dadar',                'dadar'),
  ('mumbai', 'Ghatkopar',            'ghatkopar'),
  ('mumbai', 'Mulund',               'mulund'),
  ('mumbai', 'Chembur',              'chembur'),
  ('mumbai', 'Bandra Kurla Complex', 'bkc'),
  ('mumbai', 'Sion',                 'sion'),

  -- Pune
  ('pune',   'Kothrud',              'kothrud'),
  ('pune',   'Baner',                'baner'),
  ('pune',   'Aundh',                'aundh'),
  ('pune',   'Hinjewadi',            'hinjewadi'),
  ('pune',   'Wakad',                'wakad'),
  ('pune',   'Viman Nagar',          'viman-nagar'),
  ('pune',   'Kharadi',              'kharadi'),
  ('pune',   'Hadapsar',             'hadapsar'),
  ('pune',   'Camp',                 'camp'),

  -- Indore
  ('indore', 'Vijay Nagar',          'vijay-nagar'),
  ('indore', 'Palasia',              'palasia'),
  ('indore', 'AB Road',              'ab-road'),
  ('indore', 'Bhawarkuan',           'bhawarkuan'),
  ('indore', 'Rau',                  'rau'),
  ('indore', 'Sudama Nagar',         'sudama-nagar'),
  ('indore', 'Scheme 78',            'scheme-78'),

  -- Jaipur
  ('jaipur', 'Malviya Nagar',        'malviya-nagar'),
  ('jaipur', 'Vaishali Nagar',       'vaishali-nagar'),
  ('jaipur', 'C-Scheme',             'c-scheme'),
  ('jaipur', 'Mansarovar',           'mansarovar'),
  ('jaipur', 'Jagatpura',            'jagatpura'),
  ('jaipur', 'Tonk Road',            'tonk-road'),
  ('jaipur', 'Bani Park',            'bani-park')
) as a(city_slug, name, slug) on a.city_slug = c.slug
on conflict (city_id, slug) do nothing;


-- ── Areas for the remaining live cities ───────────────────────────────────
-- A live city with no areas cannot do location matching beyond "same city",
-- which in Delhi or Bengaluru is useless — Rohini to Saket is 30 km.
insert into areas (city_id, name, slug)
select c.id, a.name, a.slug
from cities c
join (values
  -- Delhi
  ('delhi',     'Rohini',            'rohini'),
  ('delhi',     'Dwarka',            'dwarka'),
  ('delhi',     'Pitampura',         'pitampura'),
  ('delhi',     'Janakpuri',         'janakpuri'),
  ('delhi',     'Karol Bagh',        'karol-bagh'),
  ('delhi',     'Lajpat Nagar',      'lajpat-nagar'),
  ('delhi',     'Saket',             'saket'),
  ('delhi',     'Vasant Kunj',       'vasant-kunj'),
  ('delhi',     'Mayur Vihar',       'mayur-vihar'),
  ('delhi',     'Preet Vihar',       'preet-vihar'),

  -- Bengaluru
  ('bengaluru', 'Indiranagar',       'indiranagar'),
  ('bengaluru', 'Koramangala',       'koramangala'),
  ('bengaluru', 'Whitefield',        'whitefield'),
  ('bengaluru', 'Jayanagar',         'jayanagar'),
  ('bengaluru', 'HSR Layout',        'hsr-layout'),
  ('bengaluru', 'Marathahalli',      'marathahalli'),
  ('bengaluru', 'Rajajinagar',       'rajajinagar'),
  ('bengaluru', 'Malleshwaram',      'malleshwaram'),
  ('bengaluru', 'Electronic City',   'electronic-city'),
  ('bengaluru', 'Yelahanka',         'yelahanka'),

  -- Hyderabad
  ('hyderabad', 'Gachibowli',        'gachibowli'),
  ('hyderabad', 'Madhapur',          'madhapur'),
  ('hyderabad', 'Kukatpally',        'kukatpally'),
  ('hyderabad', 'Banjara Hills',     'banjara-hills'),
  ('hyderabad', 'Jubilee Hills',     'jubilee-hills'),
  ('hyderabad', 'Secunderabad',      'secunderabad'),
  ('hyderabad', 'Miyapur',           'miyapur'),
  ('hyderabad', 'Ameerpet',          'ameerpet'),
  ('hyderabad', 'Kondapur',          'kondapur'),

  -- Thane
  ('thane',     'Ghodbunder Road',   'ghodbunder-road'),
  ('thane',     'Vartak Nagar',      'vartak-nagar'),
  ('thane',     'Naupada',           'naupada'),
  ('thane',     'Kolshet',           'kolshet'),
  ('thane',     'Majiwada',          'majiwada'),
  ('thane',     'Wagle Estate',      'wagle-estate'),
  ('thane',     'Kasarvadavali',     'kasarvadavali'),

  -- Bhopal
  ('bhopal',    'Arera Colony',      'arera-colony'),
  ('bhopal',    'MP Nagar',          'mp-nagar'),
  ('bhopal',    'Kolar Road',        'kolar-road'),
  ('bhopal',    'Shahpura',          'shahpura'),
  ('bhopal',    'New Market',        'new-market'),
  ('bhopal',    'Hoshangabad Road',  'hoshangabad-road'),
  ('bhopal',    'Bairagarh',         'bairagarh')
) as a(city_slug, name, slug) on a.city_slug = c.slug
on conflict (city_id, slug) do nothing;
