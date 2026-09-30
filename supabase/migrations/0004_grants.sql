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
-- prerendered /garba-partner/<city> SEO pages are built from.
grant select on cities, areas to anon;

-- Signed-in users. RLS narrows every one of these to their own rows.
grant select, insert, update, delete on
  profiles, photos, preferences, availability, devices,
  swipes, blocks, messages, plans, reports
to authenticated;

grant select on
  cities, areas, deck_cache, requests, matches,
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
grant execute on function location_affinity(uuid, uuid)    to authenticated;
grant execute on function expire_old_requests()            to service_role;
