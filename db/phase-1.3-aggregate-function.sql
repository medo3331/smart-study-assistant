-- ============================================================================
-- Phase 1.3 — Coverage Aggregation SQL Function (server-side, deterministic)
-- Computes coverage directly from real tables: mappings + study_days + audit
-- Never accepts a client-submitted percentage. Only reads verified mappings.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_curriculum_coverage_aggregate(
  p_user_id UUID,
  p_curriculum_id UUID DEFAULT NULL
)
RETURNS TABLE (
  user_id UUID,
  curriculum_id UUID,
  total_mapped_lessons INTEGER,
  completed_lessons INTEGER,
  remaining_lessons INTEGER,
  coverage_percent DECIMAL(5,2),
  unmapped_content_count INTEGER,
  coverage_state TEXT,
  computed_at TIMESTAMPTZ
) AS $$
DECLARE
  v_total_mapped INTEGER := 0;
  v_completed INTEGER := 0;
  v_unmapped INTEGER := 0;
BEGIN
  -- Count verified mapped lessons for the curriculum (or all user curricula if null)
  SELECT COUNT(*)::INTEGER INTO v_total_mapped
  FROM public.curriculum_lessons cl
  JOIN public.curriculum_content_mapping cm ON cl.mapping_id = cm.id
  WHERE cm.is_verified = true
    AND cm.curriculum_id = COALESCE(p_curriculum_id, cm.curriculum_id);

  -- Count real completed lessons (only study_days with is_completed = true)
  SELECT COUNT(*)::INTEGER INTO v_completed
  FROM public.curriculum_lessons cl
  JOIN public.curriculum_content_mapping cm ON cl.mapping_id = cm.id
  LEFT JOIN public.study_days sd ON cl.study_day_id = sd.id
  WHERE cm.is_verified = true
    AND cm.curriculum_id = COALESCE(p_curriculum_id, cm.curriculum_id)
    AND sd.is_completed = true;

  -- Unmapped verified content (verified mappings with no lesson mapping yet)
  SELECT (COUNT(DISTINCT cm.id) - COUNT(DISTINCT cl.id))::INTEGER INTO v_unmapped
  FROM public.curriculum_content_mapping cm
  LEFT JOIN public.curriculum_lessons cl ON cm.id = cl.mapping_id
  WHERE cm.is_verified = true
    AND cm.curriculum_id = COALESCE(p_curriculum_id, cm.curriculum_id);

  RETURN QUERY
  SELECT
    p_user_id,
    COALESCE(p_curriculum_id, cm.curriculum_id),
    v_total_mapped,
    v_completed,
    GREATEST(0, v_total_mapped - v_completed),
    CASE WHEN v_total_mapped > 0 THEN ROUND((v_completed::DECIMAL / v_total_mapped) * 100, 2) ELSE 0::DECIMAL END,
    GREATEST(0, v_unmapped),
    CASE
      WHEN v_total_mapped = 0 AND v_unmapped > 0 THEN 'partially_mapped'::TEXT
      WHEN v_total_mapped = 0 AND v_unmapped = 0 THEN 'no_data'::TEXT
      WHEN v_completed = 0 AND v_total_mapped > 0 AND v_total_mapped < 3 THEN 'insufficient_data'::TEXT
      WHEN v_completed = 0 AND v_total_mapped > 0 THEN 'active'::TEXT
      WHEN v_completed >= v_total_mapped AND v_total_mapped > 0 THEN 'complete'::TEXT
      ELSE 'active'::TEXT
    END,
    now()
  FROM public.curriculum_content_mapping cm
  WHERE cm.is_verified = true
    AND cm.curriculum_id = COALESCE(p_curriculum_id, cm.curriculum_id)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.get_curriculum_coverage_aggregate IS 'Phase 1.3 — deterministic server-side coverage aggregation; reads verified mappings + real study_day completions only; never trusts client-submitted percentages';
