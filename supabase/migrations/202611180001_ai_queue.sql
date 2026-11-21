-- Fair first-come-first-served queue in front of the self-hosted AI server.
-- A CPU-only model answers one request at a time; every Vercel instance sees
-- the same queue here. Apply once, after 202611080001_cloqi_rename.sql.
--
-- Flow: join (consumes the existing quota) -> poll every ~2 s until ready ->
-- begin (the API marks the turn as used) -> generate -> leave.
-- The ticket id is a random UUID that only its holder knows; signed-in users'
-- tickets are additionally bound to auth.uid().
begin;

create table cloqi_private.ai_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade, -- null = public demo
  created_at timestamptz not null default clock_timestamp(),
  last_seen timestamptz not null default clock_timestamp(),
  granted_at timestamptz,
  generating boolean not null default false
);
create index ai_queue_waiting_idx on cloqi_private.ai_queue (created_at, id)
  where granted_at is null;
alter table cloqi_private.ai_queue enable row level security;
revoke all on cloqi_private.ai_queue from public, anon, authenticated;

-- Tuning, changed only by a migration: concurrent AI turns and queue length.
create function cloqi_private.ai_queue_slots() returns integer
language sql immutable as $$ select 1 $$;
create function cloqi_private.ai_queue_capacity() returns integer
language sql immutable as $$ select 30 $$;

-- Serializes every queue change, so two polls can never both win a slot.
-- Also drops tickets whose holder vanished: waiting and not polled for 30 s,
-- granted but never started within 20 s, or generating for over 200 s
-- (the API gives the model at most 170 s).
create function cloqi_private.ai_queue_lock_and_tidy() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(80860001);
  delete from cloqi_private.ai_queue as q
  where (q.granted_at is null and q.last_seen < pg_catalog.clock_timestamp() - interval '30 seconds')
     or (q.granted_at is not null and not q.generating
         and q.granted_at < pg_catalog.clock_timestamp() - interval '20 seconds')
     or (q.generating and q.granted_at < pg_catalog.clock_timestamp() - interval '200 seconds');
end;
$$;

create function cloqi_private.ai_queue_insert(p_user uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_ticket uuid;
begin
  insert into cloqi_private.ai_queue (user_id) values (p_user) returning id into v_ticket;
  return v_ticket;
end;
$$;

create function cloqi_private.ai_queue_full() returns boolean
language sql stable security definer set search_path = ''
as $$
  select count(*) >= cloqi_private.ai_queue_capacity() from cloqi_private.ai_queue;
$$;

revoke all on function cloqi_private.ai_queue_slots(), cloqi_private.ai_queue_capacity(),
  cloqi_private.ai_queue_lock_and_tidy(), cloqi_private.ai_queue_insert(uuid),
  cloqi_private.ai_queue_full() from public, anon, authenticated;

-- Signed-in users: a full queue is refused before any quota is consumed.
create function public.join_ai_queue() returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  perform cloqi_private.ai_queue_lock_and_tidy();
  if cloqi_private.ai_queue_full() then
    raise exception using errcode = 'P0001', message = 'ai_queue_full';
  end if;
  if not public.claim_ai_request() then
    raise exception using errcode = 'P0001', message = 'rate_limit';
  end if;
  return cloqi_private.ai_queue_insert(v_user);
end;
$$;
revoke all on function public.join_ai_queue() from public, anon, authenticated;
grant execute on function public.join_ai_queue() to authenticated;

-- Public demo: joining spends the shared demo budget (3/minute, 50/day), so
-- flooding the queue costs the same as flooding the AI.
create function public.join_demo_ai_queue()
returns table(ticket uuid, remaining integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_remaining integer;
begin
  perform cloqi_private.ai_queue_lock_and_tidy();
  if cloqi_private.ai_queue_full() then
    raise exception using errcode = 'P0001', message = 'ai_queue_full';
  end if;
  v_remaining := public.claim_demo_ai_quota();
  return query select cloqi_private.ai_queue_insert(null), v_remaining;
end;
$$;
revoke all on function public.join_demo_ai_queue() from public, anon, authenticated;
grant execute on function public.join_demo_ai_queue() to anon, authenticated;

-- Keeps the ticket alive and hands out the slot strictly in arrival order.
-- queue_position: 0 = it is your turn, 1 = next in line, ...
create function public.poll_ai_queue(p_ticket uuid)
returns table(queue_position integer, ready boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_row cloqi_private.ai_queue%rowtype;
  v_ahead integer;
  v_active integer;
begin
  perform cloqi_private.ai_queue_lock_and_tidy();
  update cloqi_private.ai_queue as q set last_seen = pg_catalog.clock_timestamp()
    where q.id = p_ticket and (q.user_id is null or q.user_id = auth.uid())
    returning q.* into v_row;
  if not found then
    raise exception using errcode = 'P0001', message = 'ai_ticket_unknown';
  end if;
  if v_row.granted_at is not null then
    return query select 0, true;
    return;
  end if;
  select count(*) into v_ahead from cloqi_private.ai_queue as q
    where q.granted_at is null and (q.created_at, q.id) < (v_row.created_at, v_row.id);
  select count(*) into v_active from cloqi_private.ai_queue as q
    where q.granted_at is not null;
  if v_ahead = 0 and v_active < cloqi_private.ai_queue_slots() then
    update cloqi_private.ai_queue as q set granted_at = pg_catalog.clock_timestamp()
      where q.id = p_ticket;
    return query select 0, true;
    return;
  end if;
  return query select v_ahead + 1, false;
end;
$$;
revoke all on function public.poll_ai_queue(uuid) from public, anon, authenticated;
grant execute on function public.poll_ai_queue(uuid) to anon, authenticated;

-- A granted ticket buys exactly one AI call.
create function public.begin_ai_queue_turn(p_ticket uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform cloqi_private.ai_queue_lock_and_tidy();
  update cloqi_private.ai_queue as q set generating = true
    where q.id = p_ticket and q.granted_at is not null and not q.generating
      and (q.user_id is null or q.user_id = auth.uid());
  return found;
end;
$$;
revoke all on function public.begin_ai_queue_turn(uuid) from public, anon, authenticated;
grant execute on function public.begin_ai_queue_turn(uuid) to anon, authenticated;

create function public.leave_ai_queue(p_ticket uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(80860001);
  delete from cloqi_private.ai_queue as q
    where q.id = p_ticket and (q.user_id is null or q.user_id = auth.uid());
end;
$$;
revoke all on function public.leave_ai_queue(uuid) from public, anon, authenticated;
grant execute on function public.leave_ai_queue(uuid) to anon, authenticated;

commit;
