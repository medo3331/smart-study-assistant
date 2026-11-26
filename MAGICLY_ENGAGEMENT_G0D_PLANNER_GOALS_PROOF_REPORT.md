# MAGICLY ENGAGEMENT — G0-D: Planner / Goals Proof

**Mode:** IMPLEMENT (Audit → Fix → Verify) — scoped to planner goal proof only.
**Date:** 2026-11-21
**Branch:** `feat/engagement-p1b2-discovery`
**Starting HEAD:** `e6b6f24f43d8610b098469e2c95ca40d39aa64e3` (no commits across G0-A…D)
**Worktree:** `C:/Desktop/smart-study-assistant`
**Verdict: NO trusted event adopted — documented blocker. No migration. Planner UX untouched.**

---

## 1) The real planner completion source (live audit)

**Canonical flow (the only one):**

1. **Creation:** `insertGoal` (`lib/pages-data.ts`) → client INSERT into `planner_goals`
   (RLS `planner: owner writes`). Called from `app/dashboard/planner/page.tsx`.
2. **Completion:** `setGoalDone` (`lib/pages-data.ts`) → client UPDATE
   `is_done` **and** `done_at = new Date().toISOString()` (client-supplied timestamp)
   via RLS `planner: owner updates`. Called from the planner toggle
   (`handleToggle`, `app/dashboard/planner/page.tsx` ~line 296).
3. **Reward (existing, untouched):** on mark-done the client calls
   `awardCoins(supabase, "goal_done", goal.id)`.
4. Ruled out: `app/api/{baccalaureate,preparatory,primary,secondary,university}/goal`
   are AI **recommendation** routes, not completion proof systems.

**Live production state (read-only):** `planner_goals` policies = owner
INSERT/SELECT/UPDATE/DELETE, **no guard triggers**, no definer completion function;
2 goals, both done — written client-side; registry contains no planner/goal events.

## 2) The four questions from the G0-D brief — answered

| Question | Answer (evidence) |
|---|---|
| Goal creation = proof? | **No** — client INSERT of an arbitrary title/due-date/priority. Agreed by decision. |
| Server-side completion verification? | **None exists.** There is no endpoint, RPC, or definer that verifies "this goal was actually achieved". The only completion fact is `is_done`, written by the client. |
| Can the user forge state/timestamp/progress? | **Yes, entirely** — owner ALL policies let the client set `is_done=true` and any `done_at` timestamp directly. |
| Trusted `goal_completed` event possible? | **Not with a truthful trust label.** See §3. |

### Additional integrity finding (pre-existing, reward-adjacent)

`award_coins('goal_done')` "validation" is **circular**: it checks that a
`planner_goals` row with `is_done=true` exists — the exact state the client just
wrote. The same `goal_done` ledger rows feed `break_studied_today` (unlocks game
rewards) and `perfect_week` — i.e., a fabricated goal completion cascades into game
and weekly rewards (P1-A P0-2, still open). **Untouched here:** that is reward logic,
explicitly out of G0-D scope.

## 3) Why NO trusted event was adopted

The decision framework (adopted per your instruction): *"أي Goal لا يوجد له إثبات حقيقي
يظل متاحًا للطالب في الـPlanner، لكنه لا يدخل ضمن إثباتات المهمات أو المكافآت."*

Options considered and rejected:

1. **Trigger-based `goal_completed` with `trust_level='server'`** — rejected: the
   trigger would fire on a client-written `is_done=true`. That brands a fully
   client-forgeable state as server-verified proof, directly violating the trust
   model (P1-A Tier C must never become reward proof) and the G0 requirement
   ("never record completion when the client sends an unverified completion request").
2. **Trigger-based event with `trust_level='client_reported'`** (discovery-only,
   like `notes_saved`) — rejected for this phase: planner is already a production
   feature (not a discovery target), the signal is trivially spoofable, and P1-A
   explicitly prescribes planner receiving only `introduced` events until server
   proof exists. Adding a spoofable noise event buys nothing.
3. **Building a server-side completion endpoint** — rejected for scope: it changes
   the planner UX/product behavior and requires redesigning the circular
   `goal_done` reward validation. That is a product decision + implementation phase
   of its own, not a G0-D vertical slice. The planner stays fully functional and
   untouched.

**Result:** planner goals remain available to students exactly as before, and remain
**outside** the engagement proof system until a server-verifiable completion source
exists.

## 4) Implementation delivered: the boundary guard

`tests/engagement-planner-proof-boundary.test.ts` (**5/5 passed**) — a standing
contract that prevents accidental future adoption:

- the registry mirror contains **no** event sourced from `planner_goals`;
- no `goal*` event type exists in `ENGAGEMENT_EVENT_TYPES`, and
  `goal_completed` is not in `SERVER_VERIFIED_EVENT_TYPES`;
- migrations db/61–63 emit nothing derived from `planner_goals` and contain no
  `'goal_completed'`;
- the P1-B2 registry seed (db/59) contains no planner event;
- the exact adoption requirements are documented in the test (see §5).

No application or DB code was changed. No Coins/XP/reward logic touched. Planner
UX/functionality untouched.

## 5) What adopting goal proof would require (decision required — not executed)

1. **A server-side completion source** (endpoint or definer RPC) that independently
   verifies what "achieving this goal" means (e.g., linked study-day completion,
   server-defined criteria per goal type) and owns the `done_at` timestamp.
2. **Fix the circular validation:** `award_coins('goal_done')` must stop validating
   against `g.is_done` (client-writable) and validate against the server completion
   record instead — reward-logic change, needs its own economy approval.
3. Then: register the event (`trust_level='server'`, source table, allowlist),
   mirror it in `event-contract.ts`, add forgery tests (fake state, fake timestamp,
   other user), and only then integrate with `engagement_events`.

Until (1) + (2) are approved and implemented, the boundary tests in §4 keep the
planner out of the proof system by construction.

## 6) Tests run and exact results

- `npx vitest run tests/engagement-planner-proof-boundary.test.ts` → **5/5 passed.**
- Full suite (cumulative G0-A…D state) → **1866 + 5 = expected 1871 passing** in the
  full run of this phase's files; the single pre-existing failure
  (`lib/ai/__tests__/lecture-store.test.ts`, verified on clean HEAD during G0-A)
  remains the only failure and is unrelated.
- `npx tsc --noEmit` → passes (no app/lib code changed in G0-D).
- **No DB verification needed** — nothing was written to any database in G0-D
  (preflight was read-only).

## 7) Exact Git diff summary

```
 ?? tests/engagement-planner-proof-boundary.test.ts    (new, ~95 lines — the only G0-D artifact)
 ?? MAGICLY_ENGAGEMENT_G0D_PLANNER_GOALS_PROOF_REPORT.md (this report)
```

No modifications to existing files in G0-D.

## 8) Commit

**None.** Per instructions. Nothing applied to production; planner behavior unchanged.
