# MAGICLY ENGAGEMENT — G0-B: Games Proof

**Mode:** IMPLEMENT (Audit → Fix → Verify) — scoped to game outcome proof only.
**Date:** 2026-11-21
**Branch:** `feat/engagement-p1b2-discovery`
**Starting HEAD:** `e6b6f24f43d8610b098469e2c95ca40d39aa64e3` (same as G0-A; no commits created)
**Worktree:** `C:/Desktop/smart-study-assistant`
**No commit created. No production changes. No migration applied.**

---

## 1) Game inventory (actual production games only)

Verified from app code (`app/break/page.tsx`, `app/escape-room/page.tsx`,
`components/CommunityQuiz.tsx`, `components/DailyMicroChallenge.tsx`) and the live
production DB (read-only preflight). Production function sources were captured verbatim
into `docs/artifacts/g0b-production-game-functions.sql` — this is the authoritative
pre-G0-B reference (the live bodies differ from the older `db/break-zone.sql`,
`db/gamification.sql`, and even `db/43-retention-p0-streak.sql` files: they use
`public.cairo_day()` and route rewards through `award_coins`).

| # | Game | Client flow | Server verification | Production usage | Decision |
|---|---|---|---|---|---|
| 1 | **Break Riddle** (فزورة البريك) | answer via RPC `answer_break_riddle` | SECURITY DEFINER compares the answer server-side; `solved_at` transition; 3 attempts/day | 199 sessions, 8 solved | ✅ **ADOPTED** → `break_riddle_solved` |
| 2 | **Quiz Rush** | answer via RPC `answer_break_quiz` | SECURITY DEFINER compares answer against the *next study step topic* (server-derived); 3 attempts/day | 15 sessions, 0 solved | ✅ **ADOPTED** → `break_quiz_solved` |
| 3 | **Escape Room** | steps answered via RPC `solve_escape_step` | SECURITY DEFINER validates 3 steps; reward gated on studied-today | 6 sessions, 0 solved | ✅ **ADOPTED** → `escape_room_solved` (final solve only) |
| 4 | Break games **memory / reaction** | client game → `claim_break_game(game)` | claim row is server-recorded, but the play/outcome is computed client-side; no score verified | 4 claims | ❌ **NOT adopted** — no real outcome proof (per G0-B matrix: stays outside the reward-proof system) |
| 5 | Break game claim `'quiz'` | same claim RPC | gated on Quiz Rush solve | — | ❌ **NOT adopted** — duplicate signal of `break_quiz_solved`; avoids double counting |
| 6 | **Community Quiz** | `submit_quiz_result(subject, score, total)` | none — score is client-supplied (Tier C) | 0 rows | ❌ **NOT adopted** |

Event naming follows the existing registry conventions (snake_case, source-oriented);
`game_completed`/`game_won`/`puzzle_completed` were rejected in favor of three precise
types matching each server-validated outcome, since a single generic `game_completed`
would over-claim the memory/reaction games that have no server-verified outcome.

## 2) Previous security weaknesses (game-relevant, from this preflight)

1. **Genuine game outcomes produced no trusted engagement events** — the Engagement
   engine could not see real riddle/quiz/escape completions. **Fixed** (this task).
2. **memory/reaction games have no server-verified outcome** — the claim can be
   invoked without playing; its reward is gated on study + 2/day cap (pre-existing,
   accepted by design as "claim" not "win"). Left untouched; **not** used as proof.
3. **Community Quiz accepts client scores** (P1-A Tier C) — untouched; **not** used
   as proof.

## 3) Proof contract adopted

A game event is emitted **only** when all of the following hold, verified by trusted
database logic inside the SECURITY DEFINER game functions:

1. Authenticated, non-anonymous caller (identity from `auth.uid()` — never request data).
2. The answer is compared **server-side** against server-held truth (riddle answer row /
   next-step topic / escape puzzle answer). The client never submits a score, a "won"
   flag, or any reward amount.
3. The solve is the real state transition `solved_at: null → now()` within daily attempt
   limits (riddle 3, quiz 3, escape 6 attempts over 3 steps).
4. Escape: emitted at the **final** solve (step=4) only — intermediate steps emit nothing.
5. Same transaction as the solve: rollback removes both. Failed answers, abandoned
   sessions, and replays of already-solved sessions emit nothing.
6. One event per (user, event type, Cairo day): `source_id` = the Cairo day string,
   matching each session table's PK `(user_id, day)`.

Event payload (registry allowlist): `attempts_used` (+ `riddle_id` for the riddle — the
riddle's public id, never the answer). Trust classification: **server** (Tier A).
`verified_by` written by `record_engagement_event` itself (`'service_role'`, constant).

## 4) Files changed

| File | Change |
|---|---|
| `db/62-engagement-games-proof.sql` | **NEW** (additive migration): 3 registry rows + recreates `answer_break_riddle`, `answer_break_quiz`, `solve_escape_step` from the **exact live production bodies** + exception-safe event emission. |
| `lib/engagement/event-contract.ts` | Mirrors the 3 types (`BREAK_RIDDLE_SOLVED`, `BREAK_QUIZ_SOLVED`, `ESCAPE_ROOM_SOLVED`) with specs; auto-joins `SERVER_VERIFIED_EVENT_TYPES` (client route keeps rejecting them). |
| `lib/engagement/__tests__/games-proof.test.ts` | **NEW**: contract tests (server trust, not client-reportable, rate caps ≤5/h, forged outcome fields dropped, answer never leaks into metadata). |
| `tests/engagement-games-proof-migration.test.ts` | **NEW**: static migration contract (per-function section assertions: emission after the solve transition, escape final-solve only, idempotent early-return before emission, exception-safe, production reward paths preserved byte-for-byte, `claim_break_game`/`submit_quiz_result` untouched, server-only grants). |
| `scripts/g0b-games-proof-verify.mjs` | **NEW**: rollback-transaction DB verification with a **fail-closed production guard** (refuses the production project ref; Supabase cloud hosts require explicit `G0B_ALLOW_SUPABASE=1`). |
| `docs/artifacts/g0b-production-game-functions.sql` | **NEW** (audit artifact): verbatim capture of the live production function definitions used as the migration base. |

**No changes to:** coins, XP, `award_coins`, `coin_ledger`, `claim_break_game`,
`submit_quiz_result`, missions, badges, notifications, or any other event type.

## 5) Database migration created

**`db/62-engagement-games-proof.sql`** — additive, idempotent, same conventions as
db/59–61:

1. Registry rows (upsert): `break_riddle_solved` (source `break_riddle_sessions`),
   `break_quiz_solved` (source `break_quiz_sessions`), `escape_room_solved` (source
   `escape_sessions`) — all `trust_level='server'`, metadata allowlists
   (`attempts_used`[, `riddle_id`]), 2048 bytes, rate cap **5/hour** (these are
   once-per-Cairo-day events), `is_active=true`.
2. Function recreations based on the verbatim production bodies, each with one
   exception-safe emission block after the confirmed solve. Rewards preserved
   byte-for-byte (`award_coins('break_riddle_fast'|'break_riddle'|'escape_room')`,
   XP updates, studied-today gates).
3. Grants re-installed exactly as before (`authenticated` only; `public` revoked).
4. No new tables, no second ledger, no schema changes to game tables.

**Idempotency strategy:** DB unique `(user_id, event_type, source_table, source_id)`
with `source_id = Cairo day` + emission only on the real solve transition (replays
return before the emission point) ⇒ exactly one event per solve-type per day.

## 6) Tests run and exact results

### Unit / contract (vitest)

- `npx vitest run lib/engagement/__tests__/games-proof.test.ts
  tests/engagement-games-proof-migration.test.ts` → **2 files, 13/13 passed.**
- Full suite `npx vitest run` → **1852 passed, 14 skipped; 1 failed —
  `lib/ai/__tests__/lecture-store.test.ts`**, the same **pre-existing** failure
  verified on clean HEAD during G0-A (server-only import in node env). Not caused by
  this task.

Coverage mapping:

- **Positive:** correct riddle/quiz/escape answers (server-validated) produce exactly
  one event each (contracted in migration tests + DB script cases 4–7).
- **Negative:** wrong answers produce no events (DB script cases 3, 6); intermediate
  escape steps produce no events; client-forged fields (`won`, `score`, `coins`,
  `user_id`, `verified_by`, `trust_level`) dropped; client POST of game event types
  rejected by the `/api/engagement/events` allowlist; `claim_break_game` and
  `submit_quiz_result` untouched by the migration.
- **Idempotency:** replays after solving return before emission (early-return before
  emission asserted per function); unique constraint as backstop.
- **Other user:** each session row is created per-user by definer functions keyed on
  `auth.uid()`; ownership is structural (`(user_id, day)` PK) — no cross-user path.

### Database verification

**Not run — intentionally.** Per the new operating rules after the G0-A incident:

- ❌ No migration testing against production.
- The verification script is written and **proven fail-closed**: running it with the
  production `DATABASE_URL` exits with code 2 and the message
  `مرفوض: هذا السكريبت لا يعمل على الإنتاج (lgaqgkihhmedtdzcgpnc)`.
- No local Postgres or staging DB is currently available in this environment
  (checked: no Docker containers, no local `postgres` binary).

**Required before adopting G0-B as deployed:** run
`G0B_DATABASE_URL=<local/staging> node scripts/g0b-games-proof-verify.mjs`
(≈14 checks: riddle wrong/correct/replay, quiz wrong/correct, escape intermediate/final/
replay, trust-path denials for `authenticated`).

### TypeScript

- `npx tsc --noEmit` → **passes (no errors).**

### Test-data isolation / production safety

- **No production writes were performed in G0-B.** All preflight was read-only
  (`SELECT`/`pg_get_functiondef`).
- The verification script is rollback-based and production-refusing by design.

## 7) Security limitations still unresolved (pre-existing, out of G0-B scope)

1. **memory/reaction break games**: outcome is client-side; the claim remains gated by
   study + 2/day but is not game-outcome proof. If they ever need to count as proof,
   the games need server-side state (separate design).
2. **Community Quiz client scores** (Tier C): untouched; not usable as proof until a
   server-issued question set exists.
3. **Break game claim `'quiz'`** could be claimed once Quiz Rush is solved — the
   claim itself is a claim, not an outcome; excluded from events to avoid double
   counting with `break_quiz_solved`.
4. **Escape Room step 1** without a study config falls back to the fixed static puzzle
   (`'المعرفة'`) from `escape_puzzles` — server-validated but static (answer is public
   in the repo). Real usage requires a config for personalized gates; acceptable for
   engagement proof, noted for transparency.

## 8) Production verification still required (with explicit authorization)

1. Provide/point a **local or staging** Postgres and run
   `scripts/g0b-games-proof-verify.mjs` (production is hard-refused).
2. Then, with explicit authorization: apply `db/62-engagement-games-proof.sql` to
   production, followed by read-only post-apply checks (registry rows active; functions
   contain the emission blocks; one real solve → one event; replay → none).

## 9) Exact Git diff summary

```
 M lib/engagement/event-contract.ts        (+33 lines across G0-A + G0-B: 3 new types + 3 specs)
 ?? db/62-engagement-games-proof.sql       (new, ~250 lines)
 ?? lib/engagement/__tests__/games-proof.test.ts          (new, 66 lines)
 ?? tests/engagement-games-proof-migration.test.ts        (new, ~145 lines)
 ?? scripts/g0b-games-proof-verify.mjs                    (new, ~230 lines)
 ?? docs/artifacts/g0b-production-game-functions.sql      (new audit artifact)
```

(G0-A artifacts from the previous phase remain uncommitted in the same worktree:
`db/61…`, `lib/engagement/__tests__/study-proof.test.ts`,
`tests/engagement-study-proof-migration.test.ts`, `scripts/g0a-study-proof-verify.mjs`,
`MAGICLY_ENGAGEMENT_G0A_STUDY_PROOF_REPORT.md`.)

## 10) Commit

**None.** No commit was created, per instructions. Nothing applied to production.
