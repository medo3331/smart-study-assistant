-- ============================================================
-- Phase 1.5 — app_settings (billing flags) — MANUAL EXECUTION on Supabase
-- ============================================================
-- الغرض: الجدول كان مُستخدم فعليًا في الكود بدون أي migration:
--   - app/plans/actions.ts        (readBillingSettings / updateBillingSettings)
--   - lib/plans/settings.ts       (getPlanSettings — صفحة /pricing العامة)
-- بدونه كل الكتابات بتفشل والقراءات بترجع defaults.

-- 1) الجدول
CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) RLS — القراءة عامة (الأعلام دي بتتعرض على /pricing لأي زائر، مش بيانات حساسة).
--    الكتابة تحصل فقط عبر service_role من السيرفر (بيتجاوز RLS)، فمفيش policies كتابة.
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_read_all ON public.app_settings;
CREATE POLICY app_settings_read_all ON public.app_settings
  FOR SELECT USING (true);

-- 3) قيم افتراضية (idempotent) — نفس defaults الكود:
--    الفترة المجانية مفعّلة + الدفع معطّل (آمن) لحد ما الدفع يتفعّل فعليًا.
INSERT INTO public.app_settings (key, value) VALUES
  ('billing_free_period_enabled', 'true'),
  ('billing_payments_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
