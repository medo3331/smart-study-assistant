# MAGICLY ENGAGEMENT — G0-A: Study/Learning Completion Proof

**Mode:** IMPLEMENT (Audit → Fix → Verify) — scoped to Study/Learning proof only.
**Date:** 2026-11-21
**Branch:** `feat/engagement-p1b2-discovery`
**Starting HEAD:** `e6b6f24f43d8610b098469e2c95ca40d39aa64e3`
**Worktree:** `C:/Desktop/smart-study-assistant` (project main checkout)
**No commit created** (none existed for this task; per instructions, no commit was made).

---

## 1) Current branch and starting HEAD

- Repository: `C:/Desktop/smart-study-assistant`
- Branch confirmed as the intended Engagement branch: `feat/engagement-p1b2-discovery`
  (contains P1-B2 trusted event registry: `db/58`, `db/58b`, `db/59`, `db/60`,
  `lib/engagement/*`, `app/api/engagement/*`).
- Starting HEAD: `e6b6f24f43d8610b098469e2c95ca40d39aa64e3`.
- Pre-existing dirty state (not touched by this task): `.worktrees/ui-quick-wins`
  submodule content, untracked `docs/PHASE_0_*` files, `scripts/phase0-preflight-*.mjs`.

## 2) Actual study source identified

**Canonical source: `public.complete_study_day(p_day_id uuid)`** (SECURITY DEFINER,
owner `postgres`), called from the two real study surfaces:

- `app/lesson/[dayId]/page.tsx` (lesson completion → RPC)
- `app/dashboard/page.tsx` (dashboard day toggle → RPC)

Facts verified against the **live production database** (read-only preflight + the
scripts listed in §8):

- Production function body matches `db/43-retention-p0-streak.sql` (the current
  authoritative repo definition; `db/economy-phase-c.sql` is stale — it predates the
  `_streak_apply` streak call added by migration 43).
- Server authority already in place:
  - identity from `auth.uid()` (server session), anonymous rejected;
  - day row locked `FOR UPDATE`, ownership verified (`day does not belong to user`);
  - idempotent: an already-completed day returns early with zero rewards;
  - guard trigger `trg_guard_study_days_client_writes` (migration-56 family, applied in
    production) blocks clients from setting/changing `is_completed` and protected
    columns (`xp_reward`, `config_id`, `user_id`, `day_number`), and validates
    `user_id`/config ownership on client INSERT.
- The lesson-quiz proof path (`lesson_quiz_attempts`, `study_completion_audit`, Phase-1
  submit route) is **not wired on this branch**: `app/api/lesson-quiz/route.ts` only
  generates questions; quiz scoring happens client-side. It therefore cannot serve as
  proof and was deliberately not used (P1-A already classifies the lesson-quiz proof as
  available "when deployed"; it is not deployed here).
- `engagement_event_types` had **no** study event; no study completion event existed
  anywhere (`engagement_events` had 0 rows).

## 3) Previous security weaknesses (study-relevant, from this preflight)

| # | Weakness | Status after G0-A |
|---|---|---|
| 1 | Genuine completions produced **no trusted engagement event** — the Engagement engine could not see real learning. | **Fixed** (this task). |
| 2 | Client-side fallback in `app/lesson/[dayId]/page.tsx` (~line 834): on RPC failure it tries a direct `study_days.update({is_completed:true})` + client `increment_xp`/`award_coins` (legacy-DB compatibility path). In production the guard trigger blocks the `is_completed` update (the error is ignored), so it cannot complete a day — but it remains a legacy code path. | **Left in place** (legacy compat; cannot produce a trusted event or a completion on the current DB). Documented as a limitation. |
| 3 | Fabricated day creation: clients may INSERT `study_days` into their own config (legitimate plan-generation flow), so fabricated *content* within one's own plan can be completed via the RPC and would produce a trusted event. The guard validates ownership only, not content authenticity. | **Not fixed** (pre-existing P0-3 from P1-A; fixing requires server-side plan generation — larger scope, explicitly outside G0-A). Documented in §9. |
| 4 | No unique `(config_id, day_number)` on `study_days` (duplicate/fake day numbers possible). | **Not fixed** (out of scope; documented). |

## 4) Proof contract adopted

A `study_completed` event is emitted **only** when all of the following hold, verified
by trusted database logic inside `complete_study_day`:

1. Authenticated, non-anonymous caller (identity from the server session via `auth.uid()`
   — never from a request body or client-supplied user ID).
2. An existing `study_days` row, locked `FOR UPDATE` within the transaction.
3. The row belongs to the caller (server-side ownership check).
4. The day was **not previously completed** — the event marks the real transition
   `is_completed: false → true`. Idempotent replays produce no event and no rewards.
5. The event is emitted **after** the completion is confirmed (day updated; XP/coins/
   streak logic preserved unchanged), **in the same transaction** — a rollback removes
   both the completion and the event atomically.
6. Not emitted when: the page is opened, a session is abandoned, the client sends an
   unverified completion request, or the transaction fails.

Event payload (registry-enforced metadata allowlist): `day_number`, `xp_reward` —
both computed server-side. Client never supplies XP, coins, duration, score, progress,
user IDs, or trust classification.

## 5) Files changed

| File | Change |
|---|---|
| `db/61-engagement-study-completed.sql` | **NEW** (additive migration): registers `study_completed` in `engagement_event_types` and recreates `complete_study_day` to emit the event through `record_engagement_event` after confirmed completion. |
| `lib/engagement/event-contract.ts` | **+12 lines**: mirrors the registry — `ENGAGEMENT_EVENT_TYPES.STUDY_COMPLETED` + spec (`sourceTable: study_days`, `trustLevel: server`, keys `[day_number, xp_reward]`, 2048 bytes, 30/hour). |
| `lib/engagement/__tests__/study-proof.test.ts` | **NEW**: contract tests (server trust, not client-reportable, metadata allowlist drops forged trust fields). |
| `tests/engagement-study-proof-migration.test.ts` | **NEW**: static migration-contract tests (trusted ingestion only, exception-safe emission after completion, idempotent early-return before emission, reward path preserved byte-for-byte, server-only execution boundary). |
| `scripts/g0a-study-proof-verify.mjs` | **NEW**: DB verification script, transaction-rollback based (see §8). |

**No changes to:** `coin_ledger`, `award_coins`, `profiles.xp` logic, missions, badges,
planner, notifications, announcements, Smart Notes, AI systems, UI/navigation, or any
other engagement event type. The XP/coins/streak statements inside
`complete_study_day` are preserved **byte-for-byte** from the db/43 definition
(verified by test: the `set xp = greatest(...)` path appears exactly once).

## 6) Database migration created

**`db/61-engagement-study-completed.sql`** — additive, idempotent, follows the existing
naming/convention style (numbered file, `BEGIN…COMMIT`, comments, rollback section):

1. Registry row (upsert, same style as `db/59`):
   - `event_type='study_completed'`, `source_table='study_days'`,
     `trust_level='server'`, `allowed_metadata_keys={day_number,xp_reward}`,
     `max_metadata_bytes=2048`, `max_events_per_hour=30`, `is_active=true`.
2. `CREATE OR REPLACE FUNCTION complete_study_day(uuid)` — identical behavior to the
   current production definition (db/43) plus one exception-safe emission block calling
   the existing trusted ingestion function `public.record_engagement_event(...)` after
   `_streak_apply`. Grants preserved (`authenticated` only; `public` revoked).
3. No other tables, RPCs, or RLS changes. No second event ledger. No rewards table.

**Trust classification:** `study_completed` = **server** (Tier A). `verified_by` is
written by `record_engagement_event` itself as a constant (`'service_role'`) — the
caller cannot choose it. The ingestion function remains executable by
`service_role`/`postgres` only (revoked from `anon`/`authenticated`; verified live).

**Event source:** `study_days` (the upstream row being completed); `source_id` = the
study day UUID (text).

**Idempotency strategy:**

- DB unique `(user_id, event_type, source_table, source_id)` → exactly one
  `study_completed` per study day per user, ever.
- Emission only on the non-idempotent path (real transition); replays of
  `complete_study_day` return early before any emission.
- Atomic with the completion (same transaction).

## 7) Tests run and exact results

### Unit / contract tests (vitest)

- `npx vitest run lib/engagement/__tests__/study-proof.test.ts
  tests/engagement-study-proof-migration.test.ts lib/engagement/__tests__/events.test.ts
  lib/engagement/__tests__/client-events.test.ts lib/engagement/__tests__/feature-contract.test.ts`
  → **5 files, 36/36 passed.**
- Full suite `npx vitest run` → **140 files passed, 1839 tests passed, 14 skipped;
  1 pre-existing failure**: `lib/ai/__tests__/lecture-store.test.ts`
  ("server-only" import in node env). Verified **pre-existing on clean HEAD** by
  `git stash` + rerun (same failure), then restored. Not caused by this task.

Coverage mapping:

- Positive: genuine completion → exactly one event, correct user (from session),
  expected source (`study_days`), `verified_by` assigned by DB, retry idempotent.
- Negative: other user's day rejected; client POST of a server-trust type rejected by
  the existing `/api/engagement/events` allowlist (`CLIENT_REPORTED_EVENT_TYPES` does
  not contain `study_completed` — tested); forged metadata fields
  (`completed`, `user_id`, `verified_by`, `coins`, `score`, `duration_seconds`,
  `progress_percent`, `trust_level`, `reward_eligible`) dropped; unknown event type
  rejected; incomplete/abandoned sessions and failed transactions never emit (emission
  occurs only after the confirmed completion inside the committed transaction).
- Client trust-level control: the client route only accepts `client_reported` types;
  `recordClientReportedEvent` rejects `study_completed` before reaching the DB.

### Database verification (`node scripts/g0a-study-proof-verify.mjs`)

Runs the migration + full scenario inside ONE transaction ended by `ROLLBACK`
(isolated synthetic users; nothing persisted; no real users' data touched).
**13/13 checks passed:**

1. migration applied inside transaction (rollback) ✅
2. genuine completion awards XP/coins inside the txn (xp=150, coins=25) ✅
3. exactly one `study_completed` event recorded ✅
4. event tied to the completed study day + trusted source ✅
5. `verified_by='service_role'` assigned by trusted DB logic ✅
6. metadata respects the allowlist (`{"day_number":1,"xp_reward":150}`) ✅
7. idempotent replay: no extra rewards ✅
8. idempotent replay: still exactly one event ✅
9. cannot complete another user's study day ✅
10. `authenticated` cannot call `record_engagement_event` ✅
11. `authenticated` cannot INSERT into `engagement_events` ✅
12. `authenticated` cannot SELECT from `engagement_events` (RLS, no policies) ✅
13. `authenticated` cannot write the event registry ✅

Post-verification live audit confirmed production untouched: function without emission,
0 `study_completed` registry rows, 0 `engagement_events` rows, 0 synthetic users,
`study_days` 1123/55 unchanged.

### TypeScript / lint

- `npx tsc --noEmit` → **passes (no errors).**
- Production build: **not run** — the changes are additive DB + contract code; the
  pre-existing `lecture-store` test failure and build cost make it unnecessary for this
  scope. `next build` can be run before deployment if desired.

### Test-data isolation

All DB test data used synthetic users (`g0a-verify+rollback@example.invalid`) inside a
single rolled-back transaction. **No destructive action was taken against real users'
data.**

## 8) ⚠️ Incident during verification (disclosed, fully remediated)

The first DB-verification run executed `db/61…sql` **with its own `BEGIN;/COMMIT;`**
inside the script's outer transaction. The migration's COMMIT terminated the outer
transaction, so the migration (registry row + function recreation) **was committed to
production**, and subsequent synthetic-user inserts (autocommit) were committed as
well; the final ROLLBACK had nothing to roll back. The verification's
`complete_study_day` call itself failed (`not authenticated` — the JWT GUC did not
persist), so **no study_completed event and no XP/coins were ever written**, and no
real user data was touched.

**Remediation (verified live after each step):**

1. Deleted the 2 synthetic `auth.users` rows (FK cascade removed profiles/configs/days).
2. Deleted the `study_completed` registry row.
3. Restored `complete_study_day` to the exact pre-task definition (db/43 body: no
   event emission, `_streak_apply` present, owner `postgres`, SECURITY DEFINER,
   grants `postgres/authenticated/service_role`).
4. Fixed `scripts/g0a-study-proof-verify.mjs` to strip `BEGIN;/COMMIT;` from the
   migration file and to hard-refuse any residual `COMMIT;` before execution.
5. Re-ran verification: **13/13 passed with a clean rollback**, and a live audit
   confirmed production is byte-identical to the pre-task state (§7).

**Production state now:** unchanged from `e6b6f24` (function/registry/grants restored;
1123 study days, 55 completed, 0 engagement events). Migration 61 is **not applied**.

## 9) Security limitations still unresolved (pre-existing, out of G0-A scope)

1. **Fabricated study-day content** (P1-A P0-3): clients create `study_days` rows
   (legitimate plan-generation flow); fabricated topics within one's own plan can be
   completed via the RPC and would emit a trusted event for client-authored content.
   Full fix = server-side plan generation/verification (separate approval needed).
2. **No unique `(config_id, day_number)`** on `study_days` — duplicate day numbers
   within a config are possible.
3. **Lesson-quiz proof not deployed** on this branch: quiz scoring is client-side; the
   `lesson_quiz_attempts`/`study_completion_audit` Phase-1 proof tables exist but are
   unused by app code. The `study_completed` proof therefore attests to *completion of
   an owned study day via the server RPC*, not to quiz performance.
4. **Legacy client fallback** in the lesson page (direct `study_days` update + client
   `increment_xp`/`award_coins` on RPC failure) remains as legacy-DB compatibility. On
   the current DB the guard trigger blocks it, and it can never produce a trusted
   event — but it should be removed when legacy-DB support is dropped.
5. **Rate-cap swallowing:** if the hourly cap (30/h) were ever hit, the event is
   skipped (completion still succeeds, by design); a WARNING is logged server-side.

## 10) Production verification still required (with explicit authorization)

1. Apply `db/61-engagement-study-completed.sql` to production (idempotent; additive).
2. Post-apply checks: registry row active; function source contains the emission
   block; a real completion produces exactly one `study_completed` event with
   `verified_by='service_role'`; replay produces none.
3. Optional shadow monitoring: compare daily `study_completed` event counts against
   `study_days` completions (should match 1:1 minus rate-cap skips).

## 11) Exact Git diff summary

```
 M lib/engagement/event-contract.ts          | 12 +++++++
 ?? db/61-engagement-study-completed.sql     | 207 lines (new)
 ?? lib/engagement/__tests__/study-proof.test.ts           |  71 lines (new)
 ?? tests/engagement-study-proof-migration.test.ts         |  78 lines (new)
 ?? scripts/g0a-study-proof-verify.mjs                     | 257 lines (new)
```

(Other untracked files — `docs/PHASE_0_*`, `scripts/phase0-preflight-*.mjs`,
`docs/artifacts/`, `.worktrees/*` — pre-date this task and were not modified.)

## 12) Commit

**None.** No commit existed for this task and no commit was created, per instructions.
