-- Step 2b: Row-Level Security (RLS) for knowledge_base
-- Run this in Supabase SQL Editor after db/knowledge-base.sql
-- Content is public study material (lectures / subjects), not user-sensitive.

-- 1) Enable RLS on the table
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base FORCE ROW LEVEL SECURITY;  -- apply to table owner too

-- 2) Public SELECT policy (read access for anyone) — content is public knowledge
CREATE POLICY "Allow public read access" ON knowledge_base
  FOR SELECT
  USING (true);

-- Note: NO INSERT / UPDATE / DELETE policies created for anon.
-- Data insertion remains manual via SQL Editor (or service_role / admin).
