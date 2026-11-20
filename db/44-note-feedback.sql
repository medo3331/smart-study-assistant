-- db/44-note-feedback.sql
--
-- ⭐ تقييمات الطلاب لميزة «النوت الجانبية» (وضع المذاكرة).
--
-- التقييم بيتبعت كتذكرة دعم بفئة جديدة 'feedback' عشان تظهر في
-- صندوق الدعم للأدمن مع باقي رأي الطلاب — من غير جدول جديد.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.support_tickets'::regclass
      AND conname = 'support_tickets_category_check'
  ) THEN
    ALTER TABLE public.support_tickets
      DROP CONSTRAINT support_tickets_category_check;
  END IF;
END $$;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_category_check
  CHECK (category IN ('login','account','payment','bug','content','performance','feedback','other'));

notify pgrst, 'reload schema';
