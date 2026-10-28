-- Magicly — Incident Reports Table (PROPOSED, NOT APPLIED)
-- Run this manually after review. Do not auto-apply.

CREATE TABLE IF NOT EXISTS magicly_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id TEXT NOT NULL UNIQUE,
  error_code TEXT NOT NULL,
  stage TEXT,
  http_status INTEGER,
  attachment_type TEXT,
  mime_type TEXT,
  provider TEXT,
  model TEXT,
  sanitized_summary TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE magicly_incidents IS 'Sanitized technical incident metadata for Magicly AI errors. Inserted server-side via service role only.';

-- Admin-only read access
ALTER TABLE magicly_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_incidents" ON magicly_incidents;
CREATE POLICY "admin_read_incidents" ON magicly_incidents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM site_admins
      WHERE site_admins.user_id = auth.uid()
    )
  );

-- Index for recent-incident lookups
CREATE INDEX IF NOT EXISTS magicly_incidents_created_at_desc_idx
  ON magicly_incidents (created_at DESC);

-- No public insert (server uses service role)
-- Retention: 90 days is NOT enforced automatically. To enforce, add a
-- scheduled cleanup (pg_cron) or a manual DELETE job, e.g.:
--   DELETE FROM magicly_incidents WHERE created_at < now() - interval '90 days';
