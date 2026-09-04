-- Phase 1.2D — Diagnostic Session + Answers Foundation
-- Idempotent; preserves existing 1.2A/1.2C.5 data; no destructive changes.

CREATE TABLE IF NOT EXISTS public.diagnostic_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_id UUID REFERENCES public.countries(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES public.education_stages(id) ON DELETE SET NULL,
  grade_id UUID REFERENCES public.education_grades(id) ON DELETE SET NULL,
  track_id UUID REFERENCES public.education_tracks(id) ON DELETE SET NULL,
  curriculum_id UUID REFERENCES public.curricula(id) ON DELETE SET NULL,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  question_count INT NOT NULL DEFAULT 10 CHECK (question_count BETWEEN 10 AND 15),
  status TEXT NOT NULL CHECK (status IN ('in_progress','completed','abandoned')) DEFAULT 'in_progress',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  score INT,
  score_percentage DECIMAL(5,2),
  correct_count INT DEFAULT 0,
  wrong_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diag_sessions_user ON public.diagnostic_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_diag_sessions_status ON public.diagnostic_sessions(status);
CREATE INDEX IF NOT EXISTS idx_diag_sessions_subject ON public.diagnostic_sessions(subject_id);
ALTER TABLE public.diagnostic_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diag_sessions: user reads" ON public.diagnostic_sessions;
CREATE POLICY "diag_sessions: user reads" ON public.diagnostic_sessions FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "diag_sessions: admin manage" ON public.diagnostic_sessions;
CREATE POLICY "diag_sessions: admin manage" ON public.diagnostic_sessions FOR ALL USING (exists(SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.diagnostic_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.diagnostic_sessions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.diagnostic_question_bank(id) ON DELETE RESTRICT,
  selected_option_index INT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id)  -- prevent duplicate per session/question
);

CREATE INDEX IF NOT EXISTS idx_diag_answers_session ON public.diagnostic_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_diag_answers_question ON public.diagnostic_answers(question_id);
ALTER TABLE public.diagnostic_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diag_answers: user reads" ON public.diagnostic_answers;
CREATE POLICY "diag_answers: user reads" ON public.diagnostic_answers FOR SELECT USING (session_id IN (SELECT id FROM public.diagnostic_sessions WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "diag_answers: user insert" ON public.diagnostic_answers;
CREATE POLICY "diag_answers: user insert" ON public.diagnostic_answers FOR INSERT WITH CHECK (session_id IN (SELECT id FROM public.diagnostic_sessions WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "diag_answers: user update" ON public.diagnostic_answers;
CREATE POLICY "diag_answers: user update" ON public.diagnostic_answers FOR UPDATE USING (session_id IN (SELECT id FROM public.diagnostic_sessions WHERE user_id = auth.uid())) WITH CHECK (session_id IN (SELECT id FROM public.diagnostic_sessions WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "diag_answers: user delete" ON public.diagnostic_answers;
CREATE POLICY "diag_answers: user delete" ON public.diagnostic_answers FOR DELETE USING (session_id IN (SELECT id FROM public.diagnostic_sessions WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "diag_answers: admin manage" ON public.diagnostic_answers;
CREATE POLICY "diag_answers: admin manage" ON public.diagnostic_answers FOR ALL USING (exists(SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()));

COMMENT ON TABLE public.diagnostic_sessions IS 'Diagnostic session — 1.2D; links education context + subject; server-scored; user-only access via RLS';
COMMENT ON TABLE public.diagnostic_answers IS 'Per-answer response — server computes is_correct; client never sends correct answer';
