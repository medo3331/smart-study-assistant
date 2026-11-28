# MAGICLY ENGAGEMENT — G0-E: Admin / Announcements Boundary

**Mode:** IMPLEMENT (Audit → Fix → Verify) — scoped to admin authorization + announcement data boundaries only.
**Date:** 2026-11-21
**Branch:** `feat/engagement-p1b2-discovery`
**Starting HEAD:** `e6b6f24f43d8610b098469e2c95ca40d39aa64e3` (no commits across G0-A…E)
**Worktree:** `C:/Desktop/smart-study-assistant`
**No commit created. No production changes. No migration applied. Coins/XP/goal_done untouched.**

---

## 1) Source audit (live production, read-only)

### What was audited

| Area | Files / objects | Verdict |
|---|---|---|
| Admin authorization infra | `lib/admin/auth-check.ts`, `lib/admin/action-guard.ts`, `lib/policy.ts` (resolveActor), `lib/auth-roles.ts` (hasPermission) | ✅ **Sound.** Identity comes from the session (`auth.getUser()`) — never from parameters; roles resolved from DB (`site_admins` + owner env allowlist); `requireAdminPermission` (pages) and `requireAdminActor`/`guardAction` (server actions) enforce permissions server-side per operation. |
| Admin broadcast | `app/admin/actions/messaging.ts` (`sendAdminMessage`) | ✅ **Sound.** `requireAdminPermission("announcements.manage")` + a redundant `hasPermission` check; writes `admin_announcements`/`user_inbox`/`email_deliveries` via **service client**; recipient list built server-side (targeted user or profiles list — never client-supplied beyond the intended target); `recordAuditLog` on every send. |
| Public announcements API | `app/api/announcements/route.ts`, `[id]/route.ts`, `[id]/read` | ✅ **Sound.** GET (published) for authenticated; `all`/POST/PATCH/DELETE each enforce `announcements.manage` via service client + audit; `announcement_reads` = self-insert with published-check policy, self-read only. |
| `announcements` table RLS | production policies | ✅ Authenticated read of *published* only (policy applies to public roles; drafts/archived hidden). No client write policy. |
| `announcement_reads` RLS | production policies | ✅ self insert (published-only check) + self read; no update/delete. |
| `email_deliveries` RLS | production policy `SELECT USING (false)` | ✅ client-denied; writes via service. |
| **`admin_announcements` RLS** | policy `admin_announcements service read` USING (true) | ❌ **P0 — any anon/authenticated user could SELECT all admin announcements**, including `target_user_id` (user-targeting data) and message bodies. The code audit found **no legitimate client read path at all** — the only app reference is the admin write path (service client). This was flagged as P0-5 in P1-A and is still live. **Fixed in this phase.** |
| **`user_inbox` RLS** | owner SELECT + owner UPDATE policies; full-table UPDATE grant | ⚠️ **Integrity gap:** the owner could update **any column** of their inbox rows (`subject`, `body`, even `user_id`), while the only legitimate client action is marking a message read (`is_read`, `read_at` — `app/inbox/page.tsx`). INSERT/DELETE have no client policies (service-only writes — correct). **Fixed in this phase.** |
| Notifications dual-schema | `app/api/notifications`, support actions | ℹ️ Audited only at the boundary level: no admin-send path to general users found broken beyond P1-A's known issues; the full notifications normalization belongs to **G0-F**, deliberately not touched here. |

## 2) Fix implemented: `db/64-admin-messaging-rls.sql` (additive, no data changes)

1. **`admin_announcements` — close the public read (P0):**
   - `DROP POLICY "admin_announcements service read"` (the USING(true) policy);
   - `REVOKE ALL ... FROM anon, authenticated` (defense in depth; the service role's
     grants are untouched and it bypasses RLS — the only access path in the code).
   - Result: default-deny for all clients; admin data readable only through the
     permission-checked, audit-logged server path.
2. **`user_inbox` — column-limited owner update:**
   - `REVOKE UPDATE/INSERT/DELETE` from `anon/authenticated`;
   - `GRANT SELECT` + `GRANT UPDATE (is_read, read_at)` to `authenticated`.
   - The student experience is preserved exactly: `/inbox` can still list and mark
     messages read. Tampering with `subject`/`body`/`user_id` is now blocked by
     PostgreSQL column privileges (not just RLS).
3. **`email_deliveries` — defense in depth:** full privilege revocation from client
   roles (the `SELECT USING(false)` policy stays; service writes unaffected).

**Explicitly untouched:** `announcements`, `announcement_reads`, `notifications`,
`push_subscriptions`, `site_admins`, `admin_users`, all app code (no client code
changes), Coins/XP/`goal_done`.

## 3) Admin-role verification summary (the 5th brief item)

- Every sensitive admin operation checked in this audit resolves the actor from the
  server session and enforces `announcements.manage` **server-side**, per operation
  (pages via `requireAdminPermission`; actions/APIs via `requireAdminActor`/`hasPermission`
  on a service client). Nav visibility is not relied upon anywhere in the audited paths.
- Broadcast recipients: targeted user id is admin-input (allowed by design), and the
  "all" path enumerates profiles server-side via service client — a normal user cannot
  invoke any of it (server actions resolve identity from the session; the API routes
  return 401/403 without the permission).
- `admin_announcements` had **no** client read path in code — the exposure was purely
  DB-policy level, which is exactly what db/64 closes.

## 4) Tests run and exact results

### Unit / contract (vitest)

- `npx vitest run tests/engagement-admin-boundary-migration.test.ts` → **7/7 passed.**
  Covers: the USING(true) policy dropped; no new client policy created; client
  privileges revoked; `user_inbox` UPDATE limited to `(is_read, read_at)` with
  INSERT/DELETE revoked; `email_deliveries` revoked; no `DROP TABLE`/`DELETE FROM`;
  `announcements`/`announcement_reads`/`coin_ledger`/`profiles`/`planner_goals`
  unreferenced; standard single BEGIN/COMMIT wrapper; the only `admin_announcements`
  app reference is the service-client admin path behind `announcements.manage`;
  `/inbox` updates only `is_read/read_at`.
- Full suite `npx vitest run` → **1878 passed, 14 skipped; 1 failed —
  `lib/ai/__tests__/lecture-store.test.ts`**, the same pre-existing failure verified on
  clean HEAD during G0-A.

### Database verification

**Not run — intentionally** (post-incident rules). The verification script is written
and **proven fail-closed**: running with the production `DATABASE_URL` exits with
code 2 (`مرفوض: هذا السكريبت لا يعمل على الإنتاج (lgaqgkihhmedtdzcgpnc)`).
No local/staging DB is available in this environment.

**Required before adopting G0-E as deployed:** run
`G0E_DATABASE_URL=<local/staging> node scripts/g0e-admin-boundary-verify.mjs`
(14 checks: admin_announcements fully client-denied while service-readable;
`user_inbox` own-rows-only read; legitimate is_read/read_at update preserved;
subject/body/user_id tampering denied; INSERT/DELETE denied; `email_deliveries`
denied; broadcast path preserved).

### TypeScript

- `npx tsc --noEmit` — **currently fails with exactly one error introduced by a
  peer agent's in-flight, uncommitted edits in this shared checkout** (not by this
  task): `app/dashboard/page.tsx(809,12): TS2678 Type '"settings"' is not comparable
  to '"ai" | "emergency" | "parentReport" | "leaderboard" | "xpShop"'` — caused by
  the peer's work-in-progress edit to `app/dashboard/components/nav-config.ts`
  (NAV_SIGNALS union changed while `handleNavSignal` still handles `"settings"`).
  Zero G0-E files are involved. The peer was notified with the exact error; per
  collaboration rules their in-progress work was not modified or reverted.
  Before G0-E deployment, `tsc` should be re-run once the peer's work lands.

## 5) Security limitations still open (out of G0-E scope)

1. **Notifications normalization** (dual `user_id`/`recipient_id` schema, broken
   admin broadcast types, missing INSERT policy, full-table grants) — deferred to
   **G0-F** per the plan; this phase verified the admin boundary only.
2. **`goal_done` circular trust** (P1-A P0-2) — untouched here, as instructed; needs
   its own economy-remediation track.
3. `admin_announcements`/`user_inbox` fan-out creates one inbox row per profile
   (limit 1000) — operational scale note, not a security boundary.
4. Column-privilege enforcement relies on the revoke being applied together with the
   migration (same transaction) — verified by the staging script before adoption.

## 6) Production verification still required (with explicit authorization)

1. Local/staging run of `scripts/g0e-admin-boundary-verify.mjs`.
2. Re-run `npx tsc --noEmit` after the peer's dashboard/settings edits land.
3. With explicit authorization: apply `db/64…sql` to production, then read-only
   post-apply checks (`pg_policies` on `admin_announcements` empty;
   `information_schema.role_table_grants` show the column-limited UPDATE; the app's
   admin messaging page and `/inbox` still work).

## 7) Exact Git diff summary

```
 ?? db/64-admin-messaging-rls.sql                       (new, ~110 lines)
 ?? tests/engagement-admin-boundary-migration.test.ts   (new, ~140 lines)
 ?? scripts/g0e-admin-boundary-verify.mjs               (new, ~215 lines)
 ?? MAGICLY_ENGAGEMENT_G0E_ADMIN_ANNOUNCEMENTS_BOUNDARY_REPORT.md (this report)
```

No existing files were modified in G0-E.

## 8) Commit

**None.** Per instructions. Nothing applied to production.
