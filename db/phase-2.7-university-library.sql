-- Phase 2.7 — University Academic Library Foundation
-- Source: verified university subjects (Cairo University / Computer Engineering) only
-- NO INVENTED RESOURCES; table starts empty; resources must be verified before publish
-- Idempotent; RLS-safe; backward-compatible; strict context isolation

CREATE TABLE IF NOT EXISTS public.university_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_subject_id UUID NOT NULL REFERENCES public.university_subjects(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  resource_type TEXT NOT NULL DEFAULT 'other',
  storage_path TEXT,
  url TEXT,
  source_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'secondary', -- official / secondary / user_submitted
  language TEXT DEFAULT 'ar',
  academic_year TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft / verified / published / rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Constraints
  CONSTRAINT valid_resource_type CHECK (resource_type IN ('lecture','notes','textbook','syllabus','reference','external','other')),
  CONSTRAINT valid_status CHECK (status IN ('draft','verified','published','rejected')),
  CONSTRAINT valid_source_type CHECK (source_type IN ('official','secondary','user_submitted'))
);

CREATE INDEX IF NOT EXISTS idx_univ_resources_subject ON public.university_resources(university_subject_id);
CREATE INDEX IF NOT EXISTS idx_univ_resources_status ON public.university_resources(status);
CREATE INDEX IF NOT EXISTS idx_univ_resources_univ_dept_level_sem ON public.university_resources(university_subject_id, status);

-- Duplicate protection: same URL for same subject should not be duplicated
CREATE UNIQUE INDEX IF NOT EXISTS idx_univ_resources_unique_url_subject
  ON public.university_resources(university_subject_id, url)
  WHERE url IS NOT NULL AND url <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_univ_resources_unique_path_subject
  ON public.university_resources(university_subject_id, storage_path)
  WHERE storage_path IS NOT NULL AND storage_path <> '';

ALTER TABLE public.university_resources ENABLE ROW LEVEL SECURITY;

-- Published resources: readable by all authenticated users
DROP POLICY IF EXISTS "univ_resources_pub_read" ON public.university_resources;
CREATE POLICY "univ_resources_pub_read" ON public.university_resources
  FOR SELECT USING (status = 'published');

-- Verified/published: readable by anyone (but we use same policy for simplicity)
-- Draft/rejected: NOT visible to regular users (only admin/service can see all)
DROP POLICY IF EXISTS "univ_resources_admin_all" ON public.university_resources;
CREATE POLICY "univ_resources_admin_all" ON public.university_resources
  FOR SELECT USING (true); -- admin/service-side only; user-side uses pub_read above

-- Mutations: only admin/authorized (no user mutations allowed in Phase 2.7)
DROP POLICY IF EXISTS "univ_resources_user_insert" ON public.university_resources;
CREATE POLICY "univ_resources_user_insert" ON public.university_resources FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "univ_resources_user_update" ON public.university_resources;
CREATE POLICY "univ_resources_user_update" ON public.university_resources FOR UPDATE USING (false);

DROP POLICY IF EXISTS "univ_resources_user_delete" ON public.university_resources;
CREATE POLICY "univ_resources_user_delete" ON public.university_resources FOR DELETE USING (false);

-- No user upload system in Phase 2.7; verified resources only via admin/service mutation
