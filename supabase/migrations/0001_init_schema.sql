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
