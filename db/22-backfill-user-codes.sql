-- ============================================================
-- EPIC-6 Phase 2 — Backfill public_user_code for existing users
-- ============================================================
--هذا الملف يُشغّل مرة واحدة في Supabase SQL Editor.
--يقوم بتفعيل الت変 של public_user_code لكل الملفات الشخصية الموجودة
--التي لا تحمل كوداً، عبر تعويض العمود بـ NULL ثم ترك الـ trigger
--القائم (set_public_user_code) يولد الكود تلقائياً بصيغة MAG-XXX-XXXX.

-- 1) مسح الأكواد الفارغة أو النNull لتفعيل الـ trigger عند التحديث
UPDATE public.profiles
SET public_user_code = NULL
WHERE public_user_code IS NULL OR public_user_code = '';

-- 2) تحقق: عدد المستخدمين الذين ما زالوا بدون كود (يجب أن يكون 0 بعد التشغيل)
SELECT COUNT(*) AS users_without_code
FROM public.profiles
WHERE public_user_code IS NULL OR public_user_code = '';

-- 3) عينة من الأكواد المولدة للتأكد من الصيغة
SELECT id, display_name, public_user_code
FROM public.profiles
WHERE public_user_code IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;