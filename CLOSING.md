# Session Close — 2026-08-30

Learning captured in `supabase-vector-search` skill (patched):
- Remove STRICT from plpgsql IMMUTABLE (breaks NULL params like filter_subject=NULL)
- Lock 1536 dims everywhere (table, index, function, embeddings, SQL cast)
- RLS SELECT policy USING(true); no INSERT policies (manual SQL Editor only)
- REST verification: 200 SELECT / 401 INSERT / 42 rows after insert
- RAG integration (route-rag.patch.ts): query_embedding=arrStr (no ::vector concat); supabase.rpc; context + prompt + threshold 0.7; only system changed
- Pitfall: test-query.sql can corrupt (2 bytes) — always regenerate from script

Failures NOT saved (per rule): missing psql, hidden DATABASE_URL, Groq 404/403 — all fixed by alternatives documented.
