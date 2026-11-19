-- ============================================================================
-- Phase 42 — حد الصفحات اليومي (MANUAL RUN — idempotent)
-- ============================================================================
-- قرار صاحب المشروع: المستخدم غير المشترك (free) له **10 صفحات يومياً**
-- (صفحات النوته اللي بينشئها + صفحات PDF المستوردة). المشتركون Pro/Ultra
-- بلا حد على الصفحات (null = unlimited) — حدّهم الحقيقي على الـ AI.
--
-- التنفيذ:
--   ① عمود pages_daily في subscription_plans (null = بلا حد)
--   ② عدّاد pages_24h في subscription_quotas
--   ③ kind جديد 'page' في consume/refund subscription quota
--
-- idempotent: كل عبارة guarded — آمنة للتكرار.
-- ============================================================================

-- ١) الحدود لكل خطة.
alter table public.subscription_plans
  add column if not exists pages_daily integer;

update public.subscription_plans
  set pages_daily = 10
  where plan_key = 'free';

-- المشتركون بلا حد على الصفحات.
update public.subscription_plans
  set pages_daily = null
  where plan_key in ('pro', 'ultra');

-- ٢) عدّاد الصفحات اليومي.
alter table public.subscription_quotas
  add column if not exists pages_24h integer not null default 0;

-- ٢.٥) الـ check constraint على quota_idempotency.kind كان محصور في
--      message/upload — بنوسّعه ليشمل page.
alter table public.quota_idempotency
  drop constraint if exists quota_idempotency_kind_check;
alter table public.quota_idempotency
  add constraint quota_idempotency_kind_check
  check (kind in ('message', 'upload', 'page'));

-- ٢.٦) بنشيل نسخة ٣-براميترز القديمة — وجود overloads بيخلي PostgREST
--      يتردد بينهم ("Could not choose the best candidate function").
--      النسخة الجديدة فيها default للـ p_count فالنداء بـ ٣ براميترز شغال.
drop function if exists public.consume_subscription_quota(uuid, text, text);

-- ٣) الدالة بنفس التوقيع + p_count (استيراد PDF بيستهلك N صفحة دفعة واحدة).
create or replace function public.consume_subscription_quota(
  p_user_id uuid,
  p_kind text,
  p_idempotency_key text,
  p_count integer default 1
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
  v_count int;
begin
  if coalesce((auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'consume_subscription_quota: forbidden - service_role only';
  end if;
  if p_user_id is null or p_kind not in ('message','upload','page') or p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'consume_subscription_quota: invalid args';
  end if;
  v_count := coalesce(p_count, 1);
  if v_count < 1 or v_count > 50 then
    raise exception 'consume_subscription_quota: invalid count';
  end if;

  v_period_start := date_trunc('day', now() at time zone 'utc');

  select * into v_row from public.subscription_quotas where user_id = p_user_id for update;

  if not found then
    insert into public.subscription_quotas (user_id, plan_key, messages_24h, uploads_today, pages_24h, last_reset_at, updated_at)
      values (p_user_id, 'free', 0, 0, 0, v_period_start, now() at time zone 'utc')
      on conflict (user_id) do nothing;
    select * into v_row from public.subscription_quotas where user_id = p_user_id for update;
  end if;

  if v_row.last_reset_at is null or v_row.last_reset_at < v_period_start then
    v_row.messages_24h := 0;
    v_row.uploads_today := 0;
    v_row.pages_24h := 0;
    v_row.last_reset_at := v_period_start;
  end if;

  select coalesce(e.value, 'free') into v_plan
    from public.entitlements e where e.user_id = p_user_id and e.kind = 'plan'
    order by e.created_at desc limit 1;
  if v_plan is null then v_plan := 'free'; end if;

  if p_kind = 'message' then
    select coalesce(sp.messages_daily, sp.messages_per_2h, 20) into v_limit
      from public.subscription_plans sp
      where sp.plan_key = v_plan and sp.is_active = true
      order by sp.version desc limit 1;
    if v_limit is null then v_limit := 20; end if;
  elsif p_kind = 'page' then
    select sp.pages_daily into v_limit
      from public.subscription_plans sp
      where sp.plan_key = v_plan and sp.is_active = true
      order by sp.version desc limit 1;
    -- null = بلا حد (مشتركون) — بنرجّع limit = -1 وبنعد الاستخدام بس.
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
    elsif p_kind = 'page' then
      return query select true, v_row.pages_24h, coalesce(v_limit, -1), (v_period_start + interval '1 day')::timestamptz, true;
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
      return;
    end if;
    v_row.messages_24h := v_row.messages_24h + 1;
  elsif p_kind = 'page' then
    -- بلا حد: بنسمح ونعدّ بس.
    if v_limit is null then
      v_row.pages_24h := v_row.pages_24h + v_count;
      insert into public.quota_idempotency (user_id, kind, idempotency_key, consumed_at, period_type, period_start)
        values (p_user_id, p_kind, p_idempotency_key, now() at time zone 'utc', 'day', v_period_start)
        on conflict (user_id, kind, idempotency_key) do nothing;
      update public.subscription_quotas
        set pages_24h = v_row.pages_24h, last_reset_at = v_row.last_reset_at,
            updated_at = now() at time zone 'utc'
        where user_id = p_user_id;
      return query select true, v_row.pages_24h, -1, (v_period_start + interval '1 day')::timestamptz, false;
      return;
    end if;
    if v_row.pages_24h + v_count > v_limit then
      return query select false, v_row.pages_24h, v_limit, (v_period_start + interval '1 day')::timestamptz, false;
      return;
    end if;
    v_row.pages_24h := v_row.pages_24h + v_count;
  else
    if v_row.uploads_today >= v_limit then
      return query select false, v_row.uploads_today, v_limit, (v_period_start + interval '1 day')::timestamptz, false;
      return;
    end if;
    v_row.uploads_today := v_row.uploads_today + 1;
  end if;

  insert into public.quota_idempotency (user_id, kind, idempotency_key, consumed_at, period_type, period_start)
    values (p_user_id, p_kind, p_idempotency_key, now() at time zone 'utc', 'day', v_period_start)
    on conflict (user_id, kind, idempotency_key) do nothing;

  update public.subscription_quotas
    set messages_24h = v_row.messages_24h,
        uploads_today = v_row.uploads_today,
        pages_24h = v_row.pages_24h,
        last_reset_at = v_row.last_reset_at,
        updated_at = now() at time zone 'utc'
    where user_id = p_user_id;

  if p_kind = 'message' then
    return query select true, v_row.messages_24h, v_limit, (v_period_start + interval '1 day')::timestamptz, false;
  elsif p_kind = 'page' then
    return query select true, v_row.pages_24h, coalesce(v_limit, -1), (v_period_start + interval '1 day')::timestamptz, false;
  else
    return query select true, v_row.uploads_today, v_limit, (v_period_start + interval '1 day')::timestamptz, false;
  end if;
end;
$$;

-- ٤) الـ refund يشمل الصفحات.
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
  if p_user_id is null or p_kind not in ('message','upload','page') or p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'refund_subscription_quota: invalid args';
  end if;

  -- Lock the quota row
  perform 1 from public.subscription_quotas where user_id = p_user_id for update;

  -- Remove idempotency key (only if it exists)
  delete from public.quota_idempotency
    where user_id = p_user_id and kind = p_kind and idempotency_key = p_idempotency_key;

  -- Decrement counter, clamped at 0
  if p_kind = 'message' then
    update public.subscription_quotas
      set messages_24h = greatest(coalesce(messages_24h,0) - 1, 0), updated_at = now() at time zone 'utc'
      where user_id = p_user_id;
  elsif p_kind = 'page' then
    update public.subscription_quotas
      set pages_24h = greatest(coalesce(pages_24h,0) - 1, 0), updated_at = now() at time zone 'utc'
      where user_id = p_user_id;
  else
    update public.subscription_quotas
      set uploads_today = greatest(coalesce(uploads_today,0) - 1, 0), updated_at = now() at time zone 'utc'
      where user_id = p_user_id;
  end if;
end;
$$;
