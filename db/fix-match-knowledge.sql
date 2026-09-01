-- Fix: remove STRICT from match_knowledge so NULL filter_subject works (no empty result)
-- Execute this directly in Supabase SQL Editor — no table recreation needed
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
