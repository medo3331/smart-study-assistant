-- ============================================================================
-- 08 - Daily + Monthly subscription message quotas (UTC calendar periods)
-- Reviewable migration only. Do not apply to production until reviewed/tested.
-- ============================================================================

alter table public.subscription_quotas
  add column if not exists messages_monthly int not null default 0,
  add column if not exists last_daily_reset_at timestamptz not null default (date_trunc('day', now() at time zone 'utc') at time zone 'utc'),
  add column if not exists last_monthly_reset_at timestamptz not null default (date_trunc('month', now() at time zone 'utc') at time zone 'utc');

update public.subscription_quotas
set messages_24h = 0,
    messages_monthly = 0,
    uploads_today = 0,
    last_daily_reset_at = date_trunc('day', now() at time zone 'utc') at time zone 'utc',
    last_monthly_reset_at = date_trunc('month', now() at time zone 'utc') at time zone 'utc',
    updated_at = now() at time zone 'utc';

alter table public.subscription_plans
  add column if not exists messages_daily int,
  add column if not exists messages_monthly int;

update public.subscription_plans
set messages_daily = coalesce(messages_daily, messages_per_2h),
    messages_monthly = coalesce(messages_monthly, messages_per_2h * 30)
where messages_daily is null
   or messages_monthly is null;

alter table public.quota_idempotency
  add column if not exists period_type text not null default 'day'
    check (period_type in ('day','month')),
  add column if not exists period_start timestamptz not null default (date_trunc('day', now() at time zone 'utc') at time zone 'utc');

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quota_idempotency_period_unique'
  ) then
    alter table public.quota_idempotency
      add constraint quota_idempotency_period_unique
      unique (user_id, kind, period_type, period_start, idempotency_key);
  end if;
end $$;

create or replace function public.consume_subscription_quotas(
  p_user_id uuid,
  p_kind text,
  p_daily_idempotency_key text,
  p_monthly_idempotency_key text default null
)
returns table (
  allowed boolean,
  daily_used int,
  daily_limit int,
  monthly_used int,
  monthly_limit int,
  reset_at_daily timestamptz,
  reset_at_monthly timestamptz,
  already_consumed_daily boolean,
  already_consumed_monthly boolean,
  exceeded_period text,
  plan_key text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $func$
declare
  v_now timestamptz := now() at time zone 'utc';
  v_daily_reset timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_monthly_reset timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_plan_key text := 'free';
  v_daily_limit int;
  v_monthly_limit int;
  v_fallback int;
  v_row public.subscription_quotas%rowtype;
  v_daily_used int := 0;
  v_monthly_used int := 0;
  v_upload_used int := 0;
  v_already_daily boolean := false;
  v_already_monthly boolean := false;
  v_daily_inserted uuid;
  v_monthly_inserted uuid;
  v_is_message boolean := (p_kind = 'message');
begin
  if coalesce((auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'consume_subscription_quotas: forbidden - service_role only';
  end if;

  if p_user_id is null then
    raise exception 'consume_subscription_quotas: p_user_id required';
  end if;
  if p_kind not in ('message', 'upload') then
    raise exception 'consume_subscription_quotas: p_kind must be message or upload';
  end if;
  if p_daily_idempotency_key is null or btrim(p_daily_idempotency_key) = '' then
    raise exception 'consume_subscription_quotas: p_daily_idempotency_key required';
  end if;
  if v_is_message and (p_monthly_idempotency_key is null or btrim(p_monthly_idempotency_key) = '') then
    raise exception 'consume_subscription_quotas: p_monthly_idempotency_key required for message';
  end if;

  insert into public.subscription_quotas (user_id, plan_key, messages_24h, uploads_today, messages_monthly, last_reset_at, last_daily_reset_at, last_monthly_reset_at, updated_at)
  values (p_user_id, 'free', 0, 0, 0, v_now, v_daily_reset, v_monthly_reset, v_now)
  on conflict (user_id) do nothing;

  select * into v_row
  from public.subscription_quotas
  where user_id = p_user_id
  for update;

  select e.value into v_plan_key
  from public.entitlements e
  where e.user_id = p_user_id
    and e.kind = 'plan'
    and (e.expires_at is null or e.expires_at > v_now)
  order by e.created_at desc
  limit 1;

  if v_plan_key is null then
    v_plan_key := 'free';
  end if;

  select sp.messages_daily, sp.messages_monthly, sp.messages_per_2h
  into v_daily_limit, v_monthly_limit, v_fallback
  from public.subscription_plans sp
  where sp.plan_key = v_plan_key
    and sp.is_active = true
    and sp.effective_date <= v_now
  order by sp.version desc
  limit 1;

  if v_daily_limit is null and v_fallback is null then
    select sp.messages_daily, sp.messages_monthly, sp.messages_per_2h
    into v_daily_limit, v_monthly_limit, v_fallback
    from public.subscription_plans sp
    where sp.plan_key = 'free'
      and sp.is_active = true
      and sp.effective_date <= v_now
    order by sp.version desc
    limit 1;
  end if;

  if v_daily_limit is null then
    v_daily_limit := coalesce(v_fallback, 20);
  end if;
  if v_monthly_limit is null then
    v_monthly_limit := coalesce(v_fallback, 20) * 30;
  end if;

  if v_row.last_daily_reset_at is null or v_row.last_daily_reset_at < v_daily_reset then
    v_row.messages_24h := 0;
    v_row.uploads_today := 0;
    v_row.last_daily_reset_at := v_daily_reset;
  end if;
  if v_row.last_monthly_reset_at is null or v_row.last_monthly_reset_at < v_monthly_reset then
    v_row.messages_monthly := 0;
    v_row.last_monthly_reset_at := v_monthly_reset;
  end if;

  v_daily_used := coalesce(v_row.messages_24h, 0);
  v_monthly_used := coalesce(v_row.messages_monthly, 0);
  v_upload_used := coalesce(v_row.uploads_today, 0);

  if not v_is_message then
    v_monthly_limit := -1;
    v_monthly_used := 0;
  end if;

  if exists (
    select 1 from public.quota_idempotency qi
    where qi.user_id = p_user_id
      and qi.kind = p_kind
      and qi.period_type = 'day'
      and qi.period_start = v_daily_reset
      and qi.idempotency_key = p_daily_idempotency_key
  ) then
    v_already_daily := true;
  end if;

  if v_is_message then
    if exists (
      select 1 from public.quota_idempotency qi
      where qi.user_id = p_user_id
        and qi.kind = p_kind
        and qi.period_type = 'month'
        and qi.period_start = v_monthly_reset
        and qi.idempotency_key = p_monthly_idempotency_key
    ) then
      v_already_monthly := true;
    end if;
  end if;

  if v_is_message then
    if v_daily_limit <> -1 and v_daily_used >= v_daily_limit then
      update public.subscription_quotas
      set last_daily_reset_at = v_daily_reset,
          last_monthly_reset_at = v_monthly_reset,
          updated_at = v_now
      where user_id = p_user_id;
      return query select false, v_daily_used, v_daily_limit, v_monthly_used, v_monthly_limit,
                         v_daily_reset, v_monthly_reset, v_already_daily, v_already_monthly, 'daily'::text, v_plan_key;
      return;
    end if;
    if v_monthly_limit <> -1 and v_monthly_used >= v_monthly_limit then
      update public.subscription_quotas
      set last_daily_reset_at = v_daily_reset,
          last_monthly_reset_at = v_monthly_reset,
          updated_at = v_now
      where user_id = p_user_id;
      return query select false, v_daily_used, v_daily_limit, v_monthly_used, v_monthly_limit,
                         v_daily_reset, v_monthly_reset, v_already_daily, v_already_monthly, 'monthly'::text, v_plan_key;
      return;
    end if;
  else
    if v_daily_limit <> -1 and v_upload_used >= v_daily_limit then
      update public.subscription_quotas
      set last_daily_reset_at = v_daily_reset,
          updated_at = v_now
      where user_id = p_user_id;
      return query select false, v_upload_used, v_daily_limit, 0, -1,
                         v_daily_reset, v_monthly_reset, v_already_daily, false, 'daily'::text, v_plan_key;
      return;
    end if;
  end if;

  if not v_already_daily then
    insert into public.quota_idempotency (user_id, kind, idempotency_key, consumed_at, period_type, period_start)
    values (p_user_id, p_kind, p_daily_idempotency_key, v_now, 'day', v_daily_reset)
    on conflict (user_id, kind, period_type, period_start, idempotency_key) do nothing
    returning user_id into v_daily_inserted;

    if v_daily_inserted is not null then
      if v_is_message then
        v_daily_used := v_daily_used + 1;
      else
        v_upload_used := v_upload_used + 1;
      end if;
    else
      v_already_daily := true;
    end if;
  end if;

  if v_is_message and not v_already_monthly then
    insert into public.quota_idempotency (user_id, kind, idempotency_key, consumed_at, period_type, period_start)
    values (p_user_id, p_kind, p_monthly_idempotency_key, v_now, 'month', v_monthly_reset)
    on conflict (user_id, kind, period_type, period_start, idempotency_key) do nothing
    returning user_id into v_monthly_inserted;

    if v_monthly_inserted is not null then
      v_monthly_used := v_monthly_used + 1;
    else
      v_already_monthly := true;
    end if;
  end if;

  if v_is_message then
    update public.subscription_quotas
    set messages_24h = v_daily_used,
        messages_monthly = v_monthly_used,
        last_daily_reset_at = v_daily_reset,
        last_monthly_reset_at = v_monthly_reset,
        plan_key = v_plan_key,
        updated_at = v_now
    where user_id = p_user_id;
  else
    update public.subscription_quotas
    set uploads_today = v_upload_used,
        last_daily_reset_at = v_daily_reset,
        plan_key = v_plan_key,
        updated_at = v_now
    where user_id = p_user_id;
  end if;

  if v_is_message then
    return query select true, v_daily_used, v_daily_limit, v_monthly_used, v_monthly_limit,
                       v_daily_reset, v_monthly_reset, v_already_daily, v_already_monthly, null::text, v_plan_key;
  else
    return query select true, v_upload_used, v_daily_limit, 0, -1,
                       v_daily_reset, v_monthly_reset, v_already_daily, false, null::text, v_plan_key;
  end if;
end;
$func$;

revoke all on function public.consume_subscription_quotas(uuid, text, text, text) from public;
revoke all on function public.consume_subscription_quotas(uuid, text, text, text) from authenticated;
revoke all on function public.consume_subscription_quotas(uuid, text, text, text) from anon;
grant execute on function public.consume_subscription_quotas(uuid, text, text, text) to service_role;
