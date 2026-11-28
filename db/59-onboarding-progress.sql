-- ==========================================================================
-- 59 — onboarding_progress: حالة جولة التعريف بالمنصة (مع Magic)
-- صف واحد لكل مستخدم: مكان آخر خطوة + الخطوات المكتملة + إكمال/تخطي.
-- الجولة: welcome → discover → setup → characters → first_task
-- idempotent + additive — آمنة لإعادة التشغيل.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS onboarding_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_step text,
  completed_steps text[] NOT NULL DEFAULT '{}',
  completed_at timestamptz,
  skipped_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_progress_user ON onboarding_progress(user_id);

ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_progress_select_own" ON onboarding_progress;
CREATE POLICY "onboarding_progress_select_own"
  ON onboarding_progress FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "onboarding_progress_insert_own" ON onboarding_progress;
CREATE POLICY "onboarding_progress_insert_own"
  ON onboarding_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "onboarding_progress_update_own" ON onboarding_progress;
CREATE POLICY "onboarding_progress_update_own"
  ON onboarding_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- لا سياسة DELETE: الجولة تتعاد بـ reset، ومفيش حاجة بتتمسح من العميل.
