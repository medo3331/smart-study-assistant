-- ============================================================================
-- P1-B2 (Engagement Engine) — Trusted Event Ingestion
-- Date: 2026-11-20
-- Branch: feat/engagement-p1b2-trusted-events
--
-- GOAL (vertical slice #1):
--   Provide ONE trusted way to write engagement events:
--     * a registry table that declares the allowed event types and their
--       trust level,
--     * a SECURITY DEFINER function that validates everything server-side
--       and writes with `verified_by` set by the database itself,
--     * idempotency (no duplicate events) enforced by the UNIQUE constraint
--       from migration 58,
--     * a hard rate cap per user/type.
--
-- ⚠️ NO rewards, NO XP, NO missions, NO notifications are touched here.
--    This file only adds the ingestion path. Coin/XP logic stays closed
--    until the economy + security review (Gate 0) is done.
--
-- TRUST MODEL:
--   * The function is executable by `service_role` ONLY. The browser never
--     calls it directly.
--   * `verified_by` is written by the database as a constant ('service_role').
--     The caller can never choose it, so no client can forge a "verified" label.
--   * The function validates against `engagement_event_types`:
--       - event_type must exist and be active,
--       - source_table must match the registry row (no free-form provenance),
--       - metadata keys must be a subset of the allowed keys for that type,
--       - metadata size must be within the per-type limit,
--       - per-user hourly rate cap.
--   * `trust_level` per event type:
--       - 'server'           = the event is derived from a server-verified fact.
--       - 'client_reported'  = the trigger came from the browser (e.g. a
--                              local-first notebook save). Useful for discovery,
--                              NOT usable as reward proof.
--     P1-C (missions) MUST only accept proof events whose trust_level='server'.
--
-- ROLLBACK:
--   drop function if exists public.record_engagement_event(text,text,text,uuid,jsonb,timestamptz);
--   drop table if exists public.engagement_event_types;
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ١) سجل أنواع الأحداث (مرجع واحد يحدد المسموح + مستوى الثقة)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.engagement_event_types (
  event_type text PRIMARY KEY,
  source_table text NOT NULL,
  trust_level text NOT NULL DEFAULT 'server',
  allowed_metadata_keys text[] NOT NULL DEFAULT '{}'::text[],
  max_metadata_bytes int NOT NULL DEFAULT 4096,
  max_events_per_hour int NOT NULL DEFAULT 120,
  description text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT engagement_event_types_trust_level_check CHECK (
    trust_level IN ('server', 'client_reported')
  ),
  CONSTRAINT engagement_event_types_source_table_check CHECK (
    char_length(trim(source_table)) > 0 AND char_length(source_table) <= 120
  ),
  CONSTRAINT engagement_event_types_max_metadata_bytes_check CHECK (
    max_metadata_bytes BETWEEN 0 AND 65536
  ),
  CONSTRAINT engagement_event_types_max_events_per_hour_check CHECK (
    max_events_per_hour BETWEEN 1 AND 10000
  )
);

COMMENT ON TABLE public.engagement_event_types IS
  'Registry of allowed engagement event types, their provenance, trust level and metadata contract. Written by DB owner only; read by the ingest function.';

COMMENT ON COLUMN public.engagement_event_types.trust_level IS
  'server = derived from a server-verified fact; client_reported = browser-triggered (discovery only, never reward proof).';

ALTER TABLE public.engagement_event_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.engagement_event_types FROM PUBLIC;
REVOKE ALL ON TABLE public.engagement_event_types FROM anon;
REVOKE ALL ON TABLE public.engagement_event_types FROM authenticated;
REVOKE ALL ON TABLE public.engagement_event_types FROM service_role;

-- ----------------------------------------------------------------------------
-- ٢) دالة الإدخال الموثوقة
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_engagement_event(
  p_event_type text,
  p_source_table text,
  p_source_id text,
  p_user_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_occurred_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_type public.engagement_event_types%ROWTYPE;
  v_id uuid;
  v_keys text[];
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'record_engagement_event: p_user_id is required';
  END IF;

  SELECT * INTO v_type
    FROM public.engagement_event_types t
   WHERE t.event_type = p_event_type
     AND t.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_engagement_event: unknown or inactive event type "%"', p_event_type;
  END IF;

  IF v_type.source_table <> p_source_table THEN
    RAISE EXCEPTION 'record_engagement_event: source_table "%" is not allowed for event type "%"',
      p_source_table, p_event_type;
  END IF;

  IF p_source_id IS NULL OR btrim(p_source_id) = '' THEN
    RAISE EXCEPTION 'record_engagement_event: p_source_id is required';
  END IF;

  IF length(p_source_id) > 255 THEN
    RAISE EXCEPTION 'record_engagement_event: p_source_id is too long';
  END IF;

  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'record_engagement_event: p_metadata must be a JSON object';
  END IF;

  IF octet_length(COALESCE(p_metadata, '{}'::jsonb)::text) > v_type.max_metadata_bytes THEN
    RAISE EXCEPTION 'record_engagement_event: p_metadata exceeds % bytes', v_type.max_metadata_bytes;
  END IF;

  SELECT array_agg(k) INTO v_keys
    FROM jsonb_object_keys(COALESCE(p_metadata, '{}'::jsonb)) AS k;

  IF v_keys IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(v_keys) AS k
         WHERE NOT (k = ANY (v_type.allowed_metadata_keys))
      ) THEN
    RAISE EXCEPTION 'record_engagement_event: p_metadata contains keys not allowed for "%"', p_event_type;
  END IF;

  IF (
       SELECT count(*)
         FROM public.engagement_events e
        WHERE e.user_id = p_user_id
          AND e.event_type = p_event_type
          AND e.occurred_at > now() - interval '1 hour'
     ) >= v_type.max_events_per_hour THEN
    RAISE EXCEPTION 'record_engagement_event: hourly rate limit reached for "%"', p_event_type;
  END IF;

  INSERT INTO public.engagement_events (
    user_id, event_type, source_table, source_id, occurred_at, metadata, verified_by
  )
  VALUES (
    p_user_id,
    p_event_type,
    p_source_table,
    p_source_id,
    COALESCE(p_occurred_at, now()),
    COALESCE(p_metadata, '{}'::jsonb),
    'service_role'
  )
  ON CONFLICT (user_id, event_type, source_table, source_id)
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Duplicate: the event already exists (idempotent replay).
    SELECT e.id INTO v_id
      FROM public.engagement_events e
     WHERE e.user_id = p_user_id
       AND e.event_type = p_event_type
       AND e.source_table = p_source_table
       AND e.source_id = p_source_id;

    RETURN jsonb_build_object('inserted', false, 'id', v_id, 'trust_level', v_type.trust_level);
  END IF;

  RETURN jsonb_build_object('inserted', true, 'id', v_id, 'trust_level', v_type.trust_level);
END;
$$;

COMMENT ON FUNCTION public.record_engagement_event(text, text, text, uuid, jsonb, timestamptz) IS
  'Trusted ingestion for engagement events. service_role only. Keeps verified_by server-controlled, enforces the registry allowlist, metadata contract, idempotency and an hourly rate cap.';

REVOKE ALL ON FUNCTION public.record_engagement_event(text, text, text, uuid, jsonb, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_engagement_event(text, text, text, uuid, jsonb, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.record_engagement_event(text, text, text, uuid, jsonb, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_engagement_event(text, text, text, uuid, jsonb, timestamptz) TO service_role;

-- ----------------------------------------------------------------------------
-- ٣) بذر أنواع الأحداث
--    is_active = false افتراضيًا: التفعيل requires مراجعة صريحة لكل نوع.
--    البذر idempotent: ON CONFLICT يحدّث السطر الموجود (المصدر pertenecer له
--    هو المرجع النهائي، فإعادة التطبيق بتعمل upsert مش duplicate key).
-- ----------------------------------------------------------------------------
INSERT INTO public.engagement_event_types
  (event_type, source_table, trust_level, allowed_metadata_keys, max_metadata_bytes,
   max_events_per_hour, description, is_active)
VALUES
  ('exam_completed', 'exam_sessions', 'server',
     ARRAY['percent', 'auto_correct', 'auto_total', 'has_essay'],
     2048, 20,
     'امتحان اتسلّم وتصحيحه اتعمل على السيرفر (invariants من app/api/exam-sessions/[id]/answers).',
     true),

  ('notes_saved', 'client_notes', 'client_reported',
     ARRAY['page_count', 'has_drawing', 'has_image'],
     2048, 120,
     'حفظ نوتة من local-first client ⇒ discovery فقط، لا يُستخدم كإثبات مكافأة.',
     true),

  ('lecture_saved', 'lectures', 'server',
     ARRAY['has_subject', 'source_type'],
     2048, 40,
     'محاضرة اتحفظت في public.lectures (المستخدم من الجلسة، والكتابة بـRLS).',
     true),

  ('feature_introduced', 'engagement_discovery', 'server',
     ARRAY['surface', 'campaign'],
     2048, 40,
     'ظهور رسالة تعريف بميزة للمستخدم (تُصدر من السيرفر بعد عرض فعلي).',
     true),

  ('feature_tried', 'client_notes', 'client_reported',
     ARRAY['feature'],
     2048, 60,
     'المستخدم جرّب الميزة فعليًا (إثبات ضعيف حاليًا).',
     true),

  ('feature_adopted', 'engagement_discovery', 'server',
     ARRAY['feature', 'active_days', 'adoption_min_days'],
     2048, 40,
     'تبنّي الميزة: استخدام على أيام كايرو مختلفة (بيشتقه السيرفر من الأحداث).',
     true)
ON CONFLICT (event_type) DO UPDATE SET
  source_table = EXCLUDED.source_table,
  trust_level = EXCLUDED.trust_level,
  allowed_metadata_keys = EXCLUDED.allowed_metadata_keys,
  max_metadata_bytes = EXCLUDED.max_metadata_bytes,
  max_events_per_hour = EXCLUDED.max_events_per_hour,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

COMMIT;
