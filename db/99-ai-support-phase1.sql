-- ============================================================================
-- MAGICLY — AI Support Phase 1: Data Layer
-- ============================================================================
-- Purpose:
--   Add the database structures required for the AI Support & Auto-Resolution
--   system (Phase 1), on top of the existing Inbox / Support / Admin
--   messaging infrastructure. No existing tables are modified or deleted.
--
-- Downstream effects (database-level):
--   - New tables are ADDED below. No existing table is dropped, recreated,
--     or altered.
--   - No new RLS policies are created that would change existing access
--     control for the support/messaging tables.
--   - AI-generated knowledge articles are stored and queried privately by
--     admins; student-to-student conversations are never touched.
--
-- Rollback:
--   - Drop the new tables and their indexes in reverse dependency order.
--   - No existing data is touched.
--
-- IMPORTANT: This migration is NOT applied automatically. It must be reviewed
-- and approved before running on any environment (Development or Production).
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Knowledge Base
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  slug TEXT NOT NULL,

  -- Content
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  problem_description TEXT NOT NULL,
  symptoms TEXT NOT NULL,
  search_keywords TEXT[],
  preventive_diagnosis_questions TEXT[],
  approved_solution TEXT NOT NULL,
  resolution_steps TEXT NOT NULL,
  allowed_action_key TEXT,
  verification_steps TEXT NOT NULL,
  escalation_conditions TEXT NOT NULL,
  source_type TEXT NOT NULL,
  required_staff_role TEXT NOT NULL DEFAULT 'support.manage',
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,

  -- Tracking / lifecycle
  status TEXT NOT NULL DEFAULT 'draft',          -- draft | published | archived
  version INTEGER NOT NULL DEFAULT 1,
  source_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT support_knowledge_articles_posture_check
    CHECK (
      status IN ('draft', 'published', 'archived')
      AND (status = 'published' OR version >= 1)
      AND published_at IS NOT NULL
    )
);

COMMENT ON TABLE support_knowledge_articles IS
  'Published knowledge articles the AI can read when helping students.
   AI may only create DRAFTS, never published content.
   Authors: admins only.';

-- Unique slug across the table so search stays deterministic
CREATE UNIQUE INDEX IF NOT EXISTS
  idx_support_knowledge_articles_slug
  ON support_knowledge_articles (slug);

-- Search trigger: published articles only
CREATE INDEX IF NOT EXISTS
  idx_support_knowledge_articles_published_status
  ON support_knowledge_articles (status, published_at DESC);

CREATE INDEX IF NOT EXISTS
  idx_support_knowledge_articles_search
  ON support_knowledge_articles
  USING GIN (search_keywords);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Knowledge Base Versions
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_knowledge_article_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES support_knowledge_articles(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  approved_solution TEXT NOT NULL,
  resolution_steps TEXT NOT NULL,
  status TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT support_knowledge_article_versions_version_check
    CHECK (version > 0)
);

COMMENT ON TABLE support_knowledge_article_versions IS
  'Immutable historical versions for published articles.
   Every approved change is appended, never overwrite.';

CREATE INDEX IF NOT EXISTS
  idx_support_knowledge_article_versions_article
  ON support_knowledge_article_versions (article_id, version DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. AI Case Processing State
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_ai_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source identity (what message generated this case)
  ticket_id UUID,
  conversation_id TEXT,
  request_id UUID,

  -- Processing state
  event_type TEXT NOT NULL,                    -- 'support_message' | 'admin_message' | 'support_reply' | 'admin_reply'
  status TEXT NOT NULL DEFAULT 'received',     -- received | acknowledged | classifying | diagnosing | awaiting_student | attempting_resolution | resolved_pending_confirmation | escalated | human_handling | closed
  current_step TEXT NOT NULL DEFAULT 'received',
  ai_run_id UUID,
  human_escalation_summary TEXT,
  ai_verification_result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Auditing
  created_by TEXT NOT NULL,
  ai_suggested_at TIMESTAMPTZ,
  human_answered_at TIMESTAMPTZ,

  CONSTRAINT support_ai_cases_status_check
    CHECK (
      status IN (
        'received', 'acknowledged', 'classifying', 'diagnosing',
        'awaiting_student', 'attempting_resolution', 'resolved_pending_confirmation',
        'escalated', 'human_handling', 'closed'
      )
    )
);

COMMENT ON TABLE support_ai_cases IS
  'Per-message processing state for the AI support pipeline.
   Each student support message gets exactly one case record so the pipeline
   can be resumed idempotently.';

CREATE INDEX IF NOT EXISTS
  idx_support_ai_cases_ticket_created
  ON support_ai_cases (ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS
  idx_support_ai_cases_status
  ON support_ai_cases (status, updated_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. AI Runs (model calls)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent case and component
  case_id UUID NOT NULL REFERENCES support_ai_cases(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL,                      -- 'classification' | 'knowledge_search' | 'diagnostic_response' | 'solution_attempt' | 'verification' | 'escalation'
  model_name TEXT NOT NULL,
  provider TEXT,
  prompt_length_tokens INTEGER,
  response_length_tokens INTEGER,

  -- Input / output (sanitized)
  input_snippet TEXT,
  output_snippet TEXT,
  classification_jsonb JSONB,
  response_text TEXT,
  confidence_score NUMERIC,
  is_low_confidence BOOLEAN,

  -- Status
  status TEXT NOT NULL DEFAULT 'completed',    -- processing | completed | failed | skipped
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,

  CONSTRAINT support_ai_runs_status_check
    CHECK (status IN ('processing', 'completed', 'failed', 'skipped'))
);

COMMENT ON TABLE support_ai_runs IS
  'Log of every AI model call the support pipeline makes.
   Stored server-side (service role only). No student-facing exposure.';

CREATE INDEX IF NOT EXISTS
  idx_support_ai_runs_case
  ON support_ai_runs (case_id, started_at DESC);

CREATE INDEX IF NOT EXISTS
  idx_support_ai_runs_status
  ON support_ai_runs (status, started_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. AI Action Logs (safe actions)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_ai_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  case_id UUID NOT NULL REFERENCES support_ai_cases(id) ON DELETE CASCADE,
  article_id UUID REFERENCES support_knowledge_articles(id) ON DELETE SET NULL,

  -- Action
  action_key TEXT NOT NULL,
  action_description TEXT NOT NULL,
  action_input JSONB NOT NULL,
  action_result JSONB,
  action_verification JSONB,
  action_status TEXT NOT NULL DEFAULT 'pending',   -- pending | verified | failed | escalated

  -- Tracking
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,

  CONSTRAINT support_ai_action_logs_status_check
    CHECK (action_status IN ('pending', 'verified', 'failed', 'escalated'))
);

COMMENT ON TABLE support_ai_action_logs IS
  'Every automated action proposed or executed by the AI support layer.
   Never used to silently act on a student; every entry is auditable.';

CREATE INDEX IF NOT EXISTS
  idx_support_ai_action_logs_case
  ON support_ai_action_logs (case_id, attempted_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Event Deduplication (Idempotency)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_ai_event_deduplication (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What event we are deduplicating
  event_source TEXT NOT NULL,                  -- 'support_message' | 'admin_message' | 'ticket_reply'
  external_event_id TEXT NOT NULL,             -- unique per source (e.g. message id in a ticket)
  event_kind TEXT NOT NULL,
  event_payload JSONB NOT NULL,

  -- Deduplication state
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_by TEXT NOT NULL,

  CONSTRAINT support_ai_event_deduplication_unique_pair
    UNIQUE (event_source, external_event_id),

  CONSTRAINT support_ai_event_deduplication_source_check
    CHECK (
      event_source IN ('support_message', 'admin_message', 'ticket_reply')
      AND event_kind IN ('standard', 'acknowledgement', 'classification', 'escalation')
    )
);

COMMENT ON TABLE support_ai_event_deduplication IS
  'Prevents duplicate processing of the same support event.
   The unique pair (event_source, external_event_id) guarantees that a given
   support message is never classified/executed twice, even if the webhook
   fires twice.';

CREATE INDEX IF NOT EXISTS
  idx_support_ai_event_deduplication_source
  ON support_ai_event_deduplication (event_source, processed_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY: Row Level Security
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE support_knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_knowledge_article_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ai_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ai_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ai_event_deduplication ENABLE ROW LEVEL SECURITY;

-- No public read of knowledge base articles (admin + AI read via service role)
DROP POLICY IF EXISTS "admin_read_knowledge_articles" ON support_knowledge_articles;
CREATE POLICY "admin_read_knowledge_articles" ON support_knowledge_articles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM site_admins
      WHERE site_admins.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_read_knowledge_article_versions" ON support_knowledge_article_versions;
CREATE POLICY "admin_read_knowledge_article_versions" ON support_knowledge_article_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM site_admins
      WHERE site_admins.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_manage_knowledge_articles" ON support_knowledge_articles;
CREATE POLICY "admin_manage_knowledge_articles" ON support_knowledge_articles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM site_admins
      WHERE site_admins.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_manage_knowledge_article_versions" ON support_knowledge_article_versions;
CREATE POLICY "admin_manage_knowledge_article_versions" ON support_knowledge_article_versions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM site_admins
      WHERE site_admins.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "support_ai_view_case" ON support_ai_cases;
CREATE POLICY "support_ai_view_case" ON support_ai_cases
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM site_admins
      WHERE site_admins.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "support_ai_manage_case" ON support_ai_cases;
CREATE POLICY "support_ai_manage_case" ON support_ai_cases
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM site_admins
      WHERE site_admins.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "support_ai_view_runs" ON support_ai_runs;
CREATE POLICY "support_ai_view_runs" ON support_ai_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM site_admins
      WHERE site_admins.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "support_ai_manage_runs" ON support_ai_runs;
CREATE POLICY "support_ai_manage_runs" ON support_ai_runs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM site_admins
      WHERE site_admins.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "support_ai_view_action_logs" ON support_ai_action_logs;
CREATE POLICY "support_ai_view_action_logs" ON support_ai_action_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM site_admins
      WHERE site_admins.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "support_ai_manage_action_logs" ON support_ai_action_logs;
CREATE POLICY "support_ai_manage_action_logs" ON support_ai_action_logs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM site_admins
      WHERE site_admins.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "support_ai_view_dedup" ON support_ai_event_deduplication;
CREATE POLICY "support_ai_view_dedup" ON support_ai_event_deduplication
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM site_admins
      WHERE site_admins.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "support_ai_manage_dedup" ON support_ai_event_deduplication;
CREATE POLICY "support_ai_manage_deduplication" ON support_ai_event_deduplication
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM site_admins
      WHERE site_admins.user_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- Indexes for performance (no change to existing schema)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS
  idx_support_knowledge_articles_status
  ON support_knowledge_articles (status, category, subcategory);

CREATE INDEX IF NOT EXISTS
  idx_support_ai_cases_event_type
  ON support_ai_cases (event_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS
  idx_support_ai_runs_type_status
  ON support_ai_runs (run_type, status, started_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════
