-- Phase 2.4 — University GPA & Academic Progress Foundation
-- Minimal, normalized, idempotent, RLS-safe, backward-compatible
-- Source: verified from DB (CAU / Computer Engineering); grades/scores NOT invented — determined from records

CREATE TABLE IF NOT EXISTS public.academic_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  university_subject_id UUID NOT NULL REFERENCES public.university_subjects(id) ON DELETE RESTRICT,
  semester_id UUID NOT NULL REFERENCES public.university_semesters(id) ON DELETE RESTRICT,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'withdrawn', 'failed', 'pending')),
  score NUMERIC(5,2) DEFAULT NULL CHECK (score >= 0 AND score <= 100),
  grade TEXT DEFAULT NULL CHECK (grade ~* '^[A-F][+-]?$|^P$'),
  credits NUMERIC(4,2) DEFAULT 3.00 CHECK (credits > 0),
  source_note TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_academic_user ON public.academic_records(user_id);
CREATE INDEX IF NOT EXISTS idx_academic_subject ON public.academic_records(university_subject_id);
CREATE INDEX IF NOT EXISTS idx_academic_semester ON public.academic_records(semester_id);
CREATE INDEX IF NOT EXISTS idx_academic_status ON public.academic_records(status);
ALTER TABLE public.academic_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "academic_owner_read" ON public.academic_records;
CREATE POLICY "academic_owner_read" ON public.academic_records FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "academic_owner_update" ON public.academic_records;
CREATE POLICY "academic_owner_update" ON public.academic_records FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS "academic_owner_insert" ON public.academic_records;
CREATE POLICY "academic_owner_insert" ON public.academic_records FOR INSERT WITH CHECK (user_id = auth.uid());

-- Idempotency: no destructive operations; only creates table + RLS if missing
-- No fake data inserted — records created only by real user actions (assessment results / manual entry with verified sources)
