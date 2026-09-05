-- ============================================================================
-- Phase 1.3 — Exam Countdown SQL Function (verified future exams only)
-- Never invents exam dates; only reads curriculum_exams with is_verified = true.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_next_verified_exam(
  p_curriculum_id UUID DEFAULT NULL,
  p_stage_id UUID DEFAULT NULL,
  p_grade_id UUID DEFAULT NULL,
  p_track_id UUID DEFAULT NULL
)
RETURNS SETOF public.curriculum_exams AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.curriculum_exams
  WHERE is_verified = true
    AND exam_date >= CURRENT_DATE
    AND (p_curriculum_id IS NULL OR curriculum_id = p_curriculum_id)
    AND (p_stage_id IS NULL OR stage_id = p_stage_id)
    AND (p_grade_id IS NULL OR grade_id = p_grade_id)
    AND (p_track_id IS NULL OR track_id = p_track_id)
  ORDER BY exam_date ASC, exam_time ASC NULLS LAST
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.get_next_verified_exam IS 'Phase 1.3 — returns next verified future exam for context; never invents dates; past exams excluded by exam_date >= CURRENT_DATE';
