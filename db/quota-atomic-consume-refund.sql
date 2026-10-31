-- ============================================================================
-- NOT EXECUTED — review only. Atomic quota consumption + refund.
-- Apply only on isolated test DB.
-- ============================================================================

create or replace function public.consume_subscription_quota(
  p_user_id uuid,
  p_kind text,
  p_idempotency_key text
)
returns table(allowed boolean, used int, "limit" int, reset_at timestamptz, already_consumed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.subscription_quotas%rowtype;
  v_plan text;
  v_limit int;
  v_period_start timestamptz;
begin
  if coalesce((auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'consume_subscription_quota: forbidden - service_role only';
  end if;
  if p_user_id is null or p_kind not in ('message','upload') or p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'consume_subscription_quota: invalid args';
  end if;

  v_period_start := date_trunc('day', now() at time zone 'utc');

  select * into v_row from public.subscription_quotas where user_id = p_user_id for update;

  if not found then
    insert into public.subscription_quotas (user_id, messages_24h, uploads_today, last_reset_at, updated_at)
      values (p_user_id, 0, 0, v_period_start, now() at time zone 'utc')
      on conflict (user_id) do nothing;
    select * into v_row from public.subscription_quotas where user_id = p_user_id for update;
  end if;

  if v_row.last_reset_at is null or v_row.last_reset_at < v_period_start then
    v_row.messages_24h := 0;
    v_row.uploads_today := 0;
    v_row.last_reset_at := v_period_start;
  end if;

  select coalesce(e.value, 'free') into v_plan
    from public.entitlements e where e.user_id = p_user_id and e.kind = 'plan'
    order by e.created_at desc limit 1;
  if v_plan is null then v_plan := 'free'; end if;

  if p_kind = 'message' then
    select coalesce(sp.messages_per_day, 20) into v_limit
      from public.subscription_plans sp where sp.plan_key = v_plan;
    if v_limit is null then v_limit := 20; end if;
  else
    select coalesce(sp.uploads_per_day, 5) into v_limit
      from public.subscription_plans sp where sp.plan_key = v_plan;
    if v_limit is null then v_limit := 5; end if;
  end if;

  if exists (select 1 from public.quota_idempotency where user_id = p_user_id and kind = p_kind and idempotency_key = p_idempotency_key) then
    if p_kind = 'message' then
      return query select true, v_row.messages_24h, v_limit, (v_period_start + interval '1 day')::timestamptz, true;
    else
      return query select true, v_row.uploads_today, v_limit, (v_period_start + interval '1 day')::timestamptz, true;
    end if;
  end if;

  if p_kind = 'message' then
    if v_row.messages_24h >= v_limit then
      return query select false, v_row.messages_24h, v_limit, (v_period_start + interval '1 day')::timestamptz, false;
    end if;
    v_row.messages_24h := v_row.messages_24h + 1;
  else
    if v_row.uploads_today >= v_limit then
      return query select false, v_row.uploads_today, v_limit, (v_period_start + interval '1 day')::timestamptz, false;
    end if;
    v_row.uploads_today := v_row.uploads_today + 1;
  end if;

  insert into public.quota_idempotency (user_id, kind, idempotency_key, created_at)
    values (p_user_id, p_kind, p_idempotency_key, now() at time zone 'utc')
    on conflict (user_id, kind, idempotency_key) do nothing;

  update public.subscription_quotas
    set messages_24h = v_row.messages_24h,
        uploads_today = v_row.uploads_today,
        last_reset_at = v_row.last_reset_at,
        updated_at = now() at time zone 'utc'
    where user_id = p_user_id;

  if p_kind = 'message' then
    return query select true, v_row.messages_24h, v_limit, (v_period_start + interval '1 day')::timestamptz, false;
  else
    return query select true, v_row.uploads_today, v_limit, (v_period_start + interval '1 day')::timestamptz, false;
  end if;
end;
$$;
-- Refund RPC (transactional, idempotent)
create or replace function public.refund_subscription_quota(
  p_user_id uuid,
  p_kind text,
  p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce((auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'refund_subscription_quota: forbidden - service_role only';
  end if;
  if p_user_id is null or p_kind not in ('message','upload') or p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'refund_subscription_quota: invalid args';
  end if;

  perform 1 from public.subscription_quotas where user_id = p_user_id for update;

  if not exists (select 1 from public.quota_idempotency where user_id = p_user_id and kind = p_kind and idempotency_key = p_idempotency_key) then
    return;
  end if;

  delete from public.quota_idempotency
    where user_id = p_user_id and kind = p_kind and idempotency_key = p_idempotency_key;

  if p_kind = 'message' then
    update public.subscription_quotas
      set messages_24h = greatest(coalesce(messages_24h,0) - 1, 0), updated_at = now() at time zone 'utc'
      where user_id = p_user_id;
  else
    update public.subscription_quotas
      set uploads_today = greatest(coalesce(uploads_today,0) - 1, 0), updated_at = now() at time zone 'utc'
      where user_id = p_user_id;
  end if;
end;
$$;

revoke all on function public.consume_subscription_quota(uuid, text, text) from public;
revoke all on function public.consume_subscription_quota(uuid, text, text) from authenticated;
revoke all on function public.consume_subscription_quota(uuid, text, text) from anon;
grant execute on function public.consume_subscription_quota(uuid, text, text) to service_role;

revoke all on function public.refund_subscription_quota(uuid, text, text) from public;
revoke all on function public.refund_subscription_quota(uuid, text, text) from authenticated;
revoke all on function public.refund_subscription_quota(uuid, text, text) from anon;
grant execute on function public.refund_subscription_quota(uuid, text, text) to service_role;

-- STATUS: NOT EXECUTED. Test DB only.