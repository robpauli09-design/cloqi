-- The public demo has one shared, atomic budget, independent of browser identity.
-- This RPC can consume budget only; callers cannot read/reset the private counter.
begin;

create table if not exists kloqi_private.demo_ai_budget (
  id boolean primary key default true check (id),
  day_bucket timestamptz not null,
  minute_bucket timestamptz not null,
  day_count integer not null default 0,
  minute_count integer not null default 0
);
alter table kloqi_private.demo_ai_budget enable row level security;
revoke all on kloqi_private.demo_ai_budget from public, anon, authenticated;

create or replace function public.claim_demo_ai_quota()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_day timestamptz;
  v_minute timestamptz;
  v_budget kloqi_private.demo_ai_budget%rowtype;
begin
  -- Two-argument date_trunc keeps this working on every supported PostgreSQL
  -- major version; the three-argument form needs 16 or newer.
  v_day := pg_catalog.date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC';
  v_minute := pg_catalog.date_trunc('minute', v_now at time zone 'UTC') at time zone 'UTC';
  insert into kloqi_private.demo_ai_budget(id, day_bucket, minute_bucket)
  values (true, v_day, v_minute) on conflict (id) do nothing;
  select * into v_budget from kloqi_private.demo_ai_budget where id = true for update;
  if v_budget.day_bucket <> v_day then v_budget.day_count := 0; end if;
  if v_budget.minute_bucket <> v_minute then v_budget.minute_count := 0; end if;
  if v_budget.day_count >= 50 or v_budget.minute_count >= 3 then
    raise exception 'demo_rate_limit' using errcode = 'P0001';
  end if;
  update kloqi_private.demo_ai_budget
  set day_bucket = v_day, minute_bucket = v_minute,
      day_count = v_budget.day_count + 1, minute_count = v_budget.minute_count + 1
  where id = true;
  return 50 - v_budget.day_count - 1;
end;
$$;
revoke all on function public.claim_demo_ai_quota() from public;
grant execute on function public.claim_demo_ai_quota() to anon, authenticated;

comment on function public.claim_demo_ai_quota() is
  'Consumes one shared demo request; fixed UTC windows: 3/minute and 50/day for all visitors. No refund/reset API.';

commit;
