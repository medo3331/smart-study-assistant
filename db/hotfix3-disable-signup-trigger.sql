-- ============================================================
-- HOTFIX 3 — تعطيل مؤقت لـtrigger signup_bonus
-- ============================================================
--
-- الهدف: تعطيل trigger handle_signup_bonus مؤقتاً لاختبار
-- هل هو سبب فشل anonymous user creation
--
-- ⚠️ ملاحظة: بعد التعطيل، anonymous users مش هياخدوا signup bonus
-- لكن ده مؤقت للتشخيص فقط
-- ============================================================

-- تعطيل الـtrigger
DROP TRIGGER IF EXISTS trg_signup_bonus ON public.profiles;

-- بعد الاختبار، لو حبيت ترجعه:
-- CREATE TRIGGER trg_signup_bonus
-- AFTER INSERT ON public.profiles
-- FOR EACH ROW EXECUTE FUNCTION public.handle_signup_bonus();
