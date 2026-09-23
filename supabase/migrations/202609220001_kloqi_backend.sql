-- Apply as the Supabase database owner (postgres). No service-role key is
-- required by the application: RPCs use each signed-in user's JWT.
begin;

create schema if not exists kloqi_private;
revoke all on schema kloqi_private from public, anon, authenticated;
grant usage on schema kloqi_private to authenticated;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'Mein KLOQI Workspace'
    check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_id_idx
  on public.workspace_members(user_id, workspace_id);

create table public.workspace_states (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

-- Deliberately outside the exposed public schema. Only the quota RPC can
-- consume these counters; clients cannot select, change, or reset them.
create table kloqi_private.ai_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_started timestamptz not null,
  minute_count integer not null default 0 check (minute_count between 0 and 20),
  day_started date not null,
  day_count integer not null default 0 check (day_count between 0 and 200)
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_states enable row level security;
alter table kloqi_private.ai_usage enable row level security;

revoke all on public.workspaces, public.workspace_members,
  public.workspace_states from public, anon, authenticated;
revoke all on kloqi_private.ai_usage from public, anon, authenticated;
grant select on public.workspaces, public.workspace_members,
  public.workspace_states to authenticated;

-- The owner bypasses RLS only for this tightly scoped membership lookup.
-- This avoids recursive RLS when reading workspace_members itself.
create function kloqi_private.my_workspace_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_members as m
  where m.user_id = (select auth.uid());
$$;
revoke all on function kloqi_private.my_workspace_ids() from public, anon, authenticated;
grant execute on function kloqi_private.my_workspace_ids() to authenticated;

create policy members_read_workspaces on public.workspaces
  for select to authenticated
  using (id in (select kloqi_private.my_workspace_ids()));
create policy members_read_members on public.workspace_members
  for select to authenticated
  using (workspace_id in (select kloqi_private.my_workspace_ids()));
create policy members_read_state on public.workspace_states
  for select to authenticated
  using (workspace_id in (select kloqi_private.my_workspace_ids()));

-- Validate even direct RPC calls. HTTP validation alone is insufficient,
-- because authenticated users may call Supabase's Data API themselves.
create function kloqi_private.validate_snapshot(p_state jsonb)
returns void
language plpgsql immutable set search_path = ''
as $$
declare
  v_task jsonb;
  v_value jsonb;
  v_key text;
  v_result jsonb;
  v_analysis jsonb;
begin
  if p_state is null or jsonb_typeof(p_state) <> 'object'
    or octet_length(p_state::text) > 524288 then
    raise exception using errcode = '22023', message = 'invalid_snapshot';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_state) as k(key)
    where k.key not in ('tasks', 'mission', 'analyzed', 'feedback', 'notifications', 'reducedMotion', 'analysisResults')
  ) then
    raise exception using errcode = '22023', message = 'invalid_snapshot';
  end if;
  if jsonb_typeof(p_state->'tasks') is distinct from 'array'
    or jsonb_typeof(p_state->'mission') is distinct from 'number'
    or (p_state->>'mission') not in ('0', '1', '2', '3') then
    raise exception using errcode = '22023', message = 'invalid_snapshot';
  end if;
  if jsonb_array_length(p_state->'tasks') > 1000 then
    raise exception using errcode = '22023', message = 'invalid_snapshot';
  end if;
  foreach v_key in array array['notifications', 'reducedMotion'] loop
    if p_state ? v_key and jsonb_typeof(p_state->v_key) <> 'boolean' then
      raise exception using errcode = '22023', message = 'invalid_snapshot';
    end if;
  end loop;
  foreach v_key in array array['analyzed', 'feedback'] loop
    if p_state ? v_key then
      if jsonb_typeof(p_state->v_key) <> 'array' then
        raise exception using errcode = '22023', message = 'invalid_snapshot';
      end if;
      if jsonb_array_length(p_state->v_key) > (case when v_key = 'analyzed' then 100 else 500 end) then
        raise exception using errcode = '22023', message = 'invalid_snapshot';
      end if;
      for v_value in select value from jsonb_array_elements(p_state->v_key) loop
        if jsonb_typeof(v_value) <> 'string'
          or (v_key = 'analyzed' and (v_value #>> '{}') not in ('raw', 'production', 'packaging', 'logistics', 'quality'))
          or char_length(v_value #>> '{}') > (case when v_key = 'analyzed' then 160 else 8000 end) then
          raise exception using errcode = '22023', message = 'invalid_snapshot';
        end if;
      end loop;
    end if;
  end loop;
  for v_task in select value from jsonb_array_elements(p_state->'tasks') loop
    if jsonb_typeof(v_task) <> 'object' then
      raise exception using errcode = '22023', message = 'invalid_snapshot';
    end if;
    if exists (select 1 from jsonb_object_keys(v_task) as k(key) where k.key not in ('id','title','description','person','due','process','priority','done')) then
      raise exception using errcode = '22023', message = 'invalid_snapshot';
    end if;
    foreach v_key in array array['id', 'title', 'description', 'person', 'due', 'process', 'priority'] loop
      if jsonb_typeof(v_task->v_key) is distinct from 'string'
        or char_length(v_task->>v_key) > (case
          when v_key = 'description' then 8000
          when v_key = 'title' then 300 else 160 end) then
        raise exception using errcode = '22023', message = 'invalid_snapshot';
      end if;
    end loop;
    if char_length(btrim(v_task->>'id')) = 0
      or char_length(btrim(v_task->>'title')) = 0
      or jsonb_typeof(v_task->'done') is distinct from 'boolean'
      or (v_task->>'process') not in ('raw', 'production', 'packaging', 'logistics', 'quality')
      or (v_task->>'priority') not in ('Niedrig', 'Mittel', 'Hoch', 'Kritisch') then
      raise exception using errcode = '22023', message = 'invalid_snapshot';
    end if;
  end loop;
  if exists (
    select value->>'id' from jsonb_array_elements(p_state->'tasks')
    group by value->>'id' having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'invalid_snapshot';
  end if;
  if p_state ? 'analysisResults' then
    if jsonb_typeof(p_state->'analysisResults') <> 'object' then
      raise exception using errcode = '22023', message = 'invalid_snapshot';
    end if;
    for v_key, v_result in select key, value from jsonb_each(p_state->'analysisResults') loop
      if v_key not in ('raw', 'production', 'packaging', 'logistics', 'quality')
        or jsonb_typeof(v_result) <> 'object'
        or jsonb_typeof(v_result->'text') is distinct from 'string'
        or char_length(v_result->>'text') not between 1 and 16000
        or (v_result->>'source') is distinct from 'openai'
        or jsonb_typeof(v_result->'model') is distinct from 'string'
        or char_length(v_result->>'model') not between 1 and 200 then
        raise exception using errcode = '22023', message = 'invalid_snapshot';
      end if;
      if exists (select 1 from jsonb_object_keys(v_result) as k(key) where k.key not in ('text','source','model','analysis')) then
        raise exception using errcode = '22023', message = 'invalid_snapshot';
      end if;
      if v_result ? 'analysis' then
        v_analysis := v_result->'analysis';
        if jsonb_typeof(v_analysis) <> 'object'
          or jsonb_typeof(v_analysis->'title') is distinct from 'string'
          or jsonb_typeof(v_analysis->'recommendation') is distinct from 'string'
          or char_length(v_analysis->>'title') not between 1 and 300
          or char_length(v_analysis->>'recommendation') not between 1 and 8000
          or jsonb_typeof(v_analysis->'findings') is distinct from 'array'
          or not (v_analysis ? 'estimatedMinutesSaved')
          or jsonb_typeof(v_analysis->'estimatedMinutesSaved') not in ('number', 'null') then
          raise exception using errcode = '22023', message = 'invalid_snapshot';
        end if;
        if exists (select 1 from jsonb_object_keys(v_analysis) as k(key) where k.key not in ('title','recommendation','findings','estimatedMinutesSaved')) then
          raise exception using errcode = '22023', message = 'invalid_snapshot';
        end if;
        if jsonb_typeof(v_analysis->'estimatedMinutesSaved') = 'number' and (v_analysis->>'estimatedMinutesSaved')::numeric not between 0 and 1440 then
          raise exception using errcode = '22023', message = 'invalid_snapshot';
        end if;
        if jsonb_array_length(v_analysis->'findings') not between 1 and 8 then
          raise exception using errcode = '22023', message = 'invalid_snapshot';
        end if;
        for v_value in select value from jsonb_array_elements(v_analysis->'findings') loop
          if jsonb_typeof(v_value) <> 'string' or char_length(v_value #>> '{}') not between 1 and 2000 then
            raise exception using errcode = '22023', message = 'invalid_snapshot';
          end if;
        end loop;
      end if;
    end loop;
  end if;
end;
$$;
revoke all on function kloqi_private.validate_snapshot(jsonb) from public, anon, authenticated;

create function public.ensure_workspace(p_initial_state jsonb)
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
  perform kloqi_private.validate_snapshot(p_initial_state);

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
revoke all on function public.ensure_workspace(jsonb) from public, anon, authenticated;
grant execute on function public.ensure_workspace(jsonb) to authenticated;

create function public.save_workspace(p_workspace_id uuid, p_expected_revision integer, p_state jsonb)
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
  perform kloqi_private.validate_snapshot(p_state);

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
revoke all on function public.save_workspace(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.save_workspace(uuid, integer, jsonb) to authenticated;

create function public.claim_ai_request()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_minute timestamptz;
  v_day date;
  v_usage kloqi_private.ai_usage%rowtype;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  insert into kloqi_private.ai_usage (user_id, minute_started, day_started)
  values (v_user, date_trunc('minute', v_now at time zone 'UTC') at time zone 'UTC',
    (v_now at time zone 'UTC')::date)
  on conflict (user_id) do nothing;

  select u.* into v_usage from kloqi_private.ai_usage as u
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
  update kloqi_private.ai_usage as u
    set minute_started = v_usage.minute_started,
        minute_count = v_usage.minute_count + 1,
        day_started = v_usage.day_started,
        day_count = v_usage.day_count + 1
    where u.user_id = v_user;
  return true;
end;
$$;
revoke all on function public.claim_ai_request() from public, anon, authenticated;
grant execute on function public.claim_ai_request() to authenticated;

comment on table public.workspace_states is
  'KLOQI snapshots; members may read, only revision-checked save_workspace may write.';
comment on function public.claim_ai_request() is
  'Consumes one request for auth.uid(); fixed UTC windows: 20/minute and 200/day. No refund/reset API.';

commit;
