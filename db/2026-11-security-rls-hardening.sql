-- ============================================================
-- Security hardening — RLS for profiles / payments / site_admins
-- التاريخ: ٢٠٢٦-١١-١١
-- ============================================================
--
-- المشكلة (من تقرير التدقيق):
--   1) profiles: سياسة "profiles: public read" USING (true) — أي زائر يقرأ
--      كل الصفوف، بما فيها عمود email (PII لكل المستخدمين).
--   2) payments: "payments_admin_read" USING (true) + "payments_admin_write"
--      WITH CHECK (true) — أي زائر يقرأ/يكتب سجل الدفعات.
--   3) site_admins: "site_admins: owner reads" USING (true) — أي زائر يعرف
--      مين الأدمن/المالك (user_id) → يمكّن انتحال الهوية في أفعال قديمة.
--
-- الحل:
--   - profiles: القراءة لصاحب الصف فقط (auth.uid() = id). اللوحة العامة
--     (leaderboard) تقرأ من view آمن `public_profiles` بدون email.
--   - payments: القراءة لصاحب الدفعة فقط، والكتابة من الكلاينت ممنوعة تمامًا
--     (service_role بيتجاوز RLS، وده المسار الوحيد للكتابة عبر لوحة الأدمن).
--   - site_admins: القراءة لصاحب الصف أو أي أدمن حالي (دالة security definer
--     تتفادى الـrecursion).
--
-- ⚠️ آمن للتكرار (idempotent): كل السياسات بتتعمل DROP IF EXISTS قبل CREATE،
--    والـview بـ CREATE OR REPLACE.
--
-- نفّذه يدويًا في Supabase SQL Editor.
-- ============================================================

begin;

-- ────────────────────────────────────────────────────────────
-- 1) profiles — اقفل القراءة العامة، وافتح view آمن للـleaderboard
-- ────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "profiles: public read" on public.profiles;
drop policy if exists "profiles: owner read" on public.profiles;
create policy "profiles: owner read"
  on public.profiles for select
  using (auth.uid() = id);

-- إسقاط آمن للأعمدة العامة فقط (لا email، لا بيانات حساسة).
create or replace view public.public_profiles as
select
  id,
  display_name,
  xp,
  streak,
  public_user_code,
  persona,
  role,
  created_at
from public.profiles;

-- الـview مملوك لـpostgres → بيتجاوز RLS، وبيكشف الأعمدة المختارة فقط.
revoke all on public.public_profiles from public;
grant select on public.public_profiles to anon, authenticated;

-- عمود email: ممنوع تمامًا على anon. الـauthenticated يقدر يقرأه لصفّه فقط
-- (بسبب سياسة القراءة أعلاه).
revoke select (email) on public.profiles from anon;

-- ────────────────────────────────────────────────────────────
-- 2) payments — قراءة لصاحب الدفعة فقط، ومنع الكتابة من الكلاينت
-- ────────────────────────────────────────────────────────────
alter table public.payments enable row level security;

drop policy if exists payments_admin_read on public.payments;
drop policy if exists payments_owner_read on public.payments;
create policy payments_owner_read
  on public.payments for select
  using (auth.uid() = user_id);

drop policy if exists payments_admin_write on public.payments;
drop policy if exists payments_no_client_write on public.payments;
create policy payments_no_client_write
  on public.payments for insert
  with check (false);

-- مفيش سياسات update/delete للكلاينت → service_role فقط.

-- ────────────────────────────────────────────────────────────
-- 3) site_admins — ممنوع على الزوار، مسموح للأدمن الحالي
-- ────────────────────────────────────────────────────────────
alter table public.site_admins enable row level security;

-- security definer عشان استعلام السياسة على نفس الجدول ما يعملش recursion.
create or replace function public.is_site_admin()
returns boolean
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select exists (
    select 1 from public.site_admins where user_id = auth.uid()
  );
$$;

revoke all on function public.is_site_admin() from public, anon;
grant execute on function public.is_site_admin() to authenticated;

drop policy if exists "site_admins: owner reads" on public.site_admins;
drop policy if exists "site_admins: admins read" on public.site_admins;
create policy "site_admins: admins read"
  on public.site_admins for select
  using (auth.uid() = user_id or public.is_site_admin());

commit;
