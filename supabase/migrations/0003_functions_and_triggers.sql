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
