-- ═══════════════════════════════════════════════════════════════════════════
-- RLS policy tests
--
-- The Angular client talks to Postgres directly, so these policies ARE the
-- authorization layer. A mistake here is a full data breach — every private
-- message readable by anyone — and it is a one-line error that reviews miss.
--
-- Run automatically in CI. Any failure raises and fails the build.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

create or replace function assert_eq(actual bigint, expected bigint, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL: % — expected %, got %', label, expected, actual;
  end if;
  raise notice '  ok: %', label;
end;
$$;

-- ── Seed as superuser (bypasses RLS) ─────────────────────────────────────
-- Its own city with a reserved slug, so these tests do not collide with the
-- real seed in supabase/seed/. Referenced by slug below, never by a hardcoded
-- id, because seeded rows shift the sequence.
insert into cities (name, state, slug, is_live)
values ('RLS Test City', 'TEST', 'rls-test-city', false)
on conflict (slug) do nothing;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'carol@test.local');

insert into profiles (id, first_name, date_of_birth, gender, city_id)
select v.id, v.first_name, v.dob, v.gender, c.id
from (values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Alice', '2000-01-01'::date, 'female'::gender),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'Bob',   '1999-01-01'::date, 'male'::gender),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'Carol', '1998-01-01'::date, 'female'::gender)
) as v(id, first_name, dob, gender)
cross join (select id from cities where slug = 'rls-test-city') c;

-- Alice and Bob are matched. Carol is not.
insert into matches (id, user_low, user_high) values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  least('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid),
  greatest('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid)
);

insert into messages (match_id, sender_id, body) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'hi bob'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'hi alice');

insert into deck_cache (user_id, candidate_id, rank, score) values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 1, 0.9);

insert into orders (id, user_id, amount_paise, product, status) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 9900, 'season_pass', 'paid');

insert into entitlements (user_id, kind, source_order_id)
  values ('11111111-1111-1111-1111-111111111111', 'season_pass', 'bbbbbbbb-0000-0000-0000-000000000001');


-- ── Helper: act as a given user ──────────────────────────────────────────
create or replace function act_as(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
end;
$$;


\echo ''
\echo '── messages: only participants ──'

select act_as('11111111-1111-1111-1111-111111111111');
set role authenticated;
select assert_eq((select count(*) from messages), 2, 'Alice sees both messages in her match');
reset role;

select act_as('22222222-2222-2222-2222-222222222222');
set role authenticated;
select assert_eq((select count(*) from messages), 2, 'Bob sees both messages in his match');
reset role;

select act_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
-- THE critical assertion. If this ever returns > 0, every private conversation
-- in the app is readable by any signed-in user.
select assert_eq((select count(*) from messages), 0, 'Carol sees NOTHING of Alice and Bob''s chat');
select assert_eq((select count(*) from matches), 0, 'Carol cannot see a match she is not in');
reset role;


\echo ''
\echo '── deck_cache: strictly your own ──'

select act_as('11111111-1111-1111-1111-111111111111');
set role authenticated;
select assert_eq((select count(*) from deck_cache), 1, 'Alice sees her own deck');
reset role;

select act_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
select assert_eq((select count(*) from deck_cache), 0, 'Carol cannot read Alice''s deck');
reset role;


\echo ''
\echo '── commerce: cannot read, cannot self-grant ──'

select act_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
select assert_eq((select count(*) from entitlements), 0, 'Carol cannot see Alice''s entitlements');
select assert_eq((select count(*) from orders), 0, 'Carol cannot see Alice''s orders');

do $$
begin
  -- If this INSERT ever succeeds, anyone can grant themselves the ₹99 pass.
  insert into entitlements (user_id, kind)
  values ('33333333-3333-3333-3333-333333333333', 'season_pass');
  raise exception 'FAIL: a user granted themselves an entitlement';
exception
  when insufficient_privilege then raise notice '  ok: cannot self-grant an entitlement';
end $$;
reset role;


\echo ''
\echo '── blocks are symmetric ──'

insert into blocks (blocker_id, blocked_id)
values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333');

select act_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
-- Carol must not see Alice at all. A block that only hides the blocked user
-- tells the blocker's target that they were blocked.
select assert_eq(
  (select count(*) from profiles where id = '11111111-1111-1111-1111-111111111111'),
  0, 'Blocked user cannot see the blocker''s profile');
reset role;

select act_as('11111111-1111-1111-1111-111111111111');
set role authenticated;
select assert_eq(
  (select count(*) from profiles where id = '33333333-3333-3333-3333-333333333333'),
  0, 'Blocker cannot see the blocked user either');
reset role;


\echo ''
\echo '── admin tables are unreachable ──'

select act_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
do $$
begin
  perform count(*) from audit_log;
  raise exception 'FAIL: audit_log is readable by a normal user';
exception
  when insufficient_privilege then raise notice '  ok: audit_log unreachable';
end $$;

do $$
begin
  perform count(*) from bans;
  raise exception 'FAIL: bans is readable by a normal user';
exception
  when insufficient_privilege then raise notice '  ok: bans unreachable';
end $$;
reset role;


\echo ''
\echo '── requests cannot be forged directly ──'

select act_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
do $$
begin
  -- No INSERT policy exists: requests may only be created through send_request(),
  -- which enforces quota, blocks and ban checks.
  insert into requests (from_user_id, to_user_id)
  values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222');
  raise exception 'FAIL: a request was inserted directly, bypassing quota and blocks';
exception
  when insufficient_privilege then raise notice '  ok: direct request insert blocked';
end $$;
reset role;


\echo ''
\echo '── 18+ gate is enforced by the database ──'

do $$
begin
  insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'kid@test.local');
  insert into profiles (id, first_name, date_of_birth, gender, city_id)
  select '44444444-4444-4444-4444-444444444444', 'Kid', current_date - interval '15 years', 'male', id
  from cities where slug = 'rls-test-city';
  raise exception 'FAIL: an under-18 profile was created';
exception
  when check_violation then raise notice '  ok: under-18 profile rejected';
end $$;


\echo ''
\echo '── message policy: contact + payment is held ──'

insert into messages (match_id, sender_id, body)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'send 500 advance on gpay 9876543210');

select assert_eq(
  (select count(*) from messages where flagged_reason = 'contact_with_payment' and is_held),
  1, 'Scam-shaped message (contact + payment) is held');

select assert_eq(
  (select looks_like_contact('call me on 98765 43210')::int)::bigint, 1,
  'Spaced phone number is detected');

select assert_eq(
  (select looks_like_contact('lets meet at the main gate')::int)::bigint, 0,
  'Ordinary message is not falsely flagged');

select assert_eq(shared_nights(448, 192)::bigint, 2, 'shared_nights counts overlapping bits');


\echo ''
\echo '════════════════════════════════════════════'
\echo ' ALL RLS TESTS PASSED'
\echo '════════════════════════════════════════════'
