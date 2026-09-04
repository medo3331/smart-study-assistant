-- 1.2E — Study Plan Integration (minimal; idempotent; no planner rebuild)
-- Links diagnostic session weak topics to existing planner content
-- Uses existing planner_goals / study_day / materials / exam_plan_days (no new planner table)
-- Status: design only — actual DB execution requires admin/service_role (RLS site_admins)

CREATE TABLE IF NOT EXISTS public.diagnostic_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.diagnostic_sessions(id) ON DELETE CASCADE,
  weak_topic TEXT NOT NULL,
  accuracy DECIMAL(5,2),
  content_available BOOLEAN NOT NULL DEFAULT false,
  content_refs JSONB DEFAULT '[]',  -- existing content IDs (material/planner_goal/exam_plan_day) — verified only, never invented
  recommendation_text TEXT,
  priority TEXT CHECK (priority IN ('high','medium','low')) DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, weak_topic)  -- idempotency: same session + topic = one recommendation
);

CREATE INDEX IF NOT EXISTS idx_diag_recs_session ON public.diagnostic_recommendations(session_id);
CREATE INDEX IF NOT EXISTS idx_diag_recs_topic ON public.diagnostic_recommendations(weak_topic);
ALTER TABLE public.diagnostic_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diag_recs: user reads" ON public.diagnostic_recommendations;
CREATE POLICY "diag_recs: user reads" ON public.diagnostic_recommendations FOR SELECT USING (session_id IN (SELECT id FROM public.diagnostic_sessions WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "diag_recs: user insert" ON public.diagnostic_recommendations;
CREATE POLICY "diag_recs: user insert" ON public.diagnostic_recommendations FOR INSERT WITH CHECK (session_id IN (SELECT id FROM public.diagnostic_sessions WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "diag_recs: admin manage" ON public.diagnostic_recommendations;
CREATE POLICY "diag_recs: admin manage" ON public.diagnostic_recommendations FOR ALL USING (exists(SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()));

COMMENT ON TABLE public.diagnostic_recommendations IS '1.2E — recommendations from diagnostic weak topics to existing study-plan/content; verified only; no AI; no fabricated content.';
