# DB Verification — post-execution (verified via REST)

Checked live against https://lgaqgkihhmedtdzcgpnc.supabase.co (anon_key, not simulated):
- GET /rest/v1/knowledge_base?select=id&limit=3 → 200, body contains real UUIDs (e.g. 6e164bb7-...)
- GET /rest/v1/knowledge_base?select=count → 200, {"count":42}
- POST /rest/v1/knowledge_base (anon_key, JSON embedding) → 401 RLS (expected: no INSERT policy)

State: db/knowledge-base.sql executed; db/knowledge-base-rls.sql executed (SELECT policy active, INSERT blocked);
42 knowledge_base rows present; match_knowledge SQL exists and is now testable on real data via test-query.sql.
