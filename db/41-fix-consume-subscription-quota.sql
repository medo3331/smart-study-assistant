-- ============================================================================
-- Phase 41 — إصلاح consume_subscription_quota (MANUAL RUN — idempotent)
-- ============================================================================
-- ⚠️ **BUG في الإنتاج**: كل نداء للـ RPC كان يفشل بأحدهاتنين:
--
--   1) `there is no unique or exclusion constraint matching the ON CONFLICT
--      specification` — الدالة بتعمل `insert ... on conflict (user_id)`
--      على subscription_quotas، لكن الجدول كان فيه pkey على `id` بس
--      ومفيش unique على `user_id`.
--
--   2) `column messages_per_day does not exist` — الدالة بترجّع الحدود من
--      subscription_plans بعمودين (`messages_per_day`, `uploads_per_day`)
--      مش موجودين في الجدول الفعلي. الأعمدة الصحيحة:
--      `messages_daily` (+ fallback `messages_per_2h`) و `uploads_daily`.
--
-- ⇒ النتيجة العملية: `checkSubscriptionQuota` fail-closed ⇒ الـ chat
--    بيرجّع «نظام الكوتة غير متاح حاليًا» ورفع الملفات بيترفض 429
--    بنفس الرسالة. الاتنين مكانهم شغّالين بعد الملف ده.
-- ============================================================================

-- ١) الـ unique index المطلوب للـ ON CONFLICT (idempotent).
create unique index if not exists subscription_quotas_user_uniq
  on public.subscription_quotas(user_id);

-- ٢) الدالة بنفس التوقيع — بس بالأعمدة الصحيحة وترتيب النسخ الصحيح.
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
    insert into public.subscription_quotas (user_id, plan_key, messages_24h, uploads_today, last_reset_at, updated_at)
      values (p_user_id, 'free', 0, 0, v_period_start, now() at time zone 'utc')
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

  -- ⚠️ الأعمدة الفعلية في subscription_plans: messages_daily /
  --    messages_per_2h (fallback) / uploads_daily — مش
  --    messages_per_day / uploads_per_day اللي كانوا في النسخة القديمة.
  if p_kind = 'message' then
    select coalesce(sp.messages_daily, sp.messages_per_2h, 20) into v_limit
      from public.subscription_plans sp
      where sp.plan_key = v_plan and sp.is_active = true
      order by sp.version desc limit 1;
    if v_limit is null then v_limit := 20; end if;
  else
    select coalesce(sp.uploads_daily, 5) into v_limit
      from public.subscription_plans sp
      where sp.plan_key = v_plan and sp.is_active = true
      order by sp.version desc limit 1;
    if v_limit is null then v_limit := 5; end if;
  end if;

  if exists (select 1 from public.quota_idempotency where user_id = p_user_id and kind = p_kind and idempotency_key = p_idempotency_key) then
    if p_kind = 'message' then
      return query select true, v_row.messages_24h, v_limit, (v_period_start + interval '1 day')::timestamptz, true;
    else
      return query select true, v_row.uploads_today, v_limit, (v_period_start + interval '1 day')::timestamptz, true;
    end if;
    -- ⚠️ return query مش بيوقّف الدالة — من غير return هنا الدالة بتفضل
    --   شغّالة وتستهلك من الـ quota تاني رغم إن المفتاح اتسجّل قبل كده.
    return;
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

  insert into public.quota_idempotency (user_id, kind, idempotency_key, consumed_at, period_type, period_start)
    values (p_user_id, p_kind, p_idempotency_key, now() at time zone 'utc', 'day', v_period_start)
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
