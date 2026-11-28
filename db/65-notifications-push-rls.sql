-- ============================================================================
-- G0-F (Engagement Engine) — Push / Notifications: Ownership Boundary Fix
-- Date: 2026-11-21
-- Branch: feat/engagement-p1b2-discovery
--
-- GOAL (منهج G0): تأمين حدود الملكية في نظامي notifications و
--   push_subscriptions — **بدون** إعادة تصميم نظام الإشعارات، **بدون** حذف
--   أو دمج الـSchema القديم/الحديث، **بدون** إطلاق Push campaigns،
--   وبدون لمس Coins/XP أو أي نظام آخر.
--
-- ── الجرد (الإنتاج، read-only) ─────────────────────────────────────────────
--   notifications (143 صفًا — الـSchema الحديث هو المستخدم فعليًا):
--     * سياسات الحديث (notifications self read/update) على recipient_id — سليمة.
--     * سياسات القديم (notifications: own read/update/delete) على
--       `user_id IS NULL OR user_id = auth.uid()` ⇒ **أي مستخدم يستطيع
--       قراءة/تعديل/حذف أي صف فيه user_id IS NULL** — وصفوف الـSchema الحديث
--       تُكتب غالبًا دون user_id (موجود فعلًا: 1 صف support). ثغرة ملكية
--       (خصوصية رسائل الدعم/الإشعارات الموجهة).
--     * اتساق البيانات مُتحقق منه: **0 صفوف** فيها user_id ≠ recipient_id،
--       و**0 صفوف** legacy-only — يعني استبدال ملكية السياسات القديم
--       بـrecipient_id يحافظ على كل الوصول المشروع دون أي تغيير بيانات.
--     * مسارات الكتابة كلها سيرفرية: app/api/notifications (GET/PATCH
--       session-scoped عبر service)، support actions (جلسة + فحص ملكية +
--       service)، admin broadcast (G0-E). لا سياسة INSERT للعملاء — سليم.
--   push_subscriptions (0 صفوف):
--     * RLS مفعّل **بلا أي سياسة** ⇒ /api/push/subscribe (upsert عبر عميل
--       authenticated، والهوية من الجلسة) **يفشل دائمًا** — وهذه هي حالة
--       الإنتاج (0 صفوف): ميزة الإشعارات مكسورة، والمستخدم لا يستطيع
--       التسجيل ولا الإلغاء.
--     * فهرس فريد على user_id موجود ⇒ الـupsert سليم بمجرد فتح السياسات.
--   الإرسال (push sending):
--     * الإرسال يحدث من السيرفر فقط (cron streak-reminder عبر web-push +
--       service client). لا مسار عميل لإرسال Push — لا يمكن لأي مستخدم
--       إرسال إشعارات للآخرين.
--   Cron:
--     * isAuthorizedCronRequest = CRON_SECRET فشل مغلق بمقارنة زمنية آمنة.
--     * streak-reminder حقيقي: يقرأ الاشتراكات، يبني الرسالة، يرسل، ويحذف
--       الاشتراكات الميتة (stale) — ليس Cron شكليًا.
--   Rate limiting:
--     * الاشتراك upsert idempotent على user_id (صف واحد كحد أقصى لكل مستخدم
--       بفهرس فريد) ⇒ لا نمو إساءة محتمل من التسجيل المتكرر؛ لا حاجة لسقف
--       إضافي في هذا النطاق (موثق).
--
-- ── الإصلاح (سياسات فقط — لا تغيير أعمدة ولا بيانات) ───────────────────────
--   1) notifications: استبدال سياسات القديم الثلاث بمرادفات على recipient_id
--      (نفس الأوامر SELECT/UPDATE/DELETE) ⇒ ملكية حقيقية لكل صف، مع بقاء
--      الوصول المشروع كما هو تمامًا (مُثبت بالاتساق أعلاه).
--   2) push_subscriptions: إضافة سياسات own-row (user_id = auth.uid())
--      لـSELECT/INSERT/UPDATE/DELETE ⇒ يعيد تشغيل ميزة الاشتراك/الإلغاء
--      مع ملكية صارمة (المستخدم يرى/يحذف اشتراكه فقط — ولا يستطيع التلاعب
--      باشتراك غيره). القراءة من الـcron تبقى عبر service role.
--
-- DEPLOYMENT NOTE: لا يُطبّق على الإنتاج بدون تفويض صريح. التحقق على
--   Local/Staging (scripts/g0f-notifications-push-verify.mjs يرفض الإنتاج).
--
-- ROLLBACK:
--   drop policy ... (سياسات db/65 الأربع على push_subscriptions)؛
--   create policy "notifications: own read"    ... using ((user_id is null) or (user_id = auth.uid()));
--   create policy "notifications: own update"  ... using (...) with check (...);
--   create policy "notifications: own delete"  ... using ((user_id is null) or (user_id = auth.uid()));
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ١) notifications — استبدال سياسات القديم بملكية recipient_id
--    (البيانات متسقة: كل صف له user_id لديه recipient_id مساوٍ له — 0 mismatches)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "notifications: own read" ON public.notifications;
DROP POLICY IF EXISTS "notifications: own update" ON public.notifications;
DROP POLICY IF EXISTS "notifications: own delete" ON public.notifications;

CREATE POLICY "notifications: own read (recipient)"
  ON public.notifications FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "notifications: own update (recipient)"
  ON public.notifications FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "notifications: own delete (recipient)"
  ON public.notifications FOR DELETE
  USING (recipient_id = auth.uid());

COMMENT ON POLICY "notifications: own read (recipient)" ON public.notifications IS
  'G0-F: replaced the legacy user_id IS NULL OR owner policy, which exposed recipient-only rows (modern schema) to every user. All 143 live rows have user_id = recipient_id (0 mismatches), so legitimate access is unchanged.';

-- ----------------------------------------------------------------------------
-- ٢) push_subscriptions — سياسات own-row (إصلاح الاشتراك المكسور)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "push_subscriptions: own read" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions: own insert" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions: own update" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions: own delete" ON public.push_subscriptions;

CREATE POLICY "push_subscriptions: own read"
  ON public.push_subscriptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "push_subscriptions: own insert"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_subscriptions: own update"
  ON public.push_subscriptions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_subscriptions: own delete"
  ON public.push_subscriptions FOR DELETE
  USING (user_id = auth.uid());

COMMENT ON TABLE public.push_subscriptions IS
  'G0-F: own-row RLS restored the broken subscribe/unsubscribe flow (RLS had no policies). user_id comes from the server session in /api/push/subscribe; sending happens server-side only (cron, CRON_SECRET fail-closed).';

COMMIT;
