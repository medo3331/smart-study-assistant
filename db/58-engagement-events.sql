-- ============================================================================
-- P1-B (Engagement Engine) — engagement_events (schema-only foundation)
-- Date: 2026-11-20 (planned); hardened P1-B1.2 on feat/engagement-p1b1-schema
--
-- READ-ONLY / SCHEMA-ONLY INTENT:
--   Append-only engagement event ledger for future P1-B/C work. No rewards,
--   no XP/coin changes, no application behavior wired here. Do not apply to
--   production without explicit approval.
--
-- Security model (target):
--   - RLS enabled, NO policies for anon/authenticated (deny by default).
--   - Table privileges revoked from PUBLIC/anon/authenticated; TRUNCATE revoked
--     from anon/authenticated (defense in depth). Exact role behavior depends
--     on environment (e.g. Supabase service_role); see deployment notes.
--   - Writes only via trusted server paths (service_role or SECURITY DEFINER
--     functions) that set verified_by server-side and enforce allowlists — to
--     be designed in P1-B2.
--   - UPDATE/DELETE blocked by BEFORE row triggers. TRUNCATE is NOT blocked by
--     row triggers; rely on privileges + operational controls + future hardening
--     review (see MAGICLY_ENGAGEMENT_P1B1_SECURITY_REVIEW.md).
--
-- NOTE (FORCE RLS): Not enabled here. Enabling FORCE ROW LEVEL SECURITY would
-- apply RLS to table owners in standard Postgres and can break admin workflows;
-- evaluate per environment before production.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.engagement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  -- Flexible source identity (P1-B1.2): use the upstream system's stable identifier
  -- as text (UUID string, numeric id as string, composite key encoded by caller rules).
  -- Do not store raw PII in source_ref.
  source_table text NOT NULL,
  source_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Trust label: must be set by trusted ingestion paths only (service_role/definer/trigger).
  -- Schema allows these values; enforcement is procedural + future trusted functions.
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
  CONSTRAINT engagement_events_source_id_nonempty CHECK (
    char_length(trim(source_id)) > 0 AND char_length(source_id) <= 255
  ),
  CONSTRAINT engagement_events_metadata_is_object CHECK (
    jsonb_typeof(metadata) = 'object'
  ),
  CONSTRAINT engagement_events_metadata_size CHECK (
    octet_length(metadata::text) <= 16384
  ),
  CONSTRAINT engagement_events_occurred_at_bounds CHECK (
    occurred_at >= '2000-01-01'::timestamptz
    AND occurred_at <= '2100-01-01'::timestamptz
  ),
  CONSTRAINT engagement_events_user_source_unique UNIQUE (user_id, event_type, source_table, source_id)
);

COMMENT ON TABLE public.engagement_events IS
  'P1-B append-only ledger of verified engagement events (no client access). No rewards in P1-B. See MAGICLY_ENGAGEMENT_P1B1_SECURITY_REVIEW.md.';

COMMENT ON COLUMN public.engagement_events.source_id IS
  'Upstream stable identifier serialized as text (avoid PII). Uniqueness scoped with user_id, event_type, source_table.';
COMMENT ON COLUMN public.engagement_events.verified_by IS
  'Set only by trusted paths: service_role (server route with service client), definer (SECURITY DEFINER RPC), or trigger. Do not accept from untrusted clients.';

-- Indexes (per P1-A reconciliation)
CREATE INDEX IF NOT EXISTS idx_engagement_events_user_occurred
  ON public.engagement_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_engagement_events_event_type_occurred
  ON public.engagement_events (event_type, occurred_at DESC);

-- RLS: enabled, no policies (deny-by-default for authenticated/anon via absence of policies)
ALTER TABLE public.engagement_events ENABLE ROW LEVEL SECURITY;

-- Revoke all privileges from client roles
REVOKE ALL ON TABLE public.engagement_events FROM PUBLIC;
REVOKE ALL ON TABLE public.engagement_events FROM anon;
REVOKE ALL ON TABLE public.engagement_events FROM authenticated;
REVOKE TRUNCATE ON TABLE public.engagement_events FROM anon;
REVOKE TRUNCATE ON TABLE public.engagement_events FROM authenticated;

-- Append-only: reject updates and deletes.
--
-- ⚠️ **استثناء واحد مقصود**: الـDELETE اللي جاي من FK cascade (حذف المستخدم
--    من auth.users) مسموح — وإلا حذف الحساب نفسه كان هيقف بسببEvents
--    (و ده يكسر حق المستخدم في حذف بياناته + الـFK ON DELETE CASCADE).
--    التمييز بينه وبين الحذف المباشر يتم بـpg_trigger_depth():
--      1 = حذف مباشر (مرفوض).
--      2 = حذف جاي من cascade (مسموح).
CREATE OR REPLACE FUNCTION public._engagement_events_no_mutate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    -- cascade من FK (حذف المستخدم) — متاح.
    RETURN OLD;
  END IF;

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
