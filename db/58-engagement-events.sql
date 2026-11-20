-- ============================================================================
-- P1-B (Engagement Engine) — engagement_events (schema-only foundation)
-- Date: 2026-11-20 (planned)
--
-- READ-ONLY / SCHEMA-ONLY INTENT:
--   This migration creates the append-only engagement event ledger used by
--   future P1-B/C work. It does NOT grant rewards, does NOT change XP/coin
--   flows, and does NOT wire application behavior. Apply only on a branch
--   migration review; do not apply to production as part of this change set
--   unless explicitly approved in a separate step.
--
-- Security model:
--   - RLS enabled, NO policies for anon/authenticated.
--   - All client roles revoked from table privileges.
--   - Writes should occur only via service_role or SECURITY DEFINER functions
--     that validate inputs (to be added in later phases).
--   - Append-only: UPDATE/DELETE rejected by trigger.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.engagement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT engagement_events_verified_by_check CHECK (
    verified_by IN ('service_role', 'definer', 'trigger')
  ),
  CONSTRAINT engagement_events_event_type_nonempty CHECK (
    char_length(trim(event_type)) > 0 AND char_length(event_type) <= 120
  ),
  CONSTRAINT engagement_events_source_table_nonempty CHECK (
    char_length(trim(source_table)) > 0 AND char_length(source_table) <= 120
  ),
  CONSTRAINT engagement_events_metadata_is_object CHECK (
    jsonb_typeof(metadata) = 'object'
  ),
  CONSTRAINT engagement_events_user_source_unique UNIQUE (user_id, event_type, source_table, source_id)
);

COMMENT ON TABLE public.engagement_events IS
  'P1-B append-only ledger of verified engagement events (no client access). Used for missions/discovery proof later; no rewards in P1-B.';

COMMENT ON COLUMN public.engagement_events.verified_by IS
  'How the event was recorded: service_role (server route with service client), definer (SECURITY DEFINER RPC), or trigger.';

-- Indexes (per P1-A reconciliation)
CREATE INDEX IF NOT EXISTS idx_engagement_events_user_occurred
  ON public.engagement_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_engagement_events_event_type_occurred
  ON public.engagement_events (event_type, occurred_at DESC);

-- RLS: enabled, no policies (deny-by-default for authenticated/anon via absence of policies)
ALTER TABLE public.engagement_events ENABLE ROW LEVEL SECURITY;

-- Revoke all privileges from client roles
REVOKE ALL ON TABLE public.engagement_events FROM anon;
REVOKE ALL ON TABLE public.engagement_events FROM authenticated;
-- service_role retains privileges by default in Supabase; do not grant to anon/authenticated.

-- Append-only: reject updates and deletes
CREATE OR REPLACE FUNCTION public._engagement_events_no_mutate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'engagement_events is append-only (% not allowed)', TG_OP;
END;
$$;

REVOKE ALL ON FUNCTION public._engagement_events_no_mutate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._engagement_events_no_mutate() FROM anon;
REVOKE ALL ON FUNCTION public._engagement_events_no_mutate() FROM authenticated;

DROP TRIGGER IF EXISTS engagement_events_no_update ON public.engagement_events;
CREATE TRIGGER engagement_events_no_update
  BEFORE UPDATE ON public.engagement_events
  FOR EACH ROW
  EXECUTE FUNCTION public._engagement_events_no_mutate();

DROP TRIGGER IF EXISTS engagement_events_no_delete ON public.engagement_events;
CREATE TRIGGER engagement_events_no_delete
  BEFORE DELETE ON public.engagement_events
  FOR EACH ROW
  EXECUTE FUNCTION public._engagement_events_no_mutate();

COMMIT;
