# MAGICLY ENGAGEMENT — G0-C: Badges / Achievements Proof

**Mode:** IMPLEMENT (Audit → Fix → Verify) — scoped to badge/achievement proof only.
**Date:** 2026-11-21
**Branch:** `feat/engagement-p1b2-discovery`
**Starting HEAD:** `e6b6f24f43d8610b098469e2c95ca40d39aa64e3` (no commits created across G0-A/B/C)
**Worktree:** `C:/Desktop/smart-study-assistant`
**No commit created. No production changes. No migration applied.**

---

## 1) Sources identified (live production, read-only audit)

Production function definitions captured verbatim into
`docs/artifacts/g0c-production-badge-functions.sql` (authoritative pre-G0-C reference).

| # | System | Server path | Verification today | Decision |
|---|---|---|---|---|
| 1 | **Badge** (chapter/boss) | `grant_badge(uuid,int,text,text,int)` — SECURITY DEFINER; called from `components/BossFight.tsx` | identity from `auth.uid()`, config ownership, chapter bounds (`days_count/5` + 1), proof-of-study (≥1 completed day), idempotent `(user, config, chapter)`; `p_title/p_subject/p_accuracy` are client-supplied *cosmetics*, not reward inputs | ✅ **ADOPTED** → `badge_earned` |
| 2 | **Achievement** | `sync_achievements()` — SECURITY DEFINER; called from `app/dashboard/achievements/page.tsx` | all metrics computed from DB (completed days, streak, level, badge count, finished tracks); writes `user_achievements` itself; reward via `_award_coins_variable` with unique ref (idempotent per lifetime) | ✅ **ADOPTED** → `achievement_unlocked` |

## 2) Previous security weaknesses (directly affecting badge/achievement proof)

### P0 — fixed in this phase (G0-C scope)

1. **Client INSERT policy on `badges` is live in production** (`badges: owner writes`).
   Any authenticated user can insert a forged badge row directly. Consequences:
   - the `badge` coin rule (40 Coins, cap 3/day, `is_live=true`) pays based on the
     badge row existing;
   - `sync_achievements` counts badges → a forged badge unlocks `first-boss`
     (120 Coins + 150 XP) and inflates the `badges` metric for any achievement;
   - `components/BossFight.tsx` has a legacy direct-insert fallback that relies on
     this policy ("fallback to legacy insert" on RPC failure).
   **Fix applied in `db/63`:** both client INSERT policies dropped; writes happen only
   via the `grant_badge` definer; owner SELECT preserved. No data changes. The legacy
   fallback in BossFight is left untouched (it fails on migrated DBs, and the primary
   RPC path always succeeds after this migration defines `grant_badge`).

### Pre-existing, out of G0-C scope (documented, not used as proof)

2. `p_title/p_subject/p_accuracy` are client-cosmetics inside an otherwise
   server-verified badge (they do not feed rewards; noted for transparency).
3. Boss XP is still client-awarded via `increment_xp` (P1-A XP debt, D-4).
4. `grant_badge`/`sync_achievements` remain executable by `anon` at the function level
   (both raise on missing auth; least-privilege revokes for `anon` are a separate
   hardening pass).

## 3) Proof contract adopted

**`badge_earned`** — emitted only when all of the following hold:
- Authenticated, non-anonymous caller (identity from `auth.uid()`).
- Owned track (`study_configs.id + user_id = auth.uid()`).
- Chapter within bounds of the real track length (`ceil(days_count/5) + 1`).
- Proof-of-study: at least one completed `study_days` row in the track.
- A NEW badge row was inserted (the replay path returns `already_existed=true`
  *before* the emission point).
- Source: `badges`; `source_id` = badge UUID ⇒ one event per badge, ever.
- Metadata allowlist: `chapter_number`, `accuracy`, `subject` (server-recorded facts).

**`achievement_unlocked`** — emitted only when:
- All metrics are computed server-side from the database (never the client).
- The achievement unlocks for the FIRST time (`insert … on conflict (user_id,
  achievement_id) do nothing` + `if found`) — replays emit nothing.
- Source: `user_achievements`; `source_id` = the stable achievement id text
  (e.g. `first-boss`) ⇒ one event per achievement per user, ever.
- Metadata allowlist: `metric` (catalog kind), `progress` (computed value snapshot).

Both: `trust_level='server'`, `verified_by` written by `record_engagement_event`
itself (`'service_role'`, constant — caller cannot choose it), emitted in the **same
transaction** as the badge insert / achievement unlock (rollback removes both),
exception-safe (event failure never blocks the badge/achievement or its reward).

## 4) Files changed

| File | Change |
|---|---|
| `db/63-engagement-badges-achievements-proof.sql` | **NEW** (additive migration): 2 registry rows + drops client INSERT policies on `badges` + recreates `grant_badge` and `sync_achievements` from the verbatim production bodies + exception-safe emission. |
| `lib/engagement/event-contract.ts` | Mirrors `BADGE_EARNED` and `ACHIEVEMENT_UNLOCKED` (auto-join `SERVER_VERIFIED_EVENT_TYPES`; client route keeps rejecting them). |
| `lib/engagement/__tests__/badges-achievements-proof.test.ts` | **NEW**: 5 contract tests (server trust, forged fields dropped, only server-recorded facts in metadata, conservative caps). |
| `tests/engagement-badges-achievements-proof-migration.test.ts` | **NEW**: 9 static migration-contract tests (policy drop, per-function emission ordering, first-unlock-only via `if found`, exception-safe, reward logic preserved byte-for-byte, server-only boundaries). |
| `scripts/g0c-badges-achievements-verify.mjs` | **NEW**: rollback-transaction DB verification with a **fail-closed production guard**. |
| `docs/artifacts/g0c-production-badge-functions.sql` | **NEW** (audit artifact): verbatim production definitions. |

**No changes to:** coins/XP logic, `award_coins`, `_award_coins_variable`, `coin_ledger`,
`achievements_catalog`, BossFight UI, achievements page UI, or any other event type.

## 5) Database migration created

**`db/63-engagement-badges-achievements-proof.sql`** — additive, idempotent, same
conventions as db/59–62:

1. Registry rows (upsert): `badge_earned` (10/h), `achievement_unlocked` (5/h), both
   `trust_level='server'`, 2048-byte metadata, `is_active=true`.
2. **Proof-source fix:** `DROP POLICY IF EXISTS "badges: owner writes"` and
   `"users manage their own badges"` on `public.badges` (RLS stays enabled; owner
   SELECT policy untouched; no data modified).
3. `grant_badge` recreation: verbatim production body + emission after
   `insert … returning id`, before the final return.
4. `sync_achievements` recreation: verbatim production body + emission inside the
   `if found` first-unlock block (before the reward statements).
5. Grants reinstalled exactly as before (`authenticated` only; `public` revoked).

**Idempotency strategy:** DB unique `(user_id, event_type, source_table, source_id)`;
`source_id` = badge UUID / achievement id; emission only on the new-badge /
first-unlock paths (replays return before emission).

## 6) Tests run and exact results

### Unit / contract (vitest)

- `npx vitest run lib/engagement/__tests__/badges-achievements-proof.test.ts
  tests/engagement-badges-achievements-proof-migration.test.ts` → **2 files, 14/14 passed.**
- Full suite `npx vitest run` → **1866 passed, 14 skipped; 1 failed —
  `lib/ai/__tests__/lecture-store.test.ts`**, the same **pre-existing** failure verified
  on clean HEAD during G0-A. Not caused by this task.

Coverage mapping:

- **Positive:** genuine badge (owned track + completed day) → exactly one event with
  correct source/`verified_by`/metadata; first `first-boss` unlock → exactly one
  `achievement_unlocked` event with `metric='badges', progress=1` (contracted in
  migration tests + DB script cases 4, 8).
- **Negative:** chapter beyond track bounds rejected with no event; user without a
  completed day rejected with no event; forged direct `badges` INSERT denied after the
  policy drop; client-forged metadata fields (`user_id`, `verified_by`, `trust_level`,
  `coins`, `reward_eligible`, `completed`, `title`, `target`, `requirement`) dropped;
  client POST of both types rejected by the `/api/engagement/events` allowlist.
- **Idempotency:** badge replay (`already_existed`) and sync replay emit nothing
  (early-return / `on conflict do nothing` before emission; unique constraint backstop).
- **Other user:** `p_config_id` of another user raises `config not found for user`;
  identity is structural (`auth.uid()`).

### Database verification

**Not run — intentionally** (per the post-incident operating rules):

- ❌ No migration testing against production. The script is **proven fail-closed**:
  running with the production `DATABASE_URL` exits with code 2
  (`مرفوض: هذا السكريبت لا يعمل على الإنتاج (lgaqgkihhmedtdzcgpnc)`).
- No local Postgres or staging DB available in this environment.

**Required before adopting G0-C as deployed:** run
`G0C_DATABASE_URL=<local/staging> node scripts/g0c-badges-achievements-verify.mjs`
(15 checks: bounds rejection, genuine badge + event, replay, no-proof rejection, direct
INSERT denial, first-boss unlock + event, sync replay, trust-path denials).

### TypeScript

- `npx tsc --noEmit` → **passes (no errors).**

### Production safety

- All G0-C preflight was read-only (`SELECT`, `pg_policies`, `pg_get_functiondef`).
- **Zero production writes in G0-C.** No migration applied.

## 7) Security limitations still unresolved (pre-existing, out of G0-C scope)

1. Badge `title/subject/accuracy` are client-supplied cosmetics (not reward inputs).
2. Boss XP via client `increment_xp` (P1-A XP debt, D-4 — separate phase).
3. `grant_badge`/`sync_achievements` remain `anon`-executable at the function level
   (both fail-closed on missing auth; least-privilege revokes deferred).
4. The BossFight legacy direct-insert fallback remains in client code for legacy-DB
   compatibility; on migrated DBs it always fails safely (policy removed) and is dead
   code because `grant_badge` is defined by the same migration.

## 8) Production verification still required (with explicit authorization)

1. Local/staging run of `scripts/g0c-badges-achievements-verify.mjs`.
2. With explicit authorization: apply `db/63…sql` to production, then read-only
   post-apply checks (policies = SELECT-only for owner; functions contain emission
   blocks; a real boss win → one `badge_earned`; sync → `achievement_unlocked` for
   genuinely unlocked achievements only; forged INSERT denied).

## 9) Coordination note

A peer agent (id `90856de0`) announced work in the same checkout on account/report/
settings pages. Scope confirmed non-overlapping with all G0-A/B/C files; a boundary
message was sent (reply queued) asking to coordinate before touching `lib/engagement`,
`db/*.sql`, or engagement tests, and to avoid destructive git operations that could
affect the untracked G0 artifacts.

## 10) Exact Git diff summary

```
 M lib/engagement/event-contract.ts        (cumulative G0-A/B/C: 5 new types + 5 specs)
 ?? db/63-engagement-badges-achievements-proof.sql   (new, ~370 lines)
 ?? lib/engagement/__tests__/badges-achievements-proof.test.ts         (new, 77 lines)
 ?? tests/engagement-badges-achievements-proof-migration.test.ts       (new, ~150 lines)
 ?? scripts/g0c-badges-achievements-verify.mjs                         (new, ~250 lines)
 ?? docs/artifacts/g0c-production-badge-functions.sql                  (new audit artifact)
```

(Plus the uncommitted G0-A/B artifacts from the previous phases in the same worktree.)

## 11) Commit

**None.** No commit was created, per instructions. Nothing applied to production.
