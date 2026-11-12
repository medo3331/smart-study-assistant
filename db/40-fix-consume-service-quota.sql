-- ============================================================================
-- Phase 5 (MANUAL RUN — #40 in the unified SQL list)
-- ai_service_usage_daily — إصلاح `consume_service_quota` + توثيق الجدول
-- ============================================================================
-- ⚠️ **BUG في الإنتاج اتكشاف بالصدفة**: `consume_service_quota` كان
--    بيرمي خطأ **لكل** مستخدم مسجّل:
--
--      42702: column reference "used" is ambiguous
--
--    السبب: الدالة بترجّع `TABLE(allowed boolean, used integer)` ⇒ الـ OUT
--    parameter اسمه `used` — نفس اسم العمود في الجدول. فداخل plpgsql:
--
--      select used into v_used from ...        ← بياخد الـ variable (NULL)
--      set used = used + 1 ...                 ← ambiguous ⇒ 42702
--
--    النتيجة عمليتين:
--    ١) **الحد اليومي مش بيتطبَّق خالص** (v_used كان NULL ⇒
--       `if v_used >= p_limit` بيبقى NULL ⇒ false دايماً).
--    ٢) الـ RPC بيرمي ⇒ `consumeServiceQuota` بيرجّع `allowed: false`
--       (fail closed) ⇒ **كل خدمة محسوبة بالحد اليومي كانت بتفشل بـ 402
--       «تعذر التحقق من حصة الخدمة»**: توليد الصور، المخططات، وتصدير
--       PDF/Word/Excel/PPT.
--
--    ⇒ التصليح: **تأهيل اسم العمود** (`t.used`) في الـ SELECT والـ UPDATE.
--
-- ⚠️ **الجدول والدالة مش في أي migration** (اتعملوا يدوي في SQL Editor)
--    ⇒ الملف ده **بيوثّقهم كمان** عشان قاعدة جديدة تتعمل صح.
--
-- idempotent: `create table if not exists` + `create or replace function`.
-- ============================================================================

-- ١) جدول العدّاد اليومي — الشكل زي ما هو في القاعدة.
create table if not exists public.ai_service_usage_daily (
  user_id    uuid not null,
  service    text not null,
  day        date not null default ((now() at time zone 'utc')::date),
  used       integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint ai_service_usage_daily_pkey primary key (user_id, service, day)
);

-- ٢) السياسات — زي ما هي في القاعدة.
--    ⚠️ `ai_service_usage_daily_service_all` (ALL, qual=true) سابت للمستخدم
--    يقرأ/يكتب أي صف — ده م worrying، بس **مش هيتغيّر هنا** (تغيير
--    سياسات الوصول قرار أمني لوحده). متسجّل في TECH_DEBT.
drop policy if exists "ai_service_usage_daily_owner_select" on public.ai_service_usage_daily;
create policy "ai_service_usage_daily_owner_select" on public.ai_service_usage_daily
  for select using (auth.uid() = user_id);

drop policy if exists "ai_service_usage_daily_service_all" on public.ai_service_usage_daily;
create policy "ai_service_usage_daily_service_all" on public.ai_service_usage_daily
  for all using (true) with check (true);

-- ٣) الدالة — **بالتأهيل** (ده هو التصليح).
create or replace function public.consume_service_quota(
  p_user_id uuid,
  p_service text,
  p_limit integer
)
returns table(allowed boolean, used integer)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_used int;
begin
  if p_user_id is null or p_service is null or btrim(p_service) = '' then
    raise exception 'consume_service_quota: p_user_id and p_service required';
  end if;
  if p_limit is null or p_limit < 0 then
    raise exception 'consume_service_quota: p_limit must be >= 0';
  end if;
  if auth.uid() is not null and auth.uid() != p_user_id and coalesce((auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'consume_service_quota: forbidden';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_service || ':' || v_day::text)::bigint);

  insert into public.ai_service_usage_daily (user_id, service, day, used)
  values (p_user_id, p_service, v_day, 0)
  on conflict (user_id, service, day) do nothing;

  -- ⚠️ **`t.used` مش `used`** — الـ OUT parameter اسمه `used` فبيبقى
  --    الـ column reference غامض. من غير التأهيل: الـ SELECT بيرجّع NULL
  --    (الـ variable بدل الـ column) ⇒ الحد مش بيتطبَّق، والـ UPDATE
  --    بيرمي 42702.
  select t.used into v_used
  from public.ai_service_usage_daily t
  where t.user_id = p_user_id and t.service = p_service and t.day = v_day
  for update;

  if v_used is null then
    v_used := 0;
  end if;

  if v_used >= p_limit then
    return query select false::boolean, v_used::int;
    return;
  end if;

  update public.ai_service_usage_daily t
  set used = t.used + 1, updated_at = now()
  where t.user_id = p_user_id and t.service = p_service and t.day = v_day
  returning t.used into v_used;

  return query select true::boolean, v_used::int;
end;
$function$;

-- ============================================================================
-- ⚠️ ملاحظات قبل التنفيذ:
--   ١) idempotent — يتنفّذ أكتر من مرة.
--   ٢) **مش** بيعدّل بيانات العدّاد (سجلّ `used` موجود زي ما هو).
--   ٣) بعد التطبيق: حدّ `file_pptx` / `documents_slides` / `image` /
--      `diagram` هيرجع يشتغل تاني للمستخدمين المسجّلين.
-- ============================================================================
