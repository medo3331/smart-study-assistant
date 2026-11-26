# MAGICLY ENGAGEMENT — G0-F: Push / Notifications Ownership Boundary

**Mode:** IMPLEMENT (Audit → Fix → Verify) — scoped to notifications/push ownership boundaries only.
**Date:** 2026-11-21
**Branch:** `feat/engagement-p1b2-discovery`
**Starting HEAD:** `e6b6f24f43d8610b098469e2c95ca40d39aa64e3` (no commits across G0-A…F)
**Worktree:** `C:/Desktop/smart-study-assistant`
**No commit created. No production changes. No migration applied. Coins/XP/goal_done untouched. No Push campaigns launched. No notification redesign.**

---

## 1) Source audit (live production, read-only)

### notifications (143 rows — the modern schema is the one actually used)

| Aspect | Finding | Verdict |
|---|---|---|
| Actual schema in use | All 143 rows have `recipient_id` set (modern); 142 also carry legacy `user_id` (backfilled), 1 has `user_id IS NULL`. Types present: `feature` (89), `system` (52), `support_status`, `support_reply`. | Dual-schema confirmed; modern is canonical. |
| Modern policies | `notifications self read/update` on `recipient_id = auth.uid()` | ✅ |
| **Legacy policies** | `notifications: own read/update/delete` on `user_id IS NULL OR user_id = auth.uid()` ⇒ **any user could read/update/delete any row with `user_id IS NULL`** — i.e., modern-schema rows written without the legacy column (1 live support row exposed today, and every future modern write re-opens the hole). | ❌ **Ownership hole — fixed.** |
| Data consistency (verified before any change) | **0 rows** with `user_id ≠ recipient_id`; **0** legacy-only rows. ⇒ replacing the legacy policies with `recipient_id` ownership preserves every legitimate access with zero data change. | Safe basis for the fix. |
| Write paths | `app/api/notifications` (GET/PATCH only — no POST; all ops session-scoped `eq("recipient_id", user.id)` via service client); support actions (session identity + ownership check + service client); admin fan-out via G0-E's guarded broadcast. **No client INSERT policy exists** (server-only writes — correct). | ✅ |
| Insert gating | The announcements fan-out inserts only `recipient_id = the authenticated caller` — a user cannot fabricate notifications for others. | ✅ |

### push_subscriptions (0 rows — the feature is currently broken, not just unsecured)

| Aspect | Finding | Verdict |
|---|---|---|
| RLS | Enabled with **no policies** ⇒ the existing `/api/push/subscribe` route (upsert via authenticated client) **always fails** — this is exactly why production has 0 rows. The flow is broken, not merely unsecured. | ❌ **Fixed.** |
| Route identity | `user_id` comes from the server session (`requireUser`), never the body (a previous exploit — subscription hijacking — is already fixed in the route). Upsert is idempotent on the unique `user_id` index ⇒ registration abuse surface is bounded to 1 row/user (no additional rate cap needed in this scope — documented). | ✅ |
| Unique index | `push_subscriptions_user_id_key` exists ⇒ upsert prerequisite satisfied. | ✅ |

### Push sending / Cron / Streak reminders

| Aspect | Finding | Verdict |
|---|---|---|
| Sending | `web-push` exists **only** in `app/api/cron/streak-reminder` (server-side). No client path can send push to anyone. | ✅ |
| Cron authorization | `isAuthorizedCronRequest` — `CRON_SECRET` fail-closed (empty secret ⇒ always deny) with timing-safe comparison; `vercel.json` schedules `streak-reminder` daily 17:00 UTC + `daily-maintenance`. | ✅ |
| Streak reminder realness | The cron is real: scans profiles (service client), builds the at-risk payload, sends via web-push, removes stale subscriptions, logs `cron_runs` with counts (historically `notified=0` because `push_subscriptions` was empty — the fixed subscription flow is what makes it functional). | ✅ (unblocked by this fix) |
| Admin messaging | G0-E already secured the broadcast path; no new send system added here. | ✅ |
| Notification ownership | Enforced by the fixed policies + session-scoped routes: a user cannot read, modify, delete, or create notifications for another user. | ✅ (after fix) |

## 2) Fix implemented: `db/65-notifications-push-rls.sql` (policies only — zero data/schema change)

1. **notifications — real ownership:** replaced the three legacy
   `user_id IS NULL OR user_id = auth.uid()` policies with `recipient_id = auth.uid()`
   equivalents (same commands: SELECT/UPDATE/DELETE). Verified pre-migration that all
   legacy-ownered rows have `user_id = recipient_id`, so **no legitimate access
   changes**; the NULL-user_id exposure hole is closed permanently. The modern
   `notifications self read/update` policies stay as-is. No INSERT policy (server-only
   writes preserved). Dual-schema data untouched — no redesign, no merge, no deletion.
2. **push_subscriptions — restore the broken flow with strict ownership:** added
   own-row policies (SELECT/INSERT/UPDATE/DELETE on `user_id = auth.uid()`). The
   existing session-derived subscribe/unsubscribe route now works; a user can register
   and manage **only their own** subscription; the cron's service-client reads are
   unaffected.

**Explicitly untouched:** `notifications` schema/columns, `push_subscriptions`
schema, cron code, admin broadcast, all app code, Coins/XP/`goal_done`.

## 3) Tests run and exact results

### Unit / contract (vitest)

- `npx vitest run tests/engagement-notifications-push-migration.test.ts` → **9/9 passed.**
  Migration contract: all three legacy policies replaced (comment-stripped SQL —
  no `user_id IS NULL` in any USING/WITH CHECK clause); all four push policies strict
  own-row; policies-only (no ALTER/DROP TABLE/DELETE/INSERT/UPDATE statements);
  no other systems referenced; standard single BEGIN/COMMIT wrapper.
  App-path boundary: notifications API has **no POST** (no general send path) and is
  session-scoped (`recipient_id = user.id` everywhere); push subscribe identity from
  the session only (no body user_id); unsubscribe session-derived; no web-push
  sending from any client path; subscribe idempotent (`onConflict: "user_id"`).
- Full suite `npx vitest run` → **1887 passed, 14 skipped; 1 failed —
  `lib/ai/__tests__/lecture-store.test.ts`**, the same pre-existing failure verified
  on clean HEAD during G0-A.

### TypeScript

- `npx tsc --noEmit` → **clean.** (The G0-E-reported peer error has since been
  resolved by the peer completing their dashboard/nav work — re-verified in this phase.)

### Database verification

**Not run — intentionally** (post-incident rules). The verification script is written
and **proven fail-closed**: running with the production `DATABASE_URL` exits with
code 2 (`مرفوض: هذا السكريبت لا يعمل على الإنتاج (lgaqgkihhmedtdzcgpnc)`).

**Required before adopting G0-F as deployed:** run
`G0F_DATABASE_URL=<local/staging> node scripts/g0f-notifications-push-verify.mjs`
(13 checks: cross-user notification read/update/delete denied even for NULL-user_id
rows; spoofed INSERT denied; owner read/update preserved; subscription registration
restored and owner-scoped; cross-user subscription spoof/delete denied; unsubscribe
preserved; service/cron reads unaffected).

## 4) Security limitations still open (documented, out of scope)

1. **No notification dedupe key, preferences, or queue** (P1-A §7) — announcements
   fan-out still de-dupes by title (race-prone); deferred to the notifications
   normalization project, deliberately **not** redesigned here.
2. **Legacy columns retained** (`user_id`/`message`/`is_read`) — dual schema kept per
   the no-merge rule; writers that omit `user_id` are now safely scoped by the
   recipient-based policies.
3. **Stale subscription cleanup** relies on the cron's runtime behavior (web-push
   410 handling); no DB-side TTL.
4. **goal_done circular trust** (P1-A P0-2) — untouched, per instruction; separate
   economy-remediation track.
5. Admin broadcast email path (Resend) has no per-recipient rate cap — operational
   note, not an ownership boundary.

## 5) Production verification still required (with explicit authorization)

1. Local/staging run of `scripts/g0f-notifications-push-verify.mjs`.
2. With explicit authorization: apply `db/65…sql` to production, then read-only
   post-apply checks (`pg_policies` show recipient-based ownership only;
   `push_subscriptions` policies present; a real subscribe/unsubscribe round-trip
   through `/api/push/subscribe`).
3. After deployment, `streak-reminder` cron should start producing nonzero
   `notified` counts once real subscriptions exist (first true end-to-end push
   validation).

## 6) Exact Git diff summary

```
 ?? db/65-notifications-push-rls.sql                        (new, ~115 lines)
 ?? tests/engagement-notifications-push-migration.test.ts   (new, ~110 lines)
 ?? scripts/g0f-notifications-push-verify.mjs               (new, ~205 lines)
 ?? MAGICLY_ENGAGEMENT_G0F_NOTIFICATIONS_PUSH_BOUNDARY_REPORT.md (this report)
```

No existing files were modified in G0-F.

## 7) Commit

**None.** Per instructions. Nothing applied to production.
