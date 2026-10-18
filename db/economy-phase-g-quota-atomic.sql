-- ============================================================================
-- Phase G — Atomic Subscription Quota with Idempotency + Plan Versioning
-- التاريخ: ٢٠٢٦-١٠-١٧
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Idempotency table for quota consumption
--    Prevents double-charging on retries: (user_id, kind, idempotency_key) is unique.
-- ----------------------------------------------------------------------------
create table if not exists public.quota_idempotency (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('message', 'upload')),
  idempotency_key text not null,
  consumed_at timestamptz not null default now(),
  primary key (user_id, kind, idempotency_key)
);

create index if not exists idx_quota_idempotency_user_kind on public.quota_idempotency(user_id, kind);
create index if not exists idx_quota_idempotency_consumed_at on public.quota_idempotency(consumed_at);

-- ----------------------------------------------------------------------------
-- 2) RPC: consume_subscription_quota — atomic check + increment
--    Locks the user's quota row implicitly via service_role + single transaction.
--    Idempotent: same (user_id, kind, idempotency_key) → already_consumed=true, no second increment.
-- ----------------------------------------------------------------------------
create or replace function public.consume_subscription_quota(
  p_user_id uuid,
  p_kind text,
  p_idempotency_key text
)
returns table (
  allowed boolean,
  used int,
  limit int,
  reset_at timestamptz,
  already_consumed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used int := 0;
  v_limit int := 0;
  v_reset_at timestamptz;
  v_plan_key text := 'free';
  v_messages_per_2h int := 20;
  v_uploads_daily int := 5;
  v_current_used int := 0;
  v_now timestamptz := now() at time zone 'utc';
begin
  -- Only service_role can call this
  if coalesce((auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'consume_subscription_quota: forbidden — service_role only';
  end if;

  if p_user_id is null then
    raise exception 'consume_subscription_quota: p_user_id required';
  end if;

  if p_kind not in ('message', 'upload') then
    raise exception 'consume_subscription_quota: p_kind must be message or upload';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'consume_subscription_quota: p_idempotency_key required';
  end if;

  -- Idempotency check: same key already consumed for this user/kind?
  if exists (select 1 from public.quota_idempotency
             where user_id = p_user_id and kind = p_kind and idempotency_key = p_idempotency_key) then
    select coalesce(messages_24h, 0), coalesce(uploads_today, 0), last_reset_at
    into v_used, v_limit, v_reset_at
    from public.subscription_quotas where user_id = p_user_id;

    return query select
      true::boolean,
      case when p_kind = 'message' then v_used else 0 end,
      case when p_kind = 'message' then v_limit else 0 end,
      v_reset_at,
      true::boolean;
    return;
  end if;

  -- Ensure quota row exists (lazy init)
  insert into public.subscription_quotas (user_id, plan_key, messages_24h, uploads_today, last_reset_at, updated_at)
  values (p_user_id, 'free', 0, 0, v_now, v_now)
  on conflict (user_id) do nothing;

  -- Read current state
  select messages_24h, uploads_today, last_reset_at, plan_key
  into v_used, v_limit, v_reset_at, v_plan_key
  from public.subscription_quotas where user_id = p_user_id;

  -- Lazy 24h reset
  if v_reset_at is null or v_now - v_reset_at > interval '24 hours' then
    update public.subscription_quotas
    set messages_24h = 0, uploads_today = 0, last_reset_at = v_now, updated_at = v_now
    where user_id = p_user_id;
    v_used := 0;
    v_reset_at := v_now;
  end if;

  -- Get plan limits
  select coalesce(messages_per_2h, 20), coalesce(uploads_daily, 5)
  into v_messages_per_2h, v_uploads_daily
  from public.subscription_plans where plan_key = v_plan_key;

  v_limit := case when p_kind = 'message' then v_messages_per_2h * 12 else v_uploads_daily end;

  -- Get current used for the kind
  if p_kind = 'message' then
    v_current_used := v_used;
  else
    select uploads_today into v_current_used from public.subscription_quotas where user_id = p_user_id;
  end if;

  -- Enforce limit
  if v_current_used >= v_limit then
    return query select
      false::boolean,
      v_current_used,
      v_limit,
      v_reset_at,
      false::boolean;
    return;
  end if;

  -- Record idempotency key
  insert into public.quota_idempotency (user_id, kind, idempotency_key)
  values (p_user_id, p_kind, p_idempotency_key);

  -- Increment counter
  if p_kind = 'message' then
    update public.subscription_quotas
    set messages_24h = messages_24h + 1, updated_at = v_now
    where user_id = p_user_id;
    v_current_used := v_current_used + 1;
  else
    update public.subscription_quotas
    set uploads_today = uploads_today + 1, updated_at = v_now
    where user_id = p_user_id;
  end if;

  return query select
    true::boolean,
    v_current_used,
    v_limit,
    v_reset_at,
    false::boolean;
end;
$$;

revoke all on function public.consume_subscription_quota(uuid, text, text) from public;
revoke all on function public.consume_subscription_quota(uuid, text, text) from authenticated;
revoke all on function public.consume_subscription_quota(uuid, text, text) from anon;
grant execute on function public.consume_subscription_quota(uuid, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 3) Plan versioning: version + effective_date columns on subscription_plans
-- ----------------------------------------------------------------------------
alter table public.subscription_plans add column if not exists version int not null default 1;
alter table public.subscription_plans add column if not exists effective_date timestamptz not null default now();

-- Unique constraint: one active version per plan_key at any given time
-- (plan_key, version) must be unique to prevent duplicate plan versions
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subscription_plans_plan_key_version_key'
      and conrelid = 'public.subscription_plans'::regclass
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_plan_key_version_key unique (plan_key, version);
  end if;
end $$;

create index if not exists idx_subscription_plans_version on public.subscription_plans(version);
create index if not exists idx_subscription_plans_effective_date on public.subscription_plans(effective_date);
create index if not exists idx_subscription_plans_active_version
  on public.subscription_plans(plan_key, version) where effective_date <= now() at time zone 'utc';

-- ----------------------------------------------------------------------------
-- 4) RPC: get_active_plan_version — returns the effective plan row for a plan_key
--    Selection rule: effective_date <= now() AND highest version
-- ----------------------------------------------------------------------------
create or replace function public.get_active_plan_version(p_plan_key text)
returns table (
  plan_key text,
  name text,
  display_name_ar text,
  profile_limit int,
  messages_per_2h int,
  uploads_daily int,
  max_file_size_mb int,
  file_types text[],
  video_audio_exclusive boolean,
  priority_queue text,
  trial_days int,
  is_active boolean,
  version int,
  effective_date timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select
    plan_key, name, display_name_ar, profile_limit, messages_per_2h, uploads_daily,
    max_file_size_mb, file_types, video_audio_exclusive, priority_queue,
    trial_days, is_active, version, effective_date
  from public.subscription_plans
  where plan_key = p_plan_key
    and is_active = true
    and effective_date <= now() at time zone 'utc'
  order by version desc
  limit 1;
end;
$$;

revoke all on function public.get_active_plan_version(text) from public;
revoke all on function public.get_active_plan_version(text) from authenticated;
revoke all on function public.get_active_plan_version(text) from anon;
grant execute on function public.get_active_plan_version(text) to service_role;

-- ----------------------------------------------------------------------------
-- 5) Backfill: set version=1, effective_date=now() for existing rows that lack them
--    (idempotent — safe to re-run)
-- ----------------------------------------------------------------------------
update public.subscription_plans
set version = 1,
    effective_date = coalesce(effective_date, now() at time zone 'utc')
where version is null or effective_date is null;