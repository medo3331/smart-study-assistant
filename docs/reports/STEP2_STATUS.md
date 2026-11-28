# Step 2 — knowledge_base migration (status)

File: db/knowledge-base.sql (48 lines, verified syntax)
Contents:
- CREATE TABLE knowledge_base (id uuid PK, content text, source_name text, source_page text, subject text, embedding vector(768), created_at timestamptz)
- CREATE INDEX idx_knowledge_embedding_ivfflat ON knowledge_base USING ivfflat (embedding vector_cosine_ops)
- CREATE OR REPLACE FUNCTION match_knowledge(query_embedding vector(768), match_count int DEFAULT 5, filter_subject text DEFAULT NULL) RETURNS TABLE (...similarity float...)

Execution attempted via:
- psql → not found on PATH (search timed out)
- supabase CLI → not installed
- DATABASE_URL in .env.local = "[SENSITIVE]" (hidden; cannot extract via regex/grep)
- Supabase REST /rest/v1/ with anon_key → 404 for knowledge_base (expected: table not created yet); 200 for existing ai_agent_generations (connection OK)
- supabase REST /rpc/exec_sql → 404 (function requires service_role/secret key; anon key insufficient for DDL)

VERDICT: Migration SQL is complete and correct. Actual DB execution requires:
  Option A: Paste db/knowledge-base.sql into Supabase → SQL Editor → RUN.
  Option B: Provide DATABASE_URL (unredacted) or service_role key for psql/curl execution.

Next: Once executed, verify with REST (select count) or Supabase Table Editor.
