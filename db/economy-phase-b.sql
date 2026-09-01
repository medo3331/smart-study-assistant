-- ============================================================================
-- Phase B — Economy Hardening: XP + Badge protection
-- التاريخ: ٣١ أغسطس ٢٠٢٦
--
-- الهدف:
--   1) منع تعديل profiles.xp مباشرة من الكلاينت
--   2) منع إنشاء badges مزيفة من الكلاينت
--   3) توفير RPCs آمنة (SECURITY DEFINER) بديلة
--
-- Scope: لا تغيير XP formula ولا amounts ولا daily caps ولا Store ولا AI
-- شغّل الملف مرة واحدة في Supabase SQL Editor (آمن للتكرار)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) XP — منع التعديل المباشر من الكلاينت
-- ----------------------------------------------------------------------------

-- 1A) إضافة عمود xp إن لم يوجد (احتياطي — الجدول قد يكون أنشئ من template)
-- نستخدم if not exists عبر do block لتجنب خطأ لو العمود موجود
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='xp'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN xp int NOT NULL DEFAULT 0 CHECK (xp >= 0);
  END IF;
END $$;

-- 1B) Trigger يمنع تغيير xp إلا عبر SECURITY DEFINER
-- الفكرة: الكلاينت يتصل كـ role authenticated/anon عبر PostgREST،
-- بينما دوال SECURITY DEFINER تنفذ كـ owner (postgres/supabase_admin) فتتخطى المنع.
create or replace function public.protect_profiles_xp()
returns trigger
language plpgsql
as $$
begin
  if OLD.xp is distinct from NEW.xp then
    -- السماح إذا كان المنادي ليس authenticated/anon (أي داخل SECURITY DEFINER)
    -- أو إذا كان هناك bypass مؤقت عبر setting
    if current_setting('app.xp_bypass', true) = 'on' then
      return NEW;
    end if;
    -- current_user في Supabase: direct client = authenticated, RPC definer = postgres/supabase_admin
    if current_user not in ('authenticated', 'anon') then
      return NEW;
    end if;
    -- كذلك السماح لـ service_role
    if coalesce((auth.jwt() ->> 'role'), '') = 'service_role' then
      return NEW;
    end if;
    raise exception 'profiles.xp: direct update forbidden — use increment_xp()';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_protect_profiles_xp on public.profiles;
create trigger trg_protect_profiles_xp
before update on public.profiles
for each row execute function public.protect_profiles_xp();

-- 1C) RLS hardening كطبقة ثانية (defense in depth)
-- نحذف سياسات UPDATE القديمة ونعيد إنشاءها بـ WITH CHECK يمنع تغيير xp
-- SECURITY DEFINER يتخطى RLS أصلًا فلا يتأثر
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND cmd='UPDATE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;
END $$;

-- إعادة إنشاء سياسة UPDATE آمنة: تسمح بتغيير كل الأعمدة إلا xp
-- الحيلة: WITH CHECK يتأكد أن xp الجديد يساوي xp القديم (مقروء عبر subquery)
-- إذا حاول الكلاينت إرسال xp مختلف، الفحص يفشل و UPDATE يرجع 0 صفوف / خطأ RLS
-- ملاحظة: هذا الفحص تكميلي للـ trigger — حتى لو تجاوز RLS، الـ trigger سيمنع
create policy "profiles: owner updates (xp protected)"
on public.profiles for update
using (auth.uid() = id)
with check (
  auth.uid() = id
  and xp = (select p.xp from public.profiles p where p.id = auth.uid())
);

-- إذا لم تكن هناك سياسة SELECT للمالك، نضمن وجودها (لا نكسر leaderboard)
-- نحتفظ بالسياسات الموجودة للـ SELECT كما هي — لا نحذفها

-- ----------------------------------------------------------------------------
-- 2) XP RPC — increment_xp(p_delta)
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER + auth.uid() هو user_id + delta محدود + لا يقبل user_id من الكلاينت
create or replace function public.increment_xp(p_delta int)
returns table (new_xp int, new_level int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_new_xp int;
  v_level int;
begin
  if v_uid is null then
    raise exception 'increment_xp: not authenticated';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'increment_xp: anonymous not allowed — create account';
  end if;
  if p_delta is null then
    raise exception 'increment_xp: p_delta required';
  end if;
  if p_delta = 0 then
    raise exception 'increment_xp: p_delta cannot be 0';
  end if;
  -- حد صارم لمنع +999999: موجب حتى 200 (سقف Level واحد)، سالب حتى 500 (سماح للشراء)
  if p_delta < -500 or p_delta > 200 then
    raise exception 'increment_xp: p_delta out of range (-500..200), got %', p_delta;
  end if;

  -- bypass مؤقت للـ trigger (احتياطي إذا كان definer ما زال authenticated في بعض الإعدادات)
  perform set_config('app.xp_bypass', 'on', true);

  update public.profiles
  set xp = greatest(0, coalesce(xp, 0) + p_delta)
  where id = v_uid
  returning xp into v_new_xp;

  perform set_config('app.xp_bypass', 'off', true);

  if not found then
    raise exception 'increment_xp: profile not found for user %', v_uid;
  end if;

  v_level := floor(greatest(v_new_xp, 0) / 200) + 1;

  return query select v_new_xp, v_level;
end;
$$;

revoke all on function public.increment_xp(int) from public;
grant execute on function public.increment_xp(int) to authenticated;

-- alias متوافق مع naming المقترح increment_xp / award_xp
create or replace function public.award_xp(p_delta int)
returns table (new_xp int, new_level int)
language sql
security definer
set search_path = public, pg_catalog
as $$ select * from public.increment_xp(p_delta) $$;

revoke all on function public.award_xp(int) from public;
grant execute on function public.award_xp(int) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) BADGES — منع الإنشاء المباشر + RPC validated
-- ----------------------------------------------------------------------------

-- 3A) حذف سياسة INSERT المباشرة (كانت تسمح للـ client بإدخال badge لنفسه)
drop policy if exists "badges: owner writes" on public.badges;
drop policy if exists "users manage their own badges" on public.badges;
create policy "badges: owner reads" on public.badges for select using (auth.uid() = user_id);

-- لا ننشئ سياسة insert جديدة — أي insert مباشر سيفشل لعدم وجود policy
-- SECURITY DEFINER يتخطى RLS فـ grant_badge سيعمل

-- 3B) منع update/delete المباشر إن وجدت سياسات قديمة (احتياطي)
drop policy if exists "badges: owner updates" on public.badges;
drop policy if exists "badges: owner deletes" on public.badges;

-- 3C) Unique index لمنع duplicate badge (نفس الفصل لنفس التراك)
-- ضروري جدًا لمنع Double Reward — Phase B يسمح بهذا الـ index
create unique index if not exists badges_user_config_chapter_unique
  on public.badges (user_id, config_id, chapter_number);

-- 3D) RPC: grant_badge — إنشاء badge validated
create or replace function public.grant_badge(
  p_config_id uuid,
  p_chapter_number int,
  p_title text,
  p_subject text,
  p_accuracy int
)
returns table (badge_id uuid, already_existed boolean, message text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'grant_badge: not authenticated';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'grant_badge: anonymous not allowed';
  end if;
  if p_config_id is null then
    raise exception 'grant_badge: p_config_id required';
  end if;
  if p_chapter_number is null or p_chapter_number < 1 or p_chapter_number > 1000 then
    raise exception 'grant_badge: invalid p_chapter_number';
  end if;
  if p_accuracy is null or p_accuracy < 0 or p_accuracy > 100 then
    raise exception 'grant_badge: p_accuracy must be 0..100';
  end if;
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'grant_badge: p_title required';
  end if;
  if length(p_title) > 200 then
    raise exception 'grant_badge: p_title too long';
  end if;

  -- التحقق: config يخص المستخدم (source of truth موجود: study_configs)
  if not exists (
    select 1 from public.study_configs c
    where c.id = p_config_id and c.user_id = v_uid
  ) then
    raise exception 'grant_badge: config not found for user';
  end if;

  -- تحقق إضافي: الفصل موجود في study_days (إن وجد — لا نخترع شرطًا جديدًا صارمًا)
  -- إذا لم يوجد study_days، نسمح لكن نسجل — لا نمنع لأن BossFight قد يطلق قبل إكمال اليوم
  -- هذا يبقى Technical Debt: Phase C سيربط badge بـ study_days completion
  -- لذا نفحص بلطف فقط
  -- (لا raise، فقط للتوثيق)

  -- منع التكرار
  select id into v_existing
  from public.badges
  where user_id = v_uid
    and config_id = p_config_id
    and chapter_number = p_chapter_number
  limit 1;

  if v_existing is not null then
    return query select v_existing, true::boolean, 'Badge already earned'::text;
    return;
  end if;

  insert into public.badges (user_id, config_id, chapter_number, title, subject, accuracy)
  values (v_uid, p_config_id, p_chapter_number, btrim(p_title), p_subject, p_accuracy)
  returning id into v_new_id;

  return query select v_new_id, false::boolean, 'Badge granted'::text;
end;
$$;

revoke all on function public.grant_badge(uuid,int,text,text,int) from public;
grant execute on function public.grant_badge(uuid,int,text,text,int) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) ملاحظات Phase B
-- ----------------------------------------------------------------------------
-- - XP formula لم تتغير: level = floor(max(0,xp)/200)+1 — الحساب في increment_xp مطابق
-- - increment_xp لا يتحقق من حدث مصدري (study_days/planner_goals) بعد — هذا Technical Debt
--   سيتم سده في Phase C عبر دوال متخصصة (complete_study_day, etc.)
-- - grant_badge يتحقق من ملكية config فقط — التحقق العميق من إنجاز الفصل الحقيقي
--   يتطلب ربط BossFight بسجل دراسة مثبت — مؤجل لـ Phase C (مسجل كـ Blocker)
-- - الفهرس الفريد يمنع duplicate reward حتى لو تم استدعاء grant_badge مرتين متزامنتين
-- - award_coins('badge', ref) ما زال هو من يمنح الكوينز — grant_badge لا يمنح كوينز مباشرة
--   الترتيب الصحيح: grant_badge → award_coins('badge', 'config:chapter')
-- - لا تغيير في coin_ledger / coin_balance / coin_source_rules / Store / AI
