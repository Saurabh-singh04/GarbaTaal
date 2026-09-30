-- ═══════════════════════════════════════════════════════════════════════════
-- Fix up a database created by the ORIGINAL 0001 (the one with venues)
--
-- 0001 was edited in place to drop the venue model before the schema was
-- meant to exist anywhere. It already existed in the live project, and
-- `create table if not exists` does NOT add columns to a table that is
-- already there — it skips the statement entirely and reports success. So a
-- database built from the old 0001 silently kept venues and never gained
-- area_ids / travel_km.
--
-- This migration brings such a database to the current shape. It is a no-op
-- on a database built from the current 0001, so it is safe in both directions
-- and safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── areas: centroid for distance scoring ─────────────────────────────────
alter table areas add column if not exists location geography(point, 4326);
create index if not exists areas_location_idx on areas using gist (location);


-- ── availability: areas + radius replace the venue list ──────────────────
alter table availability add column if not exists area_ids  integer[] not null default '{}';
alter table availability add column if not exists travel_km smallint  not null default 10;

do $$ begin
  alter table availability
    add constraint availability_travel_km_check check (travel_km between 1 and 50);
exception when duplicate_object then null;
end $$;

create index if not exists availability_areas_idx on availability using gin (area_ids);

-- Dropped last, so a failure above leaves the old column intact rather than
-- destroying availability data on a half-applied migration.
alter table availability drop column if exists venue_ids;


-- ── plans: meet in an area, not at a venue we listed ─────────────────────
alter table plans add column if not exists area_id integer references areas(id);

-- plans.venue_id was NOT NULL. Dropping it is safe only because no plan can
-- exist yet — a plan requires a match, and there are none. If that ever stops
-- being true this needs a backfill instead.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_name = 'plans' and column_name = 'venue_id')
     and exists (select 1 from plans)
  then
    raise exception 'plans has rows; venue_id -> area_id needs a backfill, not a drop';
  end if;
end $$;

alter table plans drop column if exists venue_id;

-- Enforce the new shape only once the column can actually be populated.
do $$ begin
  alter table plans alter column area_id set not null;
exception when others then null;   -- already not-null, or table still empty
end $$;

do $$ begin
  alter table plans
    add constraint plans_meeting_point_check
    check (char_length(meeting_point) between 3 and 120);
exception when duplicate_object then null;
end $$;


-- ── Remove the venue model entirely ──────────────────────────────────────
-- cascade clears the catalog_read_venues policy and any leftover FKs. By this
-- point nothing references venues: plans.venue_id is gone above.
drop policy if exists catalog_read_venues on venues;
drop table if exists venues cascade;
