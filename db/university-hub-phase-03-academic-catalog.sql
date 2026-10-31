-- ============================================================================
-- Phase 03 — University Hub: Academic Catalog foundation (Migration A)
-- ============================================================================
-- STATUS: PREPARED ONLY — NOT APPLIED to remote database.
-- Apply ONLY after explicit approval following Phase 03 review.
--
-- Design goals:
--   * Generic, university-independent academic catalog (faculties + majors).
--   * Supports both cases:
--       1. Major as a standalone program (e.g. Cyber Security as its own major).
--       2. Major as a track/specialization inside another major
--          (e.g. Cyber Security as a track within Computer Science)
--          via parent_major_id + relation_type.
--   * university_major_offerings links generic majors to specific
--     university departments without duplicating the catalog.
--   * Content status (ready/preparing/coming_soon) so every major page
--     always shows a prepared state, never an empty page.
--   * Student suggestions + vote-based dedup (major_suggestions + votes).
--   * RLS: public/authenticated read on catalog; writes via service_role only.
--   * Backward compatible: NO changes to university_subjects, workspace_subjects,
--     materials, lectures, or any existing table in this migration.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
--             CREATE POLICY guards via DO blocks.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) academic_faculties — the 13 faculties (college-level grouping)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_faculties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name_ar     TEXT NOT NULL,
  name_en     TEXT,
  icon        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_visible  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_academic_faculties_visible_sort
  ON public.academic_faculties (is_visible, sort_order);

-- ---------------------------------------------------------------------------
-- 2) academic_majors — generic majors (university-independent)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_majors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id       UUID NOT NULL REFERENCES public.academic_faculties(id) ON DELETE RESTRICT,
  slug             TEXT NOT NULL,
  name_ar          TEXT NOT NULL,
  name_en          TEXT,
  description_ar   TEXT,
  -- Supports standalone vs track/specialization/alias inside another major
  parent_major_id  UUID REFERENCES public.academic_majors(id) ON DELETE SET NULL,
  relation_type    TEXT NOT NULL DEFAULT 'standalone'
                   CHECK (relation_type IN ('standalone','track','specialization','alias')),
  content_status   TEXT NOT NULL DEFAULT 'coming_soon'
                   CHECK (content_status IN ('ready','preparing','coming_soon')),
  is_visible       BOOLEAN NOT NULL DEFAULT TRUE,
  merged_into_id   UUID REFERENCES public.academic_majors(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (faculty_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_academic_majors_faculty
  ON public.academic_majors (faculty_id);
CREATE INDEX IF NOT EXISTS idx_academic_majors_parent
  ON public.academic_majors (parent_major_id);
CREATE INDEX IF NOT EXISTS idx_academic_majors_status
  ON public.academic_majors (content_status, is_visible);
CREATE INDEX IF NOT EXISTS idx_academic_majors_merged
  ON public.academic_majors (merged_into_id);
-- ---------------------------------------------------------------------------
-- 3) university_major_offerings — links generic majors to specific
--    university departments (university-specific availability), without
--    duplicating the catalog.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.university_major_offerings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id  UUID NOT NULL REFERENCES public.universities(id) ON DELETE RESTRICT,
  department_id  UUID REFERENCES public.university_departments(id) ON DELETE SET NULL,
  major_id       UUID NOT NULL REFERENCES public.academic_majors(id) ON DELETE RESTRICT,
  is_available   BOOLEAN NOT NULL DEFAULT TRUE,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (university_id, department_id, major_id)
);

CREATE INDEX IF NOT EXISTS idx_um_offerings_university
  ON public.university_major_offerings (university_id);
CREATE INDEX IF NOT EXISTS idx_um_offerings_major
  ON public.university_major_offerings (major_id);
CREATE INDEX IF NOT EXISTS idx_um_offerings_department
  ON public.university_major_offerings (department_id);

-- ---------------------------------------------------------------------------
-- 4) major_suggestions — student-proposed majors (review queue)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.major_suggestions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  faculty_id      UUID REFERENCES public.academic_faculties(id) ON DELETE SET NULL,
  faculty_name_raw TEXT,
  major_name_raw  TEXT NOT NULL,
  university_name TEXT,
  extra_info      TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','needs_info')),
  reviewed_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT,
  linked_major_id UUID REFERENCES public.academic_majors(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_major_suggestions_status
  ON public.major_suggestions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_major_suggestions_user
  ON public.major_suggestions (user_id);
CREATE INDEX IF NOT EXISTS idx_major_suggestions_faculty
  ON public.major_suggestions (faculty_id);

-- ---------------------------------------------------------------------------
-- 5) major_suggestion_votes — dedup support (one vote per user per suggestion)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.major_suggestion_votes (
  suggestion_id UUID NOT NULL REFERENCES public.major_suggestions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (suggestion_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_major_suggestion_votes_suggestion
  ON public.major_suggestion_votes (suggestion_id);

-- ---------------------------------------------------------------------------
-- 6) RLS — enable + policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.academic_faculties        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_majors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.university_major_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.major_suggestions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.major_suggestion_votes    ENABLE ROW LEVEL SECURITY;

-- Catalog: public read (anon + authenticated)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='academic_faculties' AND policyname='academic_faculties_public_read') THEN
    CREATE POLICY academic_faculties_public_read ON public.academic_faculties
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='academic_majors' AND policyname='academic_majors_public_read') THEN
    CREATE POLICY academic_majors_public_read ON public.academic_majors
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='university_major_offerings' AND policyname='university_major_offerings_public_read') THEN
    CREATE POLICY university_major_offerings_public_read ON public.university_major_offerings
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- Suggestions: authenticated users insert their own; read their own.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='major_suggestions' AND policyname='major_suggestions_insert_own') THEN
    CREATE POLICY major_suggestions_insert_own ON public.major_suggestions
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='major_suggestions' AND policyname='major_suggestions_select_own') THEN
    CREATE POLICY major_suggestions_select_own ON public.major_suggestions
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

-- Votes: authenticated users insert their own.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='major_suggestion_votes' AND policyname='major_suggestion_votes_insert_own') THEN
    CREATE POLICY major_suggestion_votes_insert_own ON public.major_suggestion_votes
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- All other writes (UPDATE/DELETE on all 5 tables, admin reads of suggestions/votes)
-- are performed via service_role, which bypasses RLS — consistent with the
-- existing admin pattern (files, rewards, etc.).

-- ---------------------------------------------------------------------------
-- 7) updated_at trigger (reuse existing convention if present)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_academic_faculties_updated_at') THEN
    CREATE TRIGGER trg_academic_faculties_updated_at
      BEFORE UPDATE ON public.academic_faculties
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_academic_majors_updated_at') THEN
    CREATE TRIGGER trg_academic_majors_updated_at
      BEFORE UPDATE ON public.academic_majors
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_university_major_offerings_updated_at') THEN
    CREATE TRIGGER trg_university_major_offerings_updated_at
      BEFORE UPDATE ON public.university_major_offerings
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_major_suggestions_updated_at') THEN
    CREATE TRIGGER trg_major_suggestions_updated_at
      BEFORE UPDATE ON public.major_suggestions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION A (Phase 03) — NOT APPLIED
-- ============================================================================

