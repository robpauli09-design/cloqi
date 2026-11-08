-- KLOQI is now called CLOQI. Apply as the database owner (postgres), once,
-- after 202609220001_kloqi_backend.sql and 202609230001_demo_ai_quota.sql.
--
-- Renaming the schema keeps every table, row, grant, RLS policy and the
-- my_workspace_ids()/validate_snapshot() functions: PostgreSQL links those by
-- internal id. PL/pgSQL bodies, however, are stored as text, so the four RPCs
-- that name the private schema are redefined below, unchanged except for the
-- schema name. CREATE OR REPLACE keeps their grants and comments.
begin;

alter schema kloqi_private rename to cloqi_private;

create or replace function public.ensure_workspace(p_initial_state jsonb)
returns table(workspace_id uuid, state jsonb, revision integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_workspace uuid;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  perform cloqi_private.validate_snapshot(p_initial_state);

  -- The unique owner key plus ON CONFLICT's row lock serializes concurrent
  -- first logins, including state seeding, within this transaction.
  insert into public.workspaces as w (owner_id)
  values (v_user)
  on conflict (owner_id) do update set owner_id = excluded.owner_id
  returning w.id into v_workspace;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace, v_user, 'owner')
  on conflict on constraint workspace_members_pkey do nothing;

  insert into public.workspace_states (workspace_id, state)
  values (v_workspace, p_initial_state)
  on conflict on constraint workspace_states_pkey do nothing;

  return query
  select s.workspace_id, s.state, s.revision
  from public.workspace_states as s where s.workspace_id = v_workspace;
end;
$$;
create or replace function public.save_workspace(p_workspace_id uuid, p_expected_revision integer, p_state jsonb)
returns table(state jsonb, revision integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not exists (
    select 1 from public.workspace_members as m
    where m.workspace_id = p_workspace_id and m.user_id = v_user
  ) then
    raise exception using errcode = '42501', message = 'workspace_forbidden';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'invalid_revision';
  end if;
  perform cloqi_private.validate_snapshot(p_state);

  -- PostgreSQL locks the row and rechecks this revision predicate after
  -- concurrent writers finish: exactly one writer can accept a revision.
  return query
  update public.workspace_states as s
    set state = p_state, revision = s.revision + 1, updated_at = clock_timestamp()
    where s.workspace_id = p_workspace_id and s.revision = p_expected_revision
    returning s.state, s.revision;
  if not found then
    raise exception using errcode = 'P0001', message = 'revision_conflict';
  end if;
end;
$$;
create or replace function public.claim_ai_request()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_minute timestamptz;
  v_day date;
  v_usage cloqi_private.ai_usage%rowtype;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  insert into cloqi_private.ai_usage (user_id, minute_started, day_started)
  values (v_user, date_trunc('minute', v_now at time zone 'UTC') at time zone 'UTC',
    (v_now at time zone 'UTC')::date)
  on conflict (user_id) do nothing;

  select u.* into v_usage from cloqi_private.ai_usage as u
    where u.user_id = v_user for update;
  -- Read time after taking the lock, so queued requests cannot reset a
  -- newer bucket to the older timestamp at which their call began.
  v_now := clock_timestamp();
  v_minute := date_trunc('minute', v_now at time zone 'UTC') at time zone 'UTC';
  v_day := (v_now at time zone 'UTC')::date;
  if v_usage.minute_started <> v_minute then
    v_usage.minute_started := v_minute;
    v_usage.minute_count := 0;
  end if;
  if v_usage.day_started <> v_day then
    v_usage.day_started := v_day;
    v_usage.day_count := 0;
  end if;
  if v_usage.minute_count >= 20 or v_usage.day_count >= 200 then
    return false;
  end if;
  update cloqi_private.ai_usage as u
    set minute_started = v_usage.minute_started,
        minute_count = v_usage.minute_count + 1,
        day_started = v_usage.day_started,
        day_count = v_usage.day_count + 1
    where u.user_id = v_user;
  return true;
end;
$$;

create or replace function public.claim_demo_ai_quota()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_day timestamptz;
  v_minute timestamptz;
  v_budget cloqi_private.demo_ai_budget%rowtype;
begin
  -- Two-argument date_trunc keeps this working on every supported PostgreSQL
  -- major version; the three-argument form needs 16 or newer.
  v_day := pg_catalog.date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC';
  v_minute := pg_catalog.date_trunc('minute', v_now at time zone 'UTC') at time zone 'UTC';
  insert into cloqi_private.demo_ai_budget(id, day_bucket, minute_bucket)
  values (true, v_day, v_minute) on conflict (id) do nothing;
  select * into v_budget from cloqi_private.demo_ai_budget where id = true for update;
  if v_budget.day_bucket <> v_day then v_budget.day_count := 0; end if;
  if v_budget.minute_bucket <> v_minute then v_budget.minute_count := 0; end if;
  if v_budget.day_count >= 50 or v_budget.minute_count >= 3 then
    raise exception 'demo_rate_limit' using errcode = 'P0001';
  end if;
  update cloqi_private.demo_ai_budget
  set day_bucket = v_day, minute_bucket = v_minute,
      day_count = v_budget.day_count + 1, minute_count = v_budget.minute_count + 1
  where id = true;
  return 50 - v_budget.day_count - 1;
end;
$$;

alter table public.workspaces
  alter column name set default 'Mein CLOQI Workspace';
-- Workspaces that still carry the untouched old default get the new name.
update public.workspaces
  set name = 'Mein CLOQI Workspace'
  where name = 'Mein KLOQI Workspace';

comment on table public.workspace_states is
  'CLOQI snapshots; members may read, only revision-checked save_workspace may write.';

commit;
