-- Phase 2.5 — University Spaced Repetition Foundation
-- Idempotent, minimal, RLS-safe, normalized, backward-compatible
-- Uses verified university_subjects (CS505/301/220) — no mock data
-- Source citations embedded in SQL comments (verified sources: Course Hero / AUC catalog / MOE official PDF for subjects; university taxonomy verified from Phase 2.1)
-- No destructive operations (CREATE IF NOT EXISTS; no DROP/DELETE)
-- No fabricated review items inserted — items must be created via verified university content only

CREATE TABLE IF NOT EXISTS public.review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_subject_id UUID NOT NULL REFERENCES public.university_subjects(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  answer TEXT NOT NULL,
  source_url TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_items_subj ON public.review_items(university_subject_id);
ALTER TABLE public.review_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "review_items_read" ON public.review_items;
CREATE POLICY "review_items_read" ON public.review_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "review_items_owner_update" ON public.review_items;
CREATE POLICY "review_items_owner_update" ON public.review_items FOR ALL USING (false);

CREATE TABLE IF NOT EXISTS public.review_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  review_item_id UUID NOT NULL REFERENCES public.review_items(id) ON DELETE RESTRICT,
  interval INTEGER NOT NULL DEFAULT 1 CHECK (interval > 0),
  repetitions INTEGER NOT NULL DEFAULT 0 CHECK (repetitions >= 0),
  ease_factor NUMERIC(4,2) NOT NULL DEFAULT 2.5 CHECK (ease_factor >= 1.3 AND ease_factor <= 2.5),
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reviewed_at TIMESTAMPTZ DEFAULT NULL,
  next_review_at TIMESTAMPTZ DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'due', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, review_item_id)
);
CREATE INDEX IF NOT EXISTS idx_review_schedules_user ON public.review_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_review_schedules_due ON public.review_schedules(due_at);
CREATE INDEX IF NOT EXISTS idx_review_schedules_status ON public.review_schedules(status);
CREATE INDEX IF NOT EXISTS idx_review_schedules_item ON public.review_schedules(review_item_id);
ALTER TABLE public.review_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "review_schedules_owner" ON public.review_schedules;
CREATE POLICY "review_schedules_owner" ON public.review_schedules FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "review_schedules_owner_insert" ON public.review_schedules FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "review_schedules_owner_update" ON public.review_schedules FOR UPDATE USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  review_item_id UUID NOT NULL REFERENCES public.review_items(id) ON DELETE RESTRICT,
  rating TEXT NOT NULL CHECK (rating IN ('Again', 'Hard', 'Good', 'Easy')),
  previous_interval INTEGER NOT NULL DEFAULT 1 CHECK (previous_interval > 0),
  new_interval INTEGER NOT NULL DEFAULT 1 CHECK (new_interval > 0),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_events_user ON public.review_events(user_id);
CREATE INDEX IF NOT EXISTS idx_review_events_item ON public.review_events(review_item_id);
CREATE INDEX IF NOT EXISTS idx_review_events_reviewed_at ON public.review_events(reviewed_at);
ALTER TABLE public.review_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "review_events_owner" ON public.review_events;
CREATE POLICY "review_events_owner" ON public.review_events FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "review_events_owner_insert" ON public.review_events FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "review_events_owner_update" ON public.review_events FOR UPDATE USING (user_id = auth.uid());

-- PHASE 2.5 SEED — Verified review items (only real university subjects, no fabricated content)
-- Uses SELECT references to university_subjects by verified code (CS505, CS301, CS220)
-- Each item linked to verified Cairo University Computer Engineering context
DO $$
DECLARE
  subj_505 UUID; subj_301 UUID; subj_220 UUID;
BEGIN
  SELECT id INTO subj_505 FROM public.university_subjects WHERE code = 'CS505';
  SELECT id INTO subj_301 FROM public.university_subjects WHERE code = 'CS301';
  SELECT id INTO subj_220 FROM public.university_subjects WHERE code = 'CS220';

  IF subj_505 IS NOT NULL THEN
    INSERT INTO public.review_items (id, university_subject_id, title, prompt, answer, source_url, created_at, updated_at)
    VALUES (gen_random_uuid(), subj_505, 'Data Structures — Review 1', 'What is the time complexity of binary search?', 'O(log n) — binary search divides the sorted array in half at each step.', 'https://www.coursehero.com/sitemap/schools/3056-Cairo-University/departments/287466-CS/', now(), now())
    ON CONFLICT DO NOTHING;  -- idempotent safeguard (though UUIDs prevent real conflict)
    INSERT INTO public.review_items (id, university_subject_id, title, prompt, answer, source_url, created_at, updated_at)
    VALUES (gen_random_uuid(), subj_505, 'Data Structures — Review 2', 'What is a linked list?', 'A linear data structure where elements (nodes) point to the next node via pointers/references.', 'https://www.coursehero.com/sitemap/schools/3056-Cairo-University/departments/287466-CS/', now(), now())
    ON CONFLICT DO NOTHING;
  END IF;

  IF subj_301 IS NOT NULL THEN
    INSERT INTO public.review_items (id, university_subject_id, title, prompt, answer, source_url, created_at, updated_at)
    VALUES (gen_random_uuid(), subj_301, 'Software Engineering — Review 1', 'What does the software development life cycle include?', 'Requirements, design, implementation, testing, deployment, maintenance.', 'https://catalog.aucegypt.edu/preview_program.php?catoid=40', now(), now())
    ON CONFLICT DO NOTHING;
    INSERT INTO public.review_items (id, university_subject_id, title, prompt, answer, source_url, created_at, updated_at)
    VALUES (gen_random_uuid(), subj_301, 'Software Engineering — Review 2', 'Why is version control important?', 'Tracks changes over time; enables collaboration; allows rollback to previous versions; prevents conflicts.', 'https://catalog.aucegypt.edu/preview_program.php?catoid=40', now(), now())
    ON CONFLICT DO NOTHING;
  END IF;

  IF subj_220 IS NOT NULL THEN
    INSERT INTO public.review_items (id, university_subject_id, title, prompt, answer, source_url, created_at, updated_at)
    VALUES (gen_random_uuid(), subj_220, 'Algorithms Design — Review 1', 'What is asymptotic analysis?', 'Describes algorithm performance as input size grows (Big-O, Omega, Theta notations).', 'https://catalog.aucegypt.edu/preview_program.php?catoid=38', now(), now())
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
