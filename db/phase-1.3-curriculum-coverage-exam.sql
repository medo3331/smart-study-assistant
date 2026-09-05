-- ============================================================================
-- Phase 1.3 — Curriculum Mapping + Coverage + Exam Countdown
-- DB Foundation — Minimal, idempotent, non-destructive, backward-compatible
-- Reuses: curricula / subjects / education_stages / grades / tracks / profiles
-- New entities: curriculum_content_mapping, curriculum_lessons, curriculum_exams
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Curriculum Content Mapping — canonical relationship
-- Every mapped item must identify curriculum (via curriculum_id) + subject.
-- Same subject name in different curricula = different rows (never subject-only).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.curriculum_content_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Canonical taxonomy reference (required for curriculum identity)
  curriculum_id UUID NOT NULL REFERENCES public.curricula(id) ON DELETE RESTRICT,
  stage_id UUID REFERENCES public.education_stages(id) ON DELETE SET NULL,
  grade_id UUID REFERENCES public.education_grades(id) ON DELETE SET NULL,
  track_id UUID REFERENCES public.education_tracks(id) ON DELETE SET NULL,

  -- Curriculum identity (preserved explicitly, not derived from name alone)
  country_id UUID REFERENCES public.countries(id) ON DELETE SET NULL,

  -- Subject / content identity
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,

  -- Hierarchy: unit → topic → lesson (optional at each level; allows partial mapping)
  unit_name TEXT,
  unit_code TEXT,
  topic_name TEXT,
  topic_code TEXT,
  lesson_title TEXT,
  lesson_code TEXT,

  -- Content reference: links to real existing content (study_day / planner_goal / exam_plan_day)
  -- This ensures coverage is computed from REAL mapped content only, not invented.
  content_ref_type TEXT CHECK (content_ref_type IN ('study_day', 'planner_goal', 'exam_plan_day', 'lesson_content', 'none')) DEFAULT 'none',
  content_ref_uuid UUID, -- reference to real content row (nullable)

  -- Mapping verification
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verification_source TEXT, -- e.g., "manual", "admin_ingest", "curriculum_doc"
  mapped_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Uniqueness: same curriculum + same lesson code = one mapping
  UNIQUE (curriculum_id, lesson_code, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_content_curriculum ON public.curriculum_content_mapping(curriculum_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_content_subject ON public.curriculum_content_mapping(subject_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_content_content_ref ON public.curriculum_content_mapping(content_ref_type, content_ref_uuid) WHERE content_ref_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_curriculum_content_verified ON public.curriculum_content_mapping(is_verified);

ALTER TABLE public.curriculum_content_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "curriculum_content: public read" ON public.curriculum_content_mapping;
CREATE POLICY "curriculum_content: public read" ON public.curriculum_content_mapping
  FOR SELECT USING (true); -- taxonomy/reference data: public readable

DROP POLICY IF EXISTS "curriculum_content: admin manage" ON public.curriculum_content_mapping;
CREATE POLICY "curriculum_content: admin manage" ON public.curriculum_content_mapping
  FOR ALL USING (exists(SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()))
  WITH CHECK (exists(SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()));

COMMENT ON TABLE public.curriculum_content_mapping IS 'Phase 1.3 — canonical curriculum mapping; curriculum must be identified by curriculum_id (not subject name alone); content_ref links to real existing content only; verified only';

-- ----------------------------------------------------------------------------
-- 2) Curriculum Lessons — aggregated lesson-level mapping with completion tracking
-- Links to real study completion via study_days (not planner_goals alone).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.curriculum_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id UUID NOT NULL REFERENCES public.curriculum_content_mapping(id) ON DELETE CASCADE,

  -- Lesson identity preserved explicitly (same lesson title may exist in different curricula)
  curriculum_id UUID NOT NULL REFERENCES public.curricula(id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  lesson_code TEXT NOT NULL,
  lesson_title TEXT NOT NULL,

  -- Aggregate counts computed deterministically (not client-submitted)
  total_lessons_in_unit INT DEFAULT 1,
  completed_lessons_in_unit INT DEFAULT 0,

  -- Reference to real study_day if mapped (nullable; allows unmapped tracking without fake data)
  study_day_id UUID REFERENCES public.study_days(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (curriculum_id, subject_id, lesson_code)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_lessons_curriculum ON public.curriculum_lessons(curriculum_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_lessons_subject ON public.curriculum_lessons(subject_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_lessons_study_day ON public.curriculum_lessons(study_day_id) WHERE study_day_id IS NOT NULL;

ALTER TABLE public.curriculum_lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "curriculum_lessons: user reads" ON public.curriculum_lessons;
CREATE POLICY "curriculum_lessons: user reads" ON public.curriculum_lessons
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "curriculum_lessons: admin manage" ON public.curriculum_lessons;
CREATE POLICY "curriculum_lessons: admin manage" ON public.curriculum_lessons
  FOR ALL USING (exists(SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()))
  WITH CHECK (exists(SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()));

COMMENT ON TABLE public.curriculum_lessons IS 'Phase 1.3 — lesson-level mapping; links to real study_day for deterministic completion; never counts planner_goals or page loads as completed lessons';

-- ----------------------------------------------------------------------------
-- 3) Exam Schedule — SEPARATE from past_exams (future exams only)
-- past_exams = historical; this table = verified future exam schedule only.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.curriculum_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to real taxonomy (must identify curriculum, not just subject name)
  curriculum_id UUID NOT NULL REFERENCES public.curricula(id) ON DELETE RESTRICT,
  stage_id UUID REFERENCES public.education_stages(id) ON DELETE SET NULL,
  grade_id UUID REFERENCES public.education_grades(id) ON DELETE SET NULL,
  track_id UUID REFERENCES public.education_tracks(id) ON DELETE SET NULL,

  -- Subject reference (required; never exam-only by subject name)
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,

  -- Exam identity
  exam_title TEXT NOT NULL,
  exam_code TEXT,

  -- Date/time (verified only — never fabricated)
  exam_date DATE NOT NULL,
  exam_time TIME,
  timezone TEXT DEFAULT 'Africa/Cairo', -- verified timezone; browser timezone fallback

  -- Source / verification (must be set; no fake exams)
  source_name TEXT NOT NULL, -- e.g., "Ministry of Education", "School"
  source_url TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,

  -- Context linkage
  country_id UUID REFERENCES public.countries(id) ON DELETE SET NULL,

  -- Status (not notification-related; only scheduling status)
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'postponed', 'cancelled', 'completed')),

  -- Count reference (optional): links to past exam bank for similar exams
  past_exam_reference_id UUID REFERENCES public.past_exams(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_curriculum_exams_curriculum ON public.curriculum_exams(curriculum_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_exams_subject ON public.curriculum_exams(subject_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_exams_date ON public.curriculum_exams(exam_date);
CREATE INDEX IF NOT EXISTS idx_curriculum_exams_verified ON public.curriculum_exams(is_verified, exam_date);

ALTER TABLE public.curriculum_exams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "curriculum_exams: public read verified" ON public.curriculum_exams;
CREATE POLICY "curriculum_exams: public read verified" ON public.curriculum_exams
  FOR SELECT USING (is_verified = true);

DROP POLICY IF EXISTS "curriculum_exams: admin manage" ON public.curriculum_exams;
CREATE POLICY "curriculum_exams: admin manage" ON public.curriculum_exams
  FOR ALL USING (exists(SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()))
  WITH CHECK (exists(SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()));

COMMENT ON TABLE public.curriculum_exams IS 'Phase 1.3 — verified future exam schedule ONLY; separate from past_exams (historical); requires curriculum identification; no fake exam dates allowed';

-- ----------------------------------------------------------------------------
-- 4) Study Completion Verification — audit trail (prevents fake progress)
-- Every real completion event records: which lesson, which user, which mechanism.
-- This prevents client-submitted percentages from being trusted blindly.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.study_completion_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What was completed
  study_day_id UUID REFERENCES public.study_days(id) ON DELETE SET NULL,
  curriculum_lesson_id UUID REFERENCES public.curriculum_lessons(id) ON DELETE SET NULL,

  -- Verification (what mechanism produced the completion)
  source_type TEXT NOT NULL CHECK (source_type IN ('study_day_completion', 'manual_admin', 'diagnostic_link', 'planner_link_only')) DEFAULT 'study_day_completion',
  source_note TEXT,

  -- Timestamp of real event
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate completion claims for the same lesson
  UNIQUE (user_id, curriculum_lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_study_completion_user ON public.study_completion_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_study_completion_lesson ON public.study_completion_audit(curriculum_lesson_id);
CREATE INDEX IF NOT EXISTS idx_study_completion_day ON public.study_completion_audit(study_day_id);

ALTER TABLE public.study_completion_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_completion: user reads" ON public.study_completion_audit;
CREATE POLICY "study_completion: user reads" ON public.study_completion_audit
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "study_completion: admin manage" ON public.study_completion_audit;
CREATE POLICY "study_completion: admin manage" ON public.study_completion_audit
  FOR ALL USING (exists(SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()))
  WITH CHECK (exists(SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()));

COMMENT ON TABLE public.study_completion_audit IS 'Phase 1.3 — audit trail for real study completion; source_type must be real mechanism (study_day_completion / manual_admin); planner_link_only is NOT counted as completed lesson for coverage';

-- ----------------------------------------------------------------------------
-- 5) Coverage State Cache (deterministic; can be rebuilt from mappings + audit)
-- Only stores aggregate values; real source of truth is mappings + audit.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.curriculum_coverage_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  curriculum_id UUID NOT NULL REFERENCES public.curricula(id) ON DELETE CASCADE,

  -- Computed aggregates (recomputed, never client-submitted)
  total_mapped_lessons INT NOT NULL DEFAULT 0,
  completed_lessons INT NOT NULL DEFAULT 0,
  coverage_percent DECIMAL(5,2) DEFAULT 0,
  remaining_lessons INT NOT NULL DEFAULT 0,

  -- Coverage state classification (deterministic from aggregates)
  coverage_state TEXT NOT NULL DEFAULT 'no_data' CHECK (coverage_state IN ('no_data', 'partially_mapped', 'active', 'complete', 'insufficient_data')),

  -- Subject-level breakdown (JSONB of verified aggregates; rebuildable)
  subject_breakdown JSONB DEFAULT '{}',

  -- Unmapped tracking
  unmapped_content_count INT DEFAULT 0,

  -- Exam countdown reference
  next_exam_id UUID REFERENCES public.curriculum_exams(id) ON DELETE SET NULL,
  exam_days_remaining INT,

  -- Timestamps
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, curriculum_id)
);

CREATE INDEX IF NOT EXISTS idx_coverage_user_curriculum ON public.curriculum_coverage_state(user_id, curriculum_id);
CREATE INDEX IF NOT EXISTS idx_coverage_state ON public.curriculum_coverage_state(coverage_state);
CREATE INDEX IF NOT EXISTS idx_coverage_next_exam ON public.curriculum_coverage_state(next_exam_id) WHERE next_exam_id IS NOT NULL;

ALTER TABLE public.curriculum_coverage_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coverage_state: user reads" ON public.curriculum_coverage_state;
CREATE POLICY "coverage_state: user reads" ON public.curriculum_coverage_state
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "coverage_state: admin manage" ON public.curriculum_coverage_state;
CREATE POLICY "coverage_state: admin manage" ON public.curriculum_coverage_state
  FOR ALL USING (exists(SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()))
  WITH CHECK (exists(SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()));

COMMENT ON TABLE public.curriculum_coverage_state IS 'Phase 1.3 — deterministic coverage aggregate; rebuilt from mappings + audit; never accepts client-submitted percentages';

-- ----------------------------------------------------------------------------
-- 6) Profile curriculum context — minimal extension (reuse profiles)
-- Reuses profiles table; adds curriculum context fields only.
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS selected_curriculum_id UUID REFERENCES public.curricula(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS selected_stage_id UUID REFERENCES public.education_stages(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS selected_grade_id UUID REFERENCES public.education_grades(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS selected_track_id UUID REFERENCES public.education_tracks(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS selected_country_id UUID REFERENCES public.countries(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.selected_curriculum_id IS 'Phase 1.3 — user-selected curriculum; null = no academic context set (show setup state, never guess)';

-- ----------------------------------------------------------------------------
-- 7) Indexes for performance (minimal; only where aggregation uses it)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_study_days_config_completed ON public.study_days(config_id, is_completed) WHERE is_completed = true;
CREATE INDEX IF NOT EXISTS idx_study_days_user ON public.study_days(id);

-- ----------------------------------------------------------------------------
-- 8) Idempotency / verification notes (DO NOT USE if not exists on policies)
-- Already handled with DROP IF EXISTS + CREATE above; no IF NOT EXISTS needed.
-- ----------------------------------------------------------------------------
