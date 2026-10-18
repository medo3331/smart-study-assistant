-- ============================================================
-- EPIC-6 / Phase 3 — public_user_code backfill (المستخدمين الحاليين)
-- ============================================================
-- المتطلب المسبق: db/epic6-user-code.sql مُطبّق على الداتابيز
--   (العمود public_user_code + الدالة generate_public_user_code()
--    +.trigger trg_set_public_user_code).
--
-- الغرض: توليد public_user_code (مAG-XXX-XXXX) لكل المستخدمين الحاليين
-- الذين لا يملكون كوداً (صفوف قديمة أنشأها النظام قبل تفعيل الـ trigger).
-- الآلية: إجراء تحديث يُفرغ العمود (NULL) للصفوف المستهدفة → الـ trigger
-- (BEFORE UPDATE) يملأ القيمة تلقائياً بالدالة الكنسية generate_public_user_code().

-- ─────────────────────────────────────────────────────────────
-- 1) تقرير قبل التنفيذ
-- ─────────────────────────────────────────────────────────────
SELECT
  count(*) AS total_profiles,
  count(public_user_code) AS profiles_with_code,
  count(*) - count(public_user_code) AS profiles_without_code
FROM public.profiles;

-- ─────────────────────────────────────────────────────────────
-- 2) backfill: إجبار إعادة التوليد للصفوف التي لا تحتوي كوداً
--    (ملاحظة: UPDATE على الصفوف التي قيمتها بالفعل NULL يُعيد إطلاق
--     الـ trigger لأن Postgres لا يختبر تساوي القيم قبل الإطلاق.)
-- ─────────────────────────────────────────────────────────────
UPDATE public.profiles
SET public_user_code = NULL
WHERE public_user_code IS NULL OR public_user_code = '';

-- ─────────────────────────────────────────────────────────────
-- 3) تقرير بعد التنفيذ
-- ─────────────────────────────────────────────────────────────
SELECT
  count(*) AS total_profiles,
  count(public_user_code) AS profiles_with_code,
  count(*) - count(public_user_code) AS profiles_without_code
FROM public.profiles;

-- ─────────────────────────────────────────────────────────────
-- 4) عينة للتحقق من الصيغة الكنسية (MAG-XXX-XXXX)
-- ─────────────────────────────────────────────────────────────
SELECT id, display_name, email, public_user_code
FROM public.profiles
WHERE public_user_code IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;