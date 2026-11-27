# PHASE 3.2d — Billing Integration Verification Report

**Repository:** `C:/Desktop/smart-study-assistant` (Magicly university platform)
**Branch executed:** `feat/phase1-ai-credits-repair` (`.worktrees/phase1-ai-credits`)
**Date:** 2026-11-26
**Scope:** Billing / credit-reservation / settlement integration verification (Phase 3.2d)

> **Method:** read-only code inspection + RPC schema review + mocked vitest baseline run. No production database, no production credentials, no balance modifications, no SQL executed. This report settles architectural questions from code evidence only.

---

## 1. Executive verdict on the financial question

**Q (user's conclusion): "هل الطالب بيتخصم منه الاستهلاك الفعلي، ولا قيمة الحجز فقط؟"**
**A: right now it is the reservation value (1:1 reserve/refund), NOT actual consumption-based charging.**

Current `reserve_ai_credit` is a **flat ledger debit of `p_amount` (default 1)** with reason `ai_reserve`. There is **no two-phase hold + final-charge + partial-release** path in the database. The `settleUnifiedAiUsage` engine (in the phase-1 branch) is **shadow-only**: it returns a computed summary but writes **no ledger entry** and does **not release/release-partial** the reservation. The route refunds a reservation back **only on failure/other paths**; on success it keeps the reservation.

Thus, for the worked example (100 → reserve 10 → charge 4 → final 96) **this cannot be produced by the existing code**. The existing code does: reserve `-1` → (success keeps `-1`, i.e. student loses 1) or refund `+1` on failure.

### Ledger model (code-derived)

| Table / function | Purpose |
|---|---|
| `public.ai_credit_ledger` | balance movement; no stored `balance` column |
| `public.coin_wallets` | exists (shop), but balance is computed via `ai_credit_ledger SUM(delta)` |
| `public.reserve_ai_credit(...)` | `delta = -p_amount`, reason `ai_reserve`; idempotent on `(user_id, reason, ref_id)` |
| `public.refund_ai_credit(...)` | `delta = +1`, reason `ai_refund`; idempotent on `(user_id, reason, ref_id)` |
| `public.ai_credit_balance(p_user_id)` | `SUM(delta)` for user (security definer) |

> **Critical:** `refund_ai_credit` refunds a **constant +1**, not the reserved `p_amount`. Partial release (e.g. release 6 of a 10 reservation) is therefore **not supported** — the model is strictly 1:1. Releasing unused reservation of a larger hold is impossible without a new settled-amount mechanism.

---

## 2. Section-by-section findings

### 2.1 Reservation & settlement semantics

**Reserve** (`db/credit-pricing-reserve.sql`):
- Line 127: `INSERT ... ai_credit_ledger (user_id, delta, reason, ref_id) VALUES (p_user_id, -p_amount, 'ai_reserve', p_ref_id, ...)`.
- Idempotent on `(user_id, reason='ai_reserve', ref_id)` (lines 52–57); returns `already_existed := true` on repeat, **no second debit**.
- Accepts `p_amount` (default 1), `p_kind`, optional `p_model`/`p_agent` (Phase BC).

**Settlement** (`lib/ai/unified-ai-billing.ts`):
- `settleUnifiedAiUsage(...)` (line 101) computes a summary (`credits`, `customerCost`, `providerCost`, `finalStatus`) and **returns it**; the only DB-adjacent step is `recordUsageEvent` (line 283) which is a **stub** (`void supabase`).
- No ledger write, no `reserve_ai_credit` debit/release for the actual charge, no release of the unused reservation.
- `refund_ai_credit` (db/economy-phase-f.sql) is called **only on failure** (route lines ~851–865), not on confirmed settlement.

**Balance transition for the spec example** (100 credits, reserve 10, charge 4 → expect 96):

| Step | Expected by spec | Actual code behavior |
|---|---|---|
| Reserve 10 | -10 held | `-10` (delta -10, reason `ai_reserve`) |
| Charge actual 4 | final 96 | **no charge** (settlement is shadow; nothing debits 4) |
| Release unused 6 | back to 96→100 | **impossible** (+1 refund only, no 6 release) |
| Observed outcome | final 96 | final 90 (one -10 reservation held; refund unavailable unless failure) |

### 2.2 Cross-request idempotency

- `serverRequestId()` in both `lib/ai/ai-credit-guard.ts` (line 33–40) and the route (line 84–93) uses `crypto.randomUUID()` **per HTTP request**.
- The route builds `refId = \`ai_req:${serverRequestId()}\`` (route line 577) **per request**, so a double-click/retry produces a **new operation + a new reservation** (two ledger rows), not a single idempotent one.
- The client-provided `Idempotency-Key` header is only used by `resolveUsageRequestContext` (lib/ai/usage-context.ts line 139–159) to name the **shadow** usage row and `recordAiUsage`, **not** to gate the `reserve_ai_credit` reservation.
- `reserve_ai_credit`'s own idempotency (on `ref_id`) is therefore **never exercised across requests** because each request makes a new `ref_id`.

**Result:** cross-request duplicate requests → **two reservations → two debits**. The spec's requirement "Prevent duplicate reservations and charges" is **not met** at the route level.

### 2.3 Provider attempt failure handling

- The route refunds `refund_ai_credit` (idempotent +1) on failed provider (route ~line 851–865). This is correct for the failure case: failed attempts do **not** charge the student.
- However, `settleUnifiedAiUsage` (`buildCostEstimate`, line 204–253) has a **logic bug** at line 206:
  ```ts
  const successful = attempts.find(a =>
    a.attemptStatus !== "initial" || a.attemptStatus !== "fallback" || ...
  );
  ```
  The `||` chain is always true (every attempt is one of the four statuses), so `find` returns the **first** attempt instead of a "successful" one. This makes the "successful attempt" detection unreliable and the cost estimate misleading.
- The route has **no fallback-consolidation** (it does not release the unused reservation when a fallback succeeds; the reserve remains held).

### 2.4 Route-level tests

Vitest baseline run in the phase-1 worktree:

```
Test Files  7 failed | 139 passed (146)
Tests       39 failed | 1893 passed | 14 skipped (1946)
```

The **Phase 3.2d route billing lifecycle** file (`app/api/unified-ai/__tests__/billing-lifecycle.test.ts`) has **11 failed tests** of 17. Root causes of the batch of `expected 502 to be 200` failures:

1. The route does **not** call `ai_credit_balance` (the balance-verification RPC the tests expect) — that step is missing from the route.
2. `settleUnifiedAiUsage` with an empty `attempts` array returns `pending_reconcile` (unknown cost); the route then falls through without the balance check the test expects.
3. Test-environment issue: when the provider key is unconfigured, the **real** `unifiedAI` (not the mock) returns `ok:false` → route returns 502.

### 2.5 Supabase test database verification

**Blocked.** No isolated Supabase test database and no safe credentials are available in this environment; production credentials/data must never be used. No live RPC/Database integration test exists (all tests use mocks). The exact integration test setup is detailed in §9.

### 2.6 Pending reconciliation

- `unified-ai-billing.ts` defines `SettlementStatus.pending_reconcile` and the route keeps the reservation when `finalStatus === "pending_reconcile"` (route line 882–884). This is correct in intent: unknown cost → hold, no release.
- **Gaps:** there is no expiry/reconciliation policy, no background job to re-run unknown-rate attempts, and no visibility report for locked reservations. The reservation is held **forever** until an operator intervenes.

### 2.7 Financial safety

Verified invariants that **hold**:

- One reservation per `ref_id` (unique index + idempotency on `reserve_ai_credit`).
- No duplicate ledger entry for the same `(user, reason, ref_id)`.
- Failed attempts → refund (idempotent release) so no double charge on failure.

Invariants **not met**:

- Actual consumption-based charge (spec §7) — not implemented (shadow-only settlement).
- Correct release of *unused* reservation / partial release — not implemented (refund is constant +1).
- No negative wallet balance — reserve checks `v_balance < p_amount` before debiting (line 109), so reserve never takes below 1 for authenticated users; but there is no combined "reserve then charge then release" atomicity in the route.
- One final customer charge per operation — only 1:1 reserve/refund exists; no distinct "final charge" entry.
- Stable settlement identity — `getSettlementKey(operationId)` is stable (returns `operationId` only), which is fine; however the route still creates a new `ref_id` per request.

---

## 3. Verified defects (file:line)

| # | Defect | File | Line(s) | Impact |
|---|---|---|---|---|
| D1 | `buildCostEstimate` `find()` uses `||` → returns first attempt as "successful" | `lib/ai/unified-ai-billing.ts` | 206 | Cost estimate unreliable on fallback |
| D2 | `recordUsageEvent` is a placeholder stub → shadow recording not integrated with `recordAiUsage` | `lib/ai/unified-ai-billing.ts` | 283–305 | No real usage shadow on settlement |
| D3 | Route generates `refId` per HTTP request → cross-request duplicate = **two reservations** | `app/api/unified-ai/route.ts` | 84–93, 577 | No cross-request idempotency |
| D4 | Client `Idempotency-Key` not used to gate `reserve_ai_credit` | `lib/ai/usage-context.ts` (context used only for shadow) | 139–159 | Reservation not cross-request protected |
| D5 | `refund_ai_credit` refunds constant `+1`, not reserved `p_amount` | `db/economy-phase-f.sql` | 165–166 | No partial release (release 6 of 10 impossible) |
| D6 | Reservation is flat debit (`-p_amount`), no two-phase hold+final-charge+release | `db/credit-pricing-reserve.sql` | 126–131 | Not a hold+settle model |
| D7 | Route lacks `ai_credit_balance` balance-check step expected by lifecycle tests | `app/api/unified-ai/route.ts` | — | Lifecycle tests fail (502s) |
| D8 | Main branch(`feat/inbox-phase0-security-fixes`) route lacks `settleUnifiedAiUsage` call & `unified-ai-billing` import | `app/api/unified-ai/route.ts` (main) | — | Settlement engine not wired in main branch |

---

## 4. Test counts (mocked vitest baseline)

| Layer | Passed | Failed | Notes |
|---|---|---|---|
| Unit (isolated) | 1,893 | 39 | includes billing-lifecycle(11) + c5 usage(6) + lecture-store + RLS + idempotency |
| Route-level (billing-lifecycle) | 6 | 11 | 502s, missing `ai_credit_balance`, settlement engine behavior |
| Database integration (live RPC) | **0** | **0** | Blocked: no isolated Supabase DB/credentials (see §9) |

> Numbers are from the phase-1 worktree (`npx vitest run --reporter=dot` and `--reporter=verbose` runs).

---

## 5. Remaining blockers

1. **No isolated Supabase test database / credentials** → live RPC & DB-consistency tests cannot run (spec §5). Requirement: a disposable test project + `sb_test` URL + service-role key, with read-only seeded seed data.
2. **Settlement not wired** in the main branch (`feat/inbox-phase0-security-fixes` route does not import/call `settleUnifiedAiUsage`).
3. **Settlement engine bugs** (D1, D2) must be fixed before the engine can be trusted.
4. **No partial-release / two-phase hold model** in the DB (D5, D6) → the spec's reserve-10/charge-4/release-6 example is not achievable.

---

## 6. Exact integration-test setup required (for the DB verification phase)

Provide (none of these may be production):

1. **Disposal test workspace** on Supabase: `sb_test` anon URL + separate service-role key. Never touch the production project.
2. **Seed only**: one `auth.users` row + `coin_wallets` row + a few `ai_credit_ledger` rows (e.g., starting balance 100) + a row in `credit_grants` so the user has 100.
3. **Migration (dry-run only)**: apply `db/economy-phase-d.sql` + `db/credit-pricing-reserve.sql` + `db/economy-phase-f.sql` to the **test** DB only.
4. **Tests to write** (live, against this test DB):
   - Reserve → balance `90` (`-10`).
   - Confirm settlement: charge actual cost → new delta `-4` (final balance 86) **and** release unused `-6` (balance 92). *This is the new two-phase behavior — requires a new settled-amount RPC, not yet present.*
   - Failure → `refund_ai_credit` → balance returns to 90 (only +1, not +10).
   - Concurrent reservations on same `ref_id` → exactly 1 debit.
   - Duplicate `operationId`/client idempotency key → exactly 1 reservation.
5. **Assert** wallet sum + ledger row set after each scenario; assert no negative balance; assert no duplicate ledger rows.

---

## 7. Files changed / Git status (phase-1 worktree)

Untracked/new files in `feat/phase1-ai-credits-repair`:
- `lib/ai/unified-ai-billing.ts` (new; the shadow settlement engine)
- `app/api/unified-ai/__tests__/billing-lifecycle.test.ts` (new Phase 3.2d route tests)
- `lib/ai/__tests__/phase3-2-unified-ai-billing.test.ts` (new unit tests)
- `lib/ai/pricing-config.ts` (new Phase 3 pricing engine)
- `lib/ai/__tests__/phase3-pricing.test.ts`, `ai-credits-phase1-validation.test.ts`
- `app/api/unified-ai/fix_route.js` (scratch)
- `app/api/unified-ai/__tests__/` directory

Modified in phase-1 worktree: `app/api/unified-ai/route.ts`, `lib/ai/ai-credit-guard.ts`, `lib/unified-ai/unified-ai.ts`, `vitest.config.ts`.

Main repo (`feat/inbox-phase0-security-fixes`) status: `M lib/ai/ai-credit-guard.ts`, `M lib/unified-ai/unified-ai.ts` (and unrelated support-* files). Does **not** contain `lib/ai/unified-ai-billing.ts`.

---

## 8. Recommendation (for review — no code changes made in this pass)

1. **Answer proven:** the student is currently charged the reservation value (1:1), NOT actual consumption. Prove the ledger transitions above from the DB before any commercial step (per user's decision, do not touch Credit Wallet/payment gateway yet).
2. **Safe, targeted fixes (proposed, pending approval):**
   - Fix `buildCostEstimate` condition (D1) and wire `recordUsageEvent` to `recordAiUsage` (D2).
   - Wire a balance-check (`ai_credit_balance`) after settlement in the route (D7).
   - Do **not** merge the settlement engine into the main branch until `unified-ai-billing.ts` is fixed and DB-level tests pass.
3. **Next phase:** implement the two-phase hold+final-charge+partial-release model (D5/D6) and the shadow→ledger integration, then the DB integration suite described in §6.

---
*Report generated from real code inspection + tool output. No production data or credentials were used.*
