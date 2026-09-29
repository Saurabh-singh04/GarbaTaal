-- Local-only stub of the pieces of Supabase that the migrations depend on.
-- Supabase provides `auth.users` and `auth.uid()` in a real project; this
-- lets `docker run postgres` verify the migrations without a Supabase project.
--
-- NEVER applied to a real environment — it lives in supabase/test/, not
-- supabase/migrations/.

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- In Supabase this reads the JWT claim. Locally it returns a settable value
-- so RLS policies can be exercised as different users in tests.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- The roles Supabase creates for you.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role bypassrls;
  end if;
end $$;
