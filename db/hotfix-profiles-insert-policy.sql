-- ============================================================
-- HOTFIX — Profiles INSERT Policy (Guest Login 500 Fix)
-- التاريخ: ٢٠٢٦-٠٩-٢٣
-- ============================================================
--
-- المشكلة:
--   db/economy-phase-b.sql حذف UPDATE policies وأعاد إنشاء واحدة فقط،
--   لكن لم ينشئ أي INSERT policy على profiles.
--   النتيجة: guest login وsignup يفشلان بـ500 لأن insert profile يفشل بسبب RLS.
--
-- الحل:
--   إضافة INSERT policy تسمح للمستخدم بإنشاء profile خاص به فقط.
--
-- آمن للتكرار: IF NOT EXISTS على policies غير مدعوم، لكن DROP IF EXISTS يعمل.
-- ============================================================

-- 1) التأكد من تفعيل RLS (احتياطي)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2) إضافة INSERT policy
DROP POLICY IF EXISTS "profiles: owner insert" ON public.profiles;
CREATE POLICY "profiles: owner insert"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 3) التأكد من وجود SELECT policy (لصاحب الصف فقط)
-- ⚠️ أمان (2026-11): كانت `USING (true)` — أي زائر يقرأ كل الصفوف بما فيها
-- email. دلوقتي صاحب الصف فقط. اللوحة العامة (leaderboard) تقرأ من الـview
-- الآمن `public.public_profiles` (db/2026-11-security-rls-hardening.sql).
DROP POLICY IF EXISTS "profiles: public read" ON public.profiles;
DROP POLICY IF EXISTS "profiles: owner read" ON public.profiles;
CREATE POLICY "profiles: owner read"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- ملاحظات:
-- - INSERT policy تسمح للمستخدم بإنشاء صف واحد فقط (id = auth.uid())
-- - Trigger set_public_user_code() سيشتغل تلقائيًا عند INSERT
-- - Trigger protect_profiles_xp لن يتدخل في INSERT (يعمل على UPDATE فقط)
-- - SELECT لصاحب الصف فقط — لا قراءة عامة، ولا عمود email للزوار.
