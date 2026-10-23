-- ============================================================================
-- 06 - consume_subscription_quota function (RUN SIXTH in Supabase SQL Editor)
-- No SELECT INTO (avoids Supabase RLS helper misparsing DECLARE vars).
-- Uses SQL-language helper for the current row + plpgsql for control flow.
-- ============================================================================

create or replace function public.consume_subscription_quota(
  p_user_id         uuid,
  p_kind            text,
  p_idempotency_key text
)
returns table (
  allowed           boolean,
  used              int,
  limit_            int,
  reset_at          timestamptz,
  already_consumed  boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $func$
declare
  v_used        int := 0;
  v_used_upload int := 0;
  v_limit       int := 0;
  v_reset_at    timestamptz;
  v_plan_key    text := 'free';
  v_messages    int := 20;
  v_uploads     int := 5;
  v_current     int := 0;
  v_now         timestamptz := now() at time zone 'utc';
  v_found       boolean := false;
begin
  if coalesce((auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'consume_subscription_quota: forbidden - service_role only';
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

  if exists (
    select 1 from public.quota_idempotency qi
    where qi.user_id = p_user_id
      and qi.kind = p_kind
      and qi.idempotency_key = p_idempotency_key
  ) then
    select q.messages_24h, q.uploads_today, q.last_reset_at
      from public.subscription_quotas q
      where q.user_id = p_user_id
      order by q.updated_at desc
      limit 1
      into v_used, v_used_upload, v_reset_at;

    if p_kind = 'message' then
      return query select true, v_used, v_limit, v_reset_at, true;
    else
      return query select true, v_used_upload, v_limit, v_reset_at, true;
    end if;
    return;
  end if;

  insert into public.subscription_quotas (user_id, plan_key, messages_24h, uploads_today, last_reset_at, updated_at)
  values (p_user_id, 'free', 0, 0, v_now, v_now)
  on conflict (user_id) do nothing;

  select q.messages_24h, q.uploads_today, q.last_reset_at, q.plan_key
    from public.subscription_quotas q
    where q.user_id = p_user_id
    order by q.updated_at desc
    limit 1
    into v_used, v_used_upload, v_reset_at, v_plan_key;

  select sp.messages_per_2h, sp.uploads_daily
    from public.subscription_plans sp
    where sp.plan_key = v_plan_key
      and sp.is_active = true
    order by sp.version desc, sp.effective_date desc
    limit 1
    into v_messages, v_uploads;

  if p_kind = 'message' then
    v_current := coalesce(v_used, 0);
    v_limit   := v_messages;
  else
    v_current := coalesce(v_used_upload, 0);
    v_limit   := v_uploads;
  end if;

  if v_current >= v_limit then
    return query select false, v_current, v_limit, v_reset_at, false;
    return;
  end if;

  insert into public.quota_idempotency (user_id, kind, idempotency_key, consumed_at)
  values (p_user_id, p_kind, p_idempotency_key, v_now);

  if p_kind = 'message' then
    update public.subscription_quotas
    set messages_24h = coalesce(messages_24h, 0) + 1,
        updated_at = v_now
    where user_id = p_user_id;
  else
    update public.subscription_quotas
    set uploads_today = coalesce(uploads_today, 0) + 1,
        updated_at = v_now
    where user_id = p_user_id;
  end if;

  select q.messages_24h, q.uploads_today, q.last_reset_at
    from public.subscription_quotas q
    where q.user_id = p_user_id
    order by q.updated_at desc
    limit 1
    into v_used, v_used_upload, v_reset_at;

  if p_kind = 'message' then
    return query select true, v_used, v_messages, v_reset_at, false;
  else
    return query select true, v_used_upload, v_uploads, v_reset_at, false;
  end if;
end;
$func$;

revoke all on function public.consume_subscription_quota(uuid, text, text) from public;
revoke all on function public.consume_subscription_quota(uuid, text, text) from authenticated;
revoke all on function public.consume_subscription_quota(uuid, text, text) from anon;
grant execute on function public.consume_subscription_quota(uuid, text, text) to service_role;
