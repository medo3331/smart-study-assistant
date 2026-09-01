# Correction — removed truncation (1536 dims kept full)

Requested change: no truncation/padding of OpenRouter embeddings.

Changes applied:
- db/knowledge-base.sql: embedding VECTOR(1536), match_knowledge query_embedding VECTOR(1536)
- embed-chunks.py: removed 4 lines of [:DIMS] / padding; DIMS=1536; print confirms full kept
- chunks.json: regenerated (21 chunks, 887KB, all 1536 dims verified)
- generate-insert.py: ::vector(1536) in SQL template
- insert-chunks.sql: regenerated (347KB, 21 INSERT with full 1536 arrays)

Verified: grep VECTOR in sql → 2 hits both 1536; chunks dims check 0 bad; insert dims=1536.
