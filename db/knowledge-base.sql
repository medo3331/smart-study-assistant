-- Step 2: knowledge_base table + ivfflat index + match_knowledge function
-- Vector extension must already be enabled (Step 1 completed).
-- Run this in Supabase SQL Editor (or psql against DATABASE_URL).

-- 1) Table
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_page TEXT,
  subject TEXT NOT NULL,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2) ivfflat index on embedding for fast cosine-similarity search
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding_ivfflat
ON knowledge_base USING ivfflat (embedding vector_cosine_ops);

-- 3) match_knowledge function
CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 5,
  filter_subject TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source_name TEXT,
  source_page TEXT,
  subject TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.content,
    kb.source_name,
    kb.source_page,
    kb.subject,
    (1 - (kb.embedding <=> query_embedding))::FLOAT AS similarity
  FROM knowledge_base kb
  WHERE (filter_subject IS NULL OR kb.subject = filter_subject)
  ORDER BY kb.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
