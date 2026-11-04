# Billing System — Final Audit

**Date:** 2026-11-04 · **Mode:** read-only (SELECT + grep only) · **DB:** production (`DATABASE_URL`)
**Scope:** subscription, plans, credits, entitlements, quotas, admin panel, UI.

> This document is the deliverable of the audit. No code, schema, or data was modified.

---

## 1. Code Usage Matrix

### 1.1 Credits

| RPC / Table | Called from | File:Line | Purpose |
|---|---|---|---|
| `reserve_ai_credit` | AI credit guard | `lib/ai/ai-credit-guard.ts:250` (primary), `:195` (anon), `:262`/`:271` (fallbacks) | Reserve credits before AI call |
| `reserve_ai_credit` | unified-ai (duplicate impl) | `app/api/unified-ai/route.ts:396,407,415,440,448` | Same, re-implemented outside the guard |
| `refund_ai_credit` | guard | `lib/ai/ai-credit-guard.ts:321` | Refund on failure |
| `refund_ai_credit` | unified-ai | `app/api/unified-ai/route.ts:549,556,574,580,586,592,608,668` | 8 refund sites |
| `ai_credit_ledger` (read) | rate-limit engine | `lib/ai/rate-limit.ts:165,243,318,377` | Sliding-window counts |
| `ai_credit_ledger` (read) | admin/usage | `app/api/ai/usage/route.ts`, `app/api/me/plan-quota/route.ts:13`, `lib/admin/*.ts`, `app/admin/**` (10+ files) | Balance + consumption dashboards |
| `ai_credit_balance` | **nobody** | — | **Dead RPC** (0 callers) |
| `consume_ai_credits` | **nobody** | — | **Dead RPC** |
| `confirm_ai_credit` | **nobody** | — | **Dead RPC** |
| `grant_ai_credits` | admin route | `app/api/admin/add-credits/route.ts:39` | Manual credit grant |

### 1.2 Plans & subscriptions

| RPC / Table | Called from | File:Line | Purpose |
|---|---|---|---|
| `has_entitlement` | guard + rate-limit + service-registry + **9 routes** | `lib/ai/ai-credit-guard.ts:152`, `lib/ai/rate-limit.ts:86,92`, `lib/ai/service-registry.ts:110`, `app/api/{chat,ai,agents/generate,ai/plan,ai/diagram,ai/file/analysis,ai/file/generate,lesson-quiz}/route.ts`, `app/pricing/page.tsx:82`, `app/plans/page.tsx:49` | **The real plan gate** |
| `subscription_plans` (read) | UI + admin + API | `app/plans/page.tsx:57`, `app/pricing/page.tsx:94`, `app/checkout/[plan]/page.tsx:18`, `app/api/usage/route.ts:33`, `app/api/me/plan-quota/route.ts:38`, `app/admin/plans/page.tsx:14`, `app/admin/actions/plans-manage.ts`, `plan-manage.ts:48`, `plan-version.ts:100`, `lib/admin/user-consumption.ts:171` | Plan catalog |
| `subscription_plans` (write) | admin only | `app/admin/actions/plans-manage.ts:73,113,137,158,174` (+ `app/plans/actions.ts` for platform invoices) | CRUD / toggle / popular |
| `subscription_activations` | admin + analytics | `subscription-activate.ts:183`, `subscription-manage.ts:50,176,282,325`, `lib/admin/overview.ts:55`, `lib/admin/user-consumption.ts:112` | Manual activation/revoke/extend |
| `entitlements` (write) | activation flows | `subscription-activate.ts:214-216`, `subscription-manage.ts:186-187`, `rewards-issue.ts:186-188` | Grant plan entitlement with expiry |
| `entitlements` (read) | admin + API | `quota-check.ts:130`, `app/api/usage/route.ts:21`, `app/api/upload/route.ts:52`, `app/api/cron/downgrade-expired/route.ts:20`, `admin/users/analytics/page.tsx:75`, `users-search.ts:95,130,177` | Plan status / expiry |
| `user_subscriptions` | **nobody** | — | **Dead table** (0 rows, 0 writers) |
| `daily_usage` | **nobody** | — | **Dead table** (0 rows, 0 readers/writers) |
| `check_and_increment_usage` | **nobody** | — | **Dead RPC — and broken** (see §5.1) |
| `payments` | admin CRUD | `app/admin/actions/payments.ts:7,30,37` | Manual payment ledger |

### 1.3 Quotas

| RPC | Called from | File:Line |
|---|---|---|
| `consume_subscription_quota` | chat, ai, upload, generate-plan, generate-slides | `lib/ai/quota-check.ts:102` |
| `consume_service_quota` / `peek` / `refund` | images/diagrams/files | `lib/ai/service-registry.ts:209,259,280` |
| `consume_subscription_quotas` (plural, daily+monthly) | **nobody** | — (dead) |
| `get_user_subscription_snapshot` | **nobody** | — (dead) |

---

## 2. Admin Panel Status

**58 files** under `app/admin/` (25 pages + 23 server actions + components). This is the most mature part of the billing stack.

### Working
| Area | Evidence |
|---|---|
| Plans CRUD | `app/admin/plans/page.tsx` + `PlansCrudPanel.tsx` + `plans-manage.ts` (create/update/delete/toggle/popular) |
| Subscriptions | `app/admin/subscriptions/page.tsx:38` (`requireAdminPermission("subscriptions.manage")`), activate/revoke/extend in `subscription-manage.ts` (writes `subscription_activations` + `entitlements.expires_at` + `audit_log`) |
| Manual payments | `app/admin/payments/page.tsx` + `PaymentsManager` + `payments.ts` (insert/update/delete) |
| Manual credit top-up | `app/admin/users/page.tsx:245` → `/api/admin/add-credits` → `grant_ai_credits` (audited) |
| RBAC | `lib/auth-roles.ts:163-174` — `plans.manage` **owner-only**, `subscriptions.manage` owner/admin, `users.ban`, `admins.manage` owner-only; all actions check server-side |
| Audit trail | `audit_log` written by plans/subscriptions/rewards/credits actions |
| Monitoring | `ai-costs`, `ai-overview`, `ai-usage`, `analytics`, `audit-log`, `ai-telemetry`, `runtime-errors` |

### Missing / broken
- **No credit-expiry management UI** (nothing to inspect or expire grants).
- **No subscription/credit reconciliation view** (activations vs entitlements mismatch is invisible — see §5.3).
- **Broken column selections:** `lib/admin/user-consumption.ts:171` and `app/admin/actions/subscription-manage.ts:62` select `messages_per_day, uploads_per_day` — **these columns do not exist** (live: `messages_daily`, `uploads_daily`) ⇒ those panels show N/A or fail.
- **Permission misuse:** `app/admin/ai-costs/page.tsx:6`, `announcements/page.tsx:6`, `tickets/[id]/page.tsx:6`, `announcements`, `tickets-manage.ts:34,51`, `notifications-manage.ts:23` all gate on **`plans.manage`** as a proxy for "owner". `credits.manage` exists in `auth-roles.ts:140` but is **never used**.
- `app/admin/ai-costs/page.tsx` is read-only text telling you to edit `lib/ai/credit-pricing.ts`.

---

## 3. Data Reality (live, 2026-11-04)

| Item | Value |
|---|---|
| `subscription_activations` | **7 rows**, 7 not revoked, plans used = `free, pro, ultra` |
| `entitlements` | **4 rows**, 0 permanent, **2 active**, kinds = `{plan}`, values = `{premium, pro, ultra}` |
| `users with active activation` | **3** |
| `users with active plan entitlement` | **2** ← mismatch (1 paid user loses gating) |
| `user_subscriptions` | **0 rows** (columns exist: user_id, plan_id, status, provider, current_period_end…) |
| `daily_usage` | **0 rows** (`min/max usage_date` = null) |
| `payments` | **1 row** |
| `subscription_plans` | **4 rows** (`free, pro, ultra, Desc50`); 23 columns; prices 0 / 9.99 / 19.99 / 100 |
| `ai_credit_ledger` | `ai_reserve` 611 (−611) · `ai_refund` 61 (+61) · `admin_grant` 5 (+410) → **net −140** |
| Credit balances | **22 users with any ledger row: 0 positive, 1 zero, 21 negative**; worst **−38** |
| `ai_usage_events` (30d) | chat 389 / 52 users · exam_review 17 / 1 · demo 12 · study_plan 6 · quiz 3 · tutor 1 |
| Migration ledger | **16 rows** (2026-10-19 → 2026-10-31); the 114 `db/*.sql` files are **not** tracked here |

**Reading of the data:** the credit economy has never been funded at scale (5 manual grants, +410) while 611 reservations were made — hence *every* user is at or below zero. Negative balances are not an edge case; **they are the normal state**.

---

## 4. Missing Pieces

1. **Credit expiry / grant lifecycle** — no `expires_at` on ledger rows, no `credit_grants`, no `expire_old_grants`.
2. **Monthly grant engine** — grants are 100% manual (`admin_grant` × 5).
3. **Plan → credits mapping** — plans define messages/uploads, not credits.
4. **Subscription lifecycle writer** — `user_subscriptions` exists but nothing writes it; lifecycle lives in `subscription_activations` + `entitlements`.
5. **Single source of truth for "current plan"** — three candidates: `entitlements(kind='plan')`, `subscription_activations(revoked_at IS NULL)`, `user_subscriptions`.
6. **Unified balance read** — `ai_credit_balance` is unused; 6+ places sum `ai_credit_ledger` by hand.
7. **Expired-plan reconciliation** — `app/api/cron/downgrade-expired` exists, but no verification that it ran (mismatch in §3 suggests gaps).
8. **Credit purchase UI** — `/store` is a placeholder ("قيد الإعداد").
9. **Low-balance UX / alerts** — none found.

---

## 5. Conflicts

### 5.1 `check_and_increment_usage` — broken (4 concrete causes)
Definition (`pg_get_functiondef`, verified live):
1. **`where id = v_plan_id`** on `subscription_plans` — the table has **no `id` column** (PK is `plan_key`) ⇒ `42703` on first call. Occurs twice (message and quiz branches, and the `'free'` fallback).
2. **`daily_message_limit` / `daily_quiz_limit`** — neither column exists (live: `messages_daily`, `messages_monthly`; **no quiz limit column at all**).
3. **`user_subscriptions` has 0 rows and 0 writers** in the codebase ⇒ the plan is *always* `'free'`; the paid branch is unreachable by construction.
4. **`daily_usage` has 0 rows and no reader/writer** anywhere ⇒ even if the function worked, nothing integrates its counters (no route, no UI, no admin view). The `quiz` counter has no consumer.

**Net:** this RPC/table pair is *orphaned and broken*. Nobody calls it, so it has never failed in production — it is dead weight, not a live bug.

### 5.2 Four parallel counter systems
| System | Storage | Live? |
|---|---|---|
| AI credits (window limits 10/3h text, 6/5h vision) | `ai_credit_ledger` | ✅ active (611 rows) |
| Subscription messages/uploads per plan | `subscription_quotas` + `subscription_plans` | ✅ active |
| Per-service quotas (image/diagram/pdf/docx/…) | `service_usage_daily` + `*_service_quota` RPCs | ✅ active |
| Daily usage (`messages_count`/`quizzes_count`) | `daily_usage` | ❌ dead |

Different features are metered by *different* systems, with no shared idempotency or audit.

### 5.3 Activation ≠ Entitlement
`subscription_activations`: 3 users active · `entitlements(plan, active)`: **2 users**.
⇒ at least one user has a paid activation but **no active plan entitlement**, i.e. paid but restricted. Root cause: activation writes two records in separate statements (`subscription-activate.ts:214-216`) with no transaction; a partial failure leaves the pair inconsistent.

### 5.4 Broken plan-column reads
`messages_per_day` / `uploads_per_day` referenced in `user-consumption.ts:171` and `subscription-manage.ts:62` — nonexistent columns. Their error paths hide it (`catch` → empty/N/A), so the admin sees blank data rather than a failure.

### 5.5 Negative balances are structural
`reserve_ai_credit` allows a reservation when `balance < 1` as long as the 3-hour window has room (`free_overdraft` in metadata). With 22/22 users at ≤0, a "no overdraft" rule would block **all** credit-consuming users until grants exist.

### 5.6 Two AI telemetry tables, one empty
`ai_usage_events` (421 rows, actively written) vs `ai_operations` (**0 rows** — RLS has SELECT policy only, writes via session client are denied). Admin dashboards that fall back to `ai_operations` are reading a permanently empty table.

### 5.7 Credits lock an unrelated table
`reserve_ai_credit` / `refund_ai_credit` do `insert into coin_wallets … for update` — AI credits serialize on the **shop coins** wallet row.

---

## 6. Decision Points

| # | Decision | Why it blocks work |
|---|---|---|
| D1 | **Source of truth for "current plan"**: `entitlements`, `subscription_activations`, or revive `user_subscriptions`? | Every quota check depends on it; today two of the three disagree |
| D2 | **Delete or revive** `check_and_increment_usage` + `daily_usage` + `user_subscriptions`? | Reviving needs 4 fixes + callers; deleting removes a misleading surface |
| D3 | **Negative balances**: forgive (zero out), grandfather, or auto-consume future grants? | 21 users blocked under any strict policy |
| D4 | **Expiry model**: monthly reset, 90-day TTL, or no expiry? Grants vs purchases? | Determines schema (`expires_at`, `credit_grants`, `expire_old_grants`) |
| D5 | **Consolidate the 4 metering systems** into one guard, or keep them separate and document boundaries? | 15+ routes touch this; a big-bang rewrite is the main schedule risk |
| D6 | **Permissions**: keep `plans.manage` as owner-proxy, or introduce/use `credits.manage`? | 6 files currently mis-gate on `plans.manage` |
| D7 | **Scale target for load tests**: current usage is 389 chat events / 52 users / 30 days — is a 1000-user load test justified now? | Avoid optimizing for traffic that doesn't exist |

---

## STOP

No files were modified other than creating this document. No DDL/DML was executed. No commit.
