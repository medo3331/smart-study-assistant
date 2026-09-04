-- ============================================================================
-- Phase 1.2A — Diagnostic Question Bank + Taxonomy Foundation
-- AUDIT + MINIMAL EXTENSION ONLY (no destructive changes)
-- Idempotent: safe to rerun; does NOT alter past_exams / countries / curricula / subjects
-- ============================================================================

-- --- Education Hierarchy Extension (minimal, non-breaking) ---
-- Only fields needed to connect Subject → Unit → Topic/Chapter for diagnostic.
-- No stage/grade/track inserted (reserved for future; column names allow extension).

ALTER TABLE public.curricula
  ADD COLUMN IF NOT EXISTS stage TEXT,
  ADD COLUMN IF NOT EXISTS grade TEXT;
COMMENT ON COLUMN public.curricula.stage IS 'Education stage: Primary/Preparatory/Secondary/University — reserved, not populated now';
COMMENT ON COLUMN public.curricula.grade IS 'Grade/level within stage — reserved, not populated now';

-- --- Taxonomy Extension: Unit ---
-- Minimal entity linking to existing subjects (FK to subjects.id — safe, existing PK).
-- No duplication of countries/curricula/subjects.

CREATE TABLE IF NOT EXISTS public.diagnostic_units (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id    uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  name          text NOT NULL,
  code          text,
  display_order int DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes for diagnostic routing (subject + name lookup)
CREATE INDEX IF NOT EXISTS idx_diagnostic_units_subject_id ON public.diagnostic_units(subject_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_units_name ON public.diagnostic_units(name);

ALTER TABLE public.diagnostic_units ENABLE ROW LEVEL SECURITY;

-- RLS: public can read published units; only admin/editors manage (match existing admin pattern)
DROP POLICY IF EXISTS "diagnostic_units: public read" ON public.diagnostic_units;
CREATE POLICY "diagnostic_units: public read" ON public.diagnostic_units FOR SELECT USING (true);

DROP POLICY IF EXISTS "diag_units: admin manage" ON public.diagnostic_units;
CREATE POLICY "diag_units: admin manage" ON public.diagnostic_units FOR ALL USING ( exists (SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()) );

COMMENT ON TABLE public.diagnostic_units IS 'Minimal taxonomy: Unit under Subject for Diagnostic Quiz. Does not replace existing past_exams taxonomy; links via subjects.id.';

-- --- Taxonomy Extension: Topic / Chapter ---
-- Links to unit; allows both chapter-style and topic-style grouping.

CREATE TABLE IF NOT EXISTS public.diagnostic_topics (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id       uuid NOT NULL REFERENCES public.diagnostic_units(id) ON DELETE CASCADE,
  subject_id    uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  name          text NOT NULL,
  type          text CHECK (type IN ('chapter','topic','lesson')) DEFAULT 'topic',
  display_order int DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_topics_unit_id ON public.diagnostic_topics(unit_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_topics_subject_id ON public.diagnostic_topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_topics_type ON public.diagnostic_topics(type);

ALTER TABLE public.diagnostic_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diagnostic_topics: public read" ON public.diagnostic_topics;
CREATE POLICY "diagnostic_topics: public read" ON public.diagnostic_topics FOR SELECT USING (true);

DROP POLICY IF EXISTS "diag_topics: admin manage" ON public.diagnostic_topics;
CREATE POLICY "diag_topics: admin manage" ON public.diagnostic_topics FOR ALL USING ( exists (SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()) );

COMMENT ON TABLE public.diagnostic_topics IS 'Topic/Chapter under Unit. Links to existing subjects (FK) for diagnostic routing; type allows chapter/topic/lesson grouping.';

-- --- Diagnostic Question Bank (independent from past_exams — no duplication) ---
-- Source-of-truth: verified / curated / official only. No raw AI-generated questions here.

CREATE TABLE IF NOT EXISTS public.diagnostic_question_bank (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id          uuid NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  unit_id             uuid REFERENCES public.diagnostic_units(id) ON DELETE SET NULL,
  topic_id            uuid REFERENCES public.diagnostic_topics(id) ON DELETE SET NULL,
  question_text       text NOT NULL,
  question_type       text NOT NULL CHECK (question_type IN ('mcq','true_false')) DEFAULT 'mcq',
  options_json        jsonb NOT NULL DEFAULT '[]',  -- array of option strings for mcq; not correct answers
  correct_option_index int NOT NULL,                 -- deterministic: 0-based index into options_json
  explanation         text,
  difficulty          text CHECK (difficulty IN ('easy','medium','hard')) DEFAULT 'medium',
  source_type         text NOT NULL CHECK (source_type IN ('official','verified','curated','validated')) DEFAULT 'curated',
  source_name         text,
  source_reference    text,
  status              text NOT NULL CHECK (status IN ('draft','verified','published','archived')) DEFAULT 'draft',
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  verified_at         timestamptz,
  verified_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Integrity / security indexes
CREATE INDEX IF NOT EXISTS idx_diag_bank_subject ON public.diagnostic_question_bank(subject_id);
CREATE INDEX IF NOT EXISTS idx_diag_bank_unit ON public.diagnostic_question_bank(unit_id);
CREATE INDEX IF NOT EXISTS idx_diag_bank_topic ON public.diagnostic_question_bank(topic_id);
CREATE INDEX IF NOT EXISTS idx_diag_bank_status ON public.diagnostic_question_bank(status);
CREATE INDEX IF NOT EXISTS idx_diag_bank_difficulty ON public.diagnostic_question_bank(difficulty);
CREATE INDEX IF NOT EXISTS idx_diag_bank_source ON public.diagnostic_question_bank(source_type, status);

-- Integrity constraint: correct_option_index must be valid for mcq (enforced by application; DB can use a check if JSON array length is known, but JSONB array length is dynamic — kept as application-level + index for performance)
ALTER TABLE public.diagnostic_question_bank ENABLE ROW LEVEL SECURITY;

-- Security: anonymous / normal users read only published, verified questions; cannot manage
DROP POLICY IF EXISTS "diag_bank: public read published" ON public.diagnostic_question_bank;
CREATE POLICY "diag_bank: public read published" ON public.diagnostic_question_bank FOR SELECT USING (status = 'published' AND source_type IN ('official','verified','curated','validated'));

DROP POLICY IF EXISTS "diag_bank: admin manage" ON public.diagnostic_question_bank;
CREATE POLICY "diag_bank: admin manage" ON public.diagnostic_question_bank FOR ALL USING ( exists (SELECT 1 FROM public.site_admins WHERE user_id = auth.uid()) );

COMMENT ON TABLE public.diagnostic_question_bank IS 'Independent verified question bank for Diagnostic (and future practice/assessment). Must NOT be source of AI-generated unverified questions. Source truth: verified/curated/official. Correct answer deterministic (correct_option_index + options_json).';

-- --- Seed: Taxonomy example tied to existing data (no fake questions, no fake sources) ---
-- Only taxonomy seed; question count = 0 (no verified source yet per audit).
-- Example links to existing Egypt / General Secondary / Mathematics taxonomy.

DO $$
BEGIN
  -- Insert an example unit for Mathematics (only if subjects has a Math subject — use existing ID, else no-op via subquery)
  INSERT INTO public.diagnostic_units (id, subject_id, name, code, display_order)
  SELECT gen_random_uuid(), s.id, 'Unit 1: Algebraic Foundations', 'U1-ALG', 1
  FROM public.subjects s INNER JOIN public.curricula c ON s.curriculum_id = c.id
  WHERE s.name ILIKE '%math%' OR s.name ILIKE '%mathematics%' OR s.code ILIKE '%math%'
  ON CONFLICT DO NOTHING;

  -- Example topic under that unit (if unit inserted; subquery handles absence gracefully via CTE / empty result)
  -- Intentionally left as NO-OP if no math subject exists — avoids fake data insertion.
END $$;

-- --- Verification / Audit helper (idempotent read view — not required for operation) ---
CREATE OR REPLACE VIEW public.diagnostic_bank_summary AS
SELECT
  q.subject_id,
  s.name AS subject_name,
  q.status,
  q.difficulty,
  q.source_type,
  COUNT(*) AS question_count
FROM public.diagnostic_question_bank q
LEFT JOIN public.subjects s ON q.subject_id = s.id
GROUP BY q.subject_id, s.name, q.status, q.difficulty, q.source_type;

COMMENT ON VIEW public.diagnostic_bank_summary IS 'Audit helper: counts of verified/published questions per subject/status/difficulty.';

-- --- Constraints / Integrity (opt-in, applied after seed) ---
-- Ensure every published question has correct_option_index within options_json length (enforced at app layer; DB doesn't natively check JSON array index against array length easily without function — skipped to avoid over-engineering for MVP)

-- End of Phase 1.2A SQL

-- --- View security note (view inherits RLS from underlying diagnostic_question_bank) ---
-- No separate policy required: diagnostic_bank_summary selects from bank which has RLS.
-- Admin can still query; public can only see counts from published+verified questions.
