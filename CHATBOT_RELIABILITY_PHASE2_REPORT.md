placeholder
## Phase 3A - Credit accounting notes
- In-memory guard (refunded flag) added in app/api/unified-ai/route.ts to ensure at most one refund per request across provider-failure and exception paths.
- DB-level idempotency of refund_ai_credit(p_user_id, p_ref_id) is not verifiable from this repo; if the RPC is not idempotent on p_ref_id, a database-level unique constraint / idempotency key is required. No SQL was applied in this phase.
- No second charging path introduced.
