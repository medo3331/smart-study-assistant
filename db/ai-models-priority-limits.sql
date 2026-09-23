-- ============================================================
-- Phase 2 — /admin/models real activation — MANUAL EXECUTION on Supabase
-- ============================================================
-- بيضيف عمود حد الاستخدام اليومي لكل موديل (priority كان موجود أصلًا في
-- db/ai-models-control.sql). بيتقرأ وقت التشغيل عبر lib/ai/model-state.ts
-- وبيتفرض في lib/ai/routing.ts (الموديل اللي يوصل حده بيتستبعد لحد بكرة UTC).

ALTER TABLE public.ai_models
  ADD COLUMN IF NOT EXISTS daily_limit int DEFAULT NULL;

-- قيمة صالحة فقط: NULL (بلا حد) أو رقم موجب
ALTER TABLE public.ai_models
  DROP CONSTRAINT IF EXISTS ai_models_daily_limit_positive;
ALTER TABLE public.ai_models
  ADD CONSTRAINT ai_models_daily_limit_positive
  CHECK (daily_limit IS NULL OR daily_limit > 0);

COMMENT ON COLUMN public.ai_models.daily_limit IS
  'حد الاستخدام اليومي (عمليات ناجحة في ai_operations لكل يوم UTC). NULL = بلا حد. يُفرض في lib/ai/model-state.ts + lib/ai/routing.ts.';
