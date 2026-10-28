-- ============================================================================
-- EPIC 6 / Mentor Phase — Personal Context for AI Mentor
-- إضافة حقول التخصص والهدف التعليمي لجدول profiles لدعم المعلم الذكي الموحّد
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor. آمن للإعادة (IF NOT EXISTS).
-- ============================================================================

-- 1) إضافة عمود study_field (التخصص الدراسي) إن لم يكن موجوداً
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'study_field'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN study_field text;
    RAISE NOTICE 'Added profiles.study_field';
  ELSE
    RAISE NOTICE 'profiles.study_field already exists, skipping.';
  END IF;
END $$;

-- 2) إضافة عمود learning_goal (الهدف التعليمي) إن لم يكن موجوداً
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'learning_goal'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN learning_goal text;
    RAISE NOTICE 'Added profiles.learning_goal';
  ELSE
    RAISE NOTICE 'profiles.learning_goal already exists, skipping.';
  END IF;
END $$;

-- 3) فهرس للبحث السريع حسب التخصص (اختياري، يحسّن استعلامات المعلم)
CREATE INDEX IF NOT EXISTS profiles_study_field_idx
  ON public.profiles (study_field);

-- ============================================================================
-- ملاحظات تنفيذية:
-- - لا يوجد حذف للبيانات؛ التعديل تراكمي فقط (additive).
-- - بعد التنفيذ، يمكن تحديث الحقول عبر واجهة الملف الشخصي أو Offenboarding.
-- - الـ trigger التلقائي لـ public_user_code غير متأثر بهذا التغيير.
-- ============================================================================
