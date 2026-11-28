-- ============================================================================
-- G0-E (Engagement Engine) — Admin / Announcements: Data-Boundary Fix
-- Date: 2026-11-21
-- Branch: feat/engagement-p1b2-discovery
--
-- GOAL (منهج G0): إصلاح حدود الأمان في منظومة الإدارة والإعلانات — بدون
--   بناء نظام Notifications كامل، وبدون لمس Coins/XP/goal_done أو أي نظام آخر.
--
-- ── الجرد (الإنتاج، read-only) ─────────────────────────────────────────────
--   * admin_announcements: RLS مفعّل، لكن السياسة الوحيدة
--     `admin_announcements service read` USING (true) ⇒ **أي زائر أو مستخدم
--     يمكنه قراءة كل إعلانات الإدارة** بما فيها target_user_id (بيانات
--     استهداف المستخدمين). والتدقيق في الكود أثبت أنه **لا يوجد أي مسار
--     قراءة عميل** لهذا الجدول إطلاقًا — القراءة الوحيدة عبر service client
--     (server) داخل مسارات محمية بـannouncements.manage + audit. مثال سابق
--     كان استغلالًا P0 في P1-A (§12.5) — ما زال حيًا.
--   * user_inbox: مالك الصف يقرأ/يحدّث صفوفه (سليم)، لكن صلاحية UPDATE على
--     مستوى الجدول تسمح للمالك بتغيير **أي عمود** في رسائله (subject/body/
--     user_id) — والاستخدام المشروع الوحيد في التطبيق هو تحديث is_read/read_at
--     (app/inbox/page.tsx). الكتابة (إضافة رسائل) تتم عبر service client فقط
--     (بلا سياسة INSERT ⇒ مرفوضة من العميل) — سليم.
--   * email_deliveries: سياسة SELECT USING(false) + كتابة عبر service — سليم.
--   * announcements / announcement_reads: قراءة المنشور فقط للعميل، تعليم
--     القراءة self-insert مع شرط المنشور — سليم.
--   * مسار البث الإداري (app/admin/actions/messaging.ts) وكامل واجهات
--     /api/announcements: هوية من الجلسة + hasPermission(announcements.manage)
--     على السيرفر لكل عملية + كتابة service + audit — سليم، لا تغيير.
--
-- ── الإصلاح (additive، بلا حذف بيانات) ─────────────────────────────────────
--   1) admin_announcements: حذف السياسة العامة ⇒ رفض افتراضي للعملاء؛
--      الـservice role يتجاوز RLS ولا يتأثر بحدّ المنح.
--   2) user_inbox: تقييد UPDATE للمالك على العمودين المشروعين فقط
--      (is_read, read_at) عبر منح أعمدة — بقاء تجربة الطالب كما هي.
--   3) تعميق دفاعي: سحب منح anon/authenticated غير المستخدمة من الجداول
--      الثلاثة (RLS يبقى الحاجز الأساسي؛ الـservice role منحُه محفوظ).
--
-- ⚠️ لا DROP لجداول، لا حذف سياسات المالك في user_inbox، لا تغيير أعمدة.
--
-- DEPLOYMENT NOTE: لا يُطبّق على الإنتاج بدون تفويض صريح. التحقق على
--   Local/Staging (scripts/g0e-admin-boundary-verify.mjs يرفض الإنتاج).
--
-- ROLLBACK:
--   create policy "admin_announcements service read" on public.admin_announcements
--     for select using (true);
--   grant all on public.admin_announcements to anon, authenticated;
--   grant all on public.user_inbox to anon, authenticated;  -- أو استعادة المنح السابقة
--   grant all on public.email_deliveries to anon, authenticated;
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ١) admin_announcements — إغلاق القراءة العامة (P0)
--    لا سياسات عميل تبقى ⇒ رفض افتراضي عبر RLS. الـservice client (المسار
--    الوحيد في الكود) يتجاوز RLS، ومنحه محفوظ.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_announcements service read" ON public.admin_announcements;
DROP POLICY IF EXISTS "admin_announcements: admin read" ON public.admin_announcements;

REVOKE ALL ON TABLE public.admin_announcements FROM anon;
REVOKE ALL ON TABLE public.admin_announcements FROM authenticated;
REVOKE TRUNCATE ON TABLE public.admin_announcements FROM anon;
REVOKE TRUNCATE ON TABLE public.admin_announcements FROM authenticated;

COMMENT ON TABLE public.admin_announcements IS
  'G0-E: server-only. No client policies; reads/writes via service client behind announcements.manage + audit. Client access denied by default (RLS, no policies).';

-- ----------------------------------------------------------------------------
-- ٢) user_inbox — تقييد تحديث المالك للعمودين المشروعين فقط
--    (تجربة صفحة /inbox محفوظة: تعليم الرسالة مقروءة يحدث is_read/read_at)
-- ----------------------------------------------------------------------------
REVOKE UPDATE ON TABLE public.user_inbox FROM anon;
REVOKE UPDATE ON TABLE public.user_inbox FROM authenticated;
REVOKE INSERT ON TABLE public.user_inbox FROM anon;
REVOKE INSERT ON TABLE public.user_inbox FROM authenticated;
REVOKE DELETE ON TABLE public.user_inbox FROM anon;
REVOKE DELETE ON TABLE public.user_inbox FROM authenticated;

GRANT SELECT ON TABLE public.user_inbox TO authenticated;
GRANT UPDATE (is_read, read_at) ON TABLE public.user_inbox TO authenticated;

-- ----------------------------------------------------------------------------
-- ٣) email_deliveries — تعميق دفاعي (سياسة USING(false) تبقى كما هي)
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.email_deliveries FROM anon;
REVOKE ALL ON TABLE public.email_deliveries FROM authenticated;
REVOKE TRUNCATE ON TABLE public.email_deliveries FROM anon;
REVOKE TRUNCATE ON TABLE public.email_deliveries FROM authenticated;

COMMIT;
