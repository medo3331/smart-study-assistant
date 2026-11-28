-- Phase 1: persist one Quran reading position per authenticated user.
-- Additive migration; does not alter existing worship_progress or profiles data.
BEGIN;

CREATE TABLE IF NOT EXISTS public.quran_reading_positions (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  surah_id smallint NOT NULL CHECK (surah_id BETWEEN 1 AND 114),
  ayah_id smallint NOT NULL CHECK (ayah_id BETWEEN 1 AND 286),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quran_reading_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quran_reading_positions: owner read" ON public.quran_reading_positions;
DROP POLICY IF EXISTS "quran_reading_positions: owner insert" ON public.quran_reading_positions;
DROP POLICY IF EXISTS "quran_reading_positions: owner update" ON public.quran_reading_positions;

CREATE POLICY "quran_reading_positions: owner read"
  ON public.quran_reading_positions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "quran_reading_positions: owner insert"
  ON public.quran_reading_positions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "quran_reading_positions: owner update"
  ON public.quran_reading_positions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.quran_reading_positions FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.quran_reading_positions TO authenticated;

COMMIT;
