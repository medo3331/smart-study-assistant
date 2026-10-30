# Magicly Admin Control Center — Audit Gap Closure Report

**Repository:** smart-study-assistant  
**Branch:** cline/47234  
**HEAD:** 54fabe6cf2f0ee76da1b6f78fc3710d5fc3cb7e9  
**Working tree:** unchanged except docs/admin-control-center-audit-report.md + new report  
**Mode:** Read-only audit only. No code/DB mutations.

## 1. AI Route Review

### /api/chat (`app/api/chat/route.ts`)
- Auth: `requireUser("message")` (authenticated).
- Rate limit: `checkRateLimit("chat:${id}", 20, 60_000)`.
- Subscription quota: `checkSubscriptionQuota(user.id, "message")` enforced.
- Model access: `filterAccessibleModels(candidates, hasEnt)` where hasEnt uses `has_entitlement`.
- Credit: `guardAiAccessAndReserve(...)` then refund on provider failure.
- Usage events: `recordAiOperation(... completed/failed)`.
- Error handling: refund best-effort, provider errors mapped.

### /api/ai (`app/api/ai/route.ts`)
- Auth: `requireUser("success")`.
- Rate limit: `checkRateLimit("ai:${id}", 20, 60_000)` (before task-specific).
- Subscription quota: `checkSubscriptionQuota(user.id, "message")` enforced.
- Model access: `filterAccessibleModels(routeCandidates(task), hasEnt)`.
- Credit: `guardAiAccessAndReserve`.
- Usage events: `recordAiOperation`.
- Error handling: refund on catch.

### /api/generate-plan (`app/api/generate-plan/route.ts`)
- Auth: `requireUser("success")`.
- Rate limit: `checkRateLimit("plan:${id}", 8, 60_000)`.
- Subscription quota: **NOT called** (gap).
- Credit: `guardAiAccessAndReserve(..., "openai/gpt-oss-120b")`.
- Provider: direct Groq fallback loop (not model access/filter beyond guard).
- Usage events: none (`recordAiOperation` not called).
- Error handling: refund in catch + invalid JSON path returns without refund? Note: invalid JSON path (lines 150-158) returns 502 without refund (minor gap).

### /api/generate-slides (`app/api/generate-slides/route.ts`)
- Auth: `requireUser("success")`.
- Rate limit: `checkRateLimit("slides:${id}", 8, 60_000)`.
- Subscription quota: **NOT called** (gap).
- Credit: `guardAiAccessAndReserve`.
- Provider: direct Groq.
- Usage events: none.
- Error handling: refund in catch; empty slides returns 502 without refund? (lines 195-200) minor.

### /api/unified-ai (`app/api/unified-ai/route.ts`)
- Auth: optional (anonymous allowed for free models).
- Rate limit: custom `checkAiRateLimit`, `checkModelRateLimit`, `checkAgentRateLimit`, `checkGuestRateLimit`.
- Subscription quota: **NOT called** (documented intentional: credits are quota).
- Credit: `reserve_ai_credit` via service client for authenticated users; anonymous free models only.
- Model access: `getModelAccessPolicy`, `filterAccessibleModels`.
- Usage events: not via `recordAiOperation` (unifiedAI may not record).
- Error handling: refund on failure.

**Confirmed bypass/hypothesis:**
- generate-plan and generate-slides bypass subscription quota (confirmed).
- unified-ai bypasses subscription quota (intentional by design, documented).
- generate-plan/slides do not record ai_operations (confirmed).

## 2. Billing Settings Permission

Current `app/plans/actions.ts:updateBillingSettings`:
- Auth: `supabase.auth.getUser()`; rejects anonymous.
- Permission: `hasPermission(supabase, user.id, user.email, "plans.manage")` (Owner-only per map).
- Audit: `recordAuditLog` PASS/FAIL/BLOCKED.
- **Conclusion:** The earlier reported premium-entitlement bypass is already fixed in this branch. The report's claim is outdated.

## 3. Add-Credits Authorization

`app/api/admin/add-credits/route.ts`:
- Auth: `supabase.auth.getUser()`.
- Permission: `getAdminRole(...) === "owner" || "admin"`.
- Validation: targetUserId required, amount 1..10000.
- Service role: `createServiceClient()` → `grant_ai_credits` RPC.
- RefId: `admin-grant:${Date.now()}-${random}` (not idempotent across retries).
- Audit: none in route (relies on ledger reason=admin_grant).
- Failure: redirect with error message.

**Findings:**
- Owner/admin only (good).
- No idempotency key from client; duplicate submit can double-grant (medium).
- No audit_log entry (only ledger metadata).
## 4. Duplicate Credit Sources

- `profiles.credits` appears in DB schema but **no code reads/writes** it (search returned none except docs).
- `ai_credit_ledger` is the only active source via RPCs.
- **Conclusion:** `profiles.credits` is stale/legacy (or unused cache). Safe to deprecate after confirming no DB triggers (not verified here).

## 5. Schema / Trial Verification

- `subscription_plans.trial_days=0` in DB; trial represented by entitlement metadata `premium_trial_0_5`.
- Trial enforcement path not fully located (economy-phase-0-5-trial-atomic.sql not read).
- `ai_operations` empty → instrumentation gap (recordAiOperation not called in generate-plan/slides/unified-ai).
- RLS/indexes not fully verified (table/columns only).

## 6. 20 vs 30 Limit Conflict

- `FREE_TEXT_LIMIT=30` (2h window) in `lib/ai/rate-limit.ts`.
- DB `messages_per_2h=20` (2h window) in `subscription_plans`.
- These govern **different systems**:
  - `FREE_TEXT_LIMIT` → rate-limit sliding window (Phase A).
  - `messages_per_2h` → subscription quota (Phase 1.5, converted to daily equivalent ×12).
- For free users: rate-limit allows 30/2h; subscription quota allows 240/day (20×12). They do not conflict directly but are inconsistent and confusing.
- `user-ai-status` uses `FREE_TEXT_LIMIT` for display, not DB.

## 7. Recommended Minimal Remediation Order

1. Add subscription quota to generate-plan and generate-slides (or document exemption).
2. Add `recordAiOperation` calls to generate-plan/slides/unified-ai for analytics.
3. Add idempotency to add-credits (client token or DB unique ref).
4. Add audit_log to add-credits.
5. Decide canonical free limit (20 vs 30) and align code/DB/UI.
6. Deprecate `profiles.credits` after trigger check.
7. Implement Email Center using existing tables.

## 8. Tests Required Before Remediation

- Non-admin 403 on add-credits.
- Duplicate submit does not double-grant.
- Audit log recorded on add-credits.
- generate-plan/slides enforce quota when enabled.
- ai_operations recorded on success/failure.

## 9. Remaining Unknowns

- Trial enforcement exact path.
- DB triggers on profiles.credits.
- RLS/indexes.
- unified-ai usage recording.
- Whether unified-ai should enforce subscription quota.

