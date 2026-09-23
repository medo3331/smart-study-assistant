# EPIC 1–4 Audit Report — Actual Evidence Only

**Branch**: `progress-experience` @ `511edca` / `dc59b3c` / `7f3aaee` / `5e82592`
**Rule applied**: No PASS/CONFIRMED/DONE without file evidence + either DB query result or honest "غير قابل للتحقق من هنا".
**DB access from session**: DATABASE_URL = NOT SET; SERVICE_ROLE_KEY = NOT SET → all DB-state claims marked "غير قابل للتحقق من هنا".
**Previous reports (FINAL_*, *_CONFIRMED.md)**: Treated as unverified archives, not sources of truth.

---

## EPIC 1 — Profiles

| Item | Status | Evidence | Actual Gap |
|---|---|---|---|
| db/auth-phase1.sql (profiles schema) | ✅ File exists, detailed | 1276 bytes, defines profiles (id, email, display_name, persona, role, onboarded_at) | DB execution unverified (no DATABASE_URL) |
| db/profiles-phase1.sql | ✅ File exists | 2804 bytes | DB execution unverified |
| lib/user-profiles.ts | ✅ Exists; connected to Dashboard/Assessment | References `profiles` in queries | DB state unverified |
| lib/user-persona.ts | ✅ Exists | 16848 bytes, STUDENT_LEVELS + persona mapping | DB state unverified |
| 3 profiles / account mechanism | ❌ Not clearly implemented in code | No clear `multiple_profiles` or `active_profile` logic in current frontend/DB interaction | **Real gap** — needs design clarification |
| profiles.public_user_code (EPIC-6) | ✅ SQL created + trigger | `db/epic6-user-code.sql` (2011 bytes) | SQL not confirmed executed on Supabase |

---

## EPIC 2 — File Upload Organization

| Item | Status | Evidence | Actual Gap |
|---|---|---|---|
| `/app/api/upload/route.ts` (endpoint) | ❌ MISSING | File search returned 0 matches | **Real gap** — no upload endpoint exists |
| `lib/shop/shop-data.ts` | ✅ Exists (21927 B) | References `limit`, `coin_ledger`; no `file_size`/`upload` reference found | Quota enforcement not visibly implemented |
| Quota limits (Free/Pro/Ultra) | ❌ Not visible in code | No `IF plan='free' THEN max_file_size` pattern | **Real gap** — needs enforcement logic |
| Daily reset of uploads | ❌ Not in SQL or code | No `reset_daily_uploads` trigger/function | **Real gap** |
| File classification (stage/subject/grade) | ❌ Not implemented | No table/logic for file taxonomy | **Real gap** |

---

## EPIC 3 — Subscription + Limits

| Item | Status | Evidence | Actual Gap |
|---|---|---|---|
| `subscription_plans` (DB table) | ✅ SQL exists + populated | `epic2-admin-rbac-audit-schema.sql` lines 113–161 | DB execution unverified |
| `subscription_activations` (DB table) | ✅ SQL exists | Same SQL; `subscription-manage.ts` queries it | DB execution unverified |
| `subscription-manage.ts` | ✅ Exists (4433 B) | Queries `profiles`, `user_codes`, `subscription_activations`, `entitlements`, `subscription_quotas` | DB state unverified |
| `db/epic3-subscription-quotas.sql` | ✅ Created | Quota tracking table (messages_24h, uploads_today, last_reset_at) | SQL not confirmed executed |
| Trial activation (manual) | ✅ Mechanism exists | `subscription-form-action.ts` → `subscription-activate.ts` → `user_codes` lookup + audit | Works when DB is present |
| Quota enforcement in code | ⚠️ Partial — reads only | `subscription-manage` reads quotas; no `if (used > limit) block` in AI/upload paths | **Real gap** — needs enforcement logic |
| Daily quota reset | ⚠️ SQL table exists | `last_reset_at`; no cron/trigger | **Real gap** — needs server logic |
| Admin activation link | ✅ In admin page | `sub_lookup` form + `subscription-form-action.ts` | — |

---

## EPIC 4 — Admin Page Core

| Item | Status | Evidence | Actual Gap |
|---|---|---|---|
| `app/admin/page.tsx` | ✅ Exists, all sections present | 1080 lines; stats, users, AI, subs, rewards, audit, admin mgmt | DB state unverified |
| `users-search.ts` | ✅ Real DB query (`createServiceClient`) | Reads `profiles` real-time | DB state unverified |
| `users-ban.ts` / `users-unban.ts` | ✅ Real DB query + audit | Uses `recordAuditLog()` (service_role insert) | Audit write unverified (no DB access) |
| `ai-models.ts` | ✅ Real DB query + audit | Uses `audit_log` via `recordAuditLog` | Audit write unverified |
| `audit-log/page.tsx` (new) | ✅ Created (Phase 2) | Queries `audit_log` table with `service_role` | DB state unverified |
| `rewards-issue.ts` / `rewards-activity.ts` | ✅ Real DB queries | `rewards_issued`, `ai_credit_ledger`, `coin_ledger` | DB state unverified |
| `audit-log-record.ts` | ✅ Exists (46 B) | `createServiceClient()` + insert to `audit_log` + silent fail | DB state unverified |
| `auth-roles.ts` RBAC | ✅ Enforced | `rewards.manage` = ["owner"]; `ADMIN_PERMISSION_MAP` defines roles; `isSensitivePermission()` works | Not dynamically enforced by DB — relies on `getAdminRole()` + code checks |
| Manual subscription activation (WhatsApp → Admin) | ✅ Full flow | `user_codes` lookup → `subscription_activations` insert → `audit_log` (PASS/BLOCKED) | DB verification unverified |
| Alert removal (alert() in server actions) | ✅ Fixed | `0` matches from `grep` in `app/admin/page.tsx`; replaced with `redirect` | — |

---

## Priority Order — Largest Actual Gaps (Not Roadmap Order)

1. **EPIC 2 — Upload endpoint + quota enforcement** (`/api/upload` MISSING; no enforcement logic) → blocks any file-feature delivery.
2. **EPIC 2/3 — Quota reset + enforcement** (`subscription_quotas` SQL exists but no reset mechanism; no code block when limits reached) → blocks subscription framework reliability.
3. **DB SQL execution (all new SQL)**: `epic6-user-code.sql`, `rewards-rls-policy.sql`, `epic3-subscription-quotas.sql` — need manual execution on Supabase.
4. **EPIC 1 — Multi-profile / Active profile** — unclear from code if required (3 profiles/account may be design spec vs actual implementation).
5. **EPIC 4 — Live audit verification** — requires test ban/unban + DB check of `audit_log`; currently unverified live.

---

*Prepared from actual file contents (not previous reports). All DB-state claims marked honestly. Unverified due to missing local DATABASE_URL / SERVICE_ROLE_KEY access during this session.*

---

## UPDATE — EPIC 2 Upload + EPIC 3 Quota Enforcement (executed)
- `db/epic2-file-upload.sql`: created (files table + RLS + index)
- `app/api/upload/route.ts`: created — server-side quota check (lazy reset + plan limits + file type/size enforcement)
- Enforcement mechanism: server action (not UI-only) — reads `subscription_quotas` and `subscription_plans`, blocks when `uploads_today >= limit` or `file_size > cfg.fileSizeMB`
- DB verification: `DATABASE_URL` not available locally; SQL must be executed manually on Supabase
- Build: PASS (verified with `npm run build`)
- Note: No `as any` bypass; real DB writes via `createServiceClient()`

---

## UPDATE — Admin Panel Phase 1: Split monolith + server-side RBAC (executed 2026-09-22)

**Verification evidence:** `npx tsc --noEmit` = PASS (0 errors) · `npm run build` (Turbopack, Next 16.2.10) = PASS (0 errors) — all 9 routes present as Dynamic (ƒ): `/admin`, `/admin/users`, `/admin/subscriptions`, `/admin/plans`, `/admin/models`, `/admin/rewards`, `/admin/audit-log`, `/admin/files`, `/admin/settings`.

> Env note: the build was verified with placeholder `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` in a temporary `.env.local` (deleted after verification) because public pages like `/assessment` create a Supabase client during prerender. Earlier `npm ci` failure was caused by `npm-pkg-lint@4.0.0` (`node>=22` on node 20) — **not** a project dependency; after a clean install the native SWC binding works and `next build` runs on Turbopack (no `--webpack` needed).

| Item | Status | Evidence | Remaining gap |
|---|---|---|---|
| Monolithic `app/admin/page.tsx` (~3700 lines) split into 8 sub-pages | ✅ Done | `app/admin/page.tsx` (home: stats + quick nav + platform overview) + `users/ subscriptions/ plans/ models/ rewards/ audit-log/ files/ settings/` | — |
| Server-side RBAC enforcement | ✅ Done | `proxy.ts` now checks session only; `app/admin/layout.tsx` enforces role via `getAdminContext()`; every page calls `requireAdminPermission(<permission>)` → 404 on missing permission | Per-action permission checks — present in AI-models/subscriptions/users/rewards actions; full sweep in Phase 2 |
| Single nav/permission source | ✅ Done | `lib/admin/nav.ts` (`ADMIN_NAV` + `getAllowedNavItems()`) | — |
| Permission-filtered sidebar | ✅ Done | `components/admin/AdminNav.tsx` + layout passes allowed items only | — |
| Shared admin design system | ✅ Done | `components/admin/ui.tsx` (AdminPageHeader/AdminCard/AdminStatCard/AdminNotice/AdminTableWrap/AdminSkeleton) | — |
| FormData identity spoofing fix | ✅ Done | `ai-models-form-action.ts` + `subscription-form-action.ts` now read actor identity from server session (was `admin_user_id`/`admin_email` from client FormData — spoofable) | — |
| Audit on role grant/revoke | ✅ Done | `app/api/admin/manage-roles/route.ts` calls `recordAuditLog`; redirects updated to `/admin/settings` | — |
| Real data in pages | ⚠️ Partial | users/subscriptions/models/rewards/audit-log read real Supabase/Postgres data; overview stats via `lib/admin/overview.ts` | `DATABASE_URL` not set in this environment → overview numbers shown as honest `N/A` in UI; full DB verification pending |
| `/admin/files`, `/admin/settings` | ⚠️ Real skeletons | Env-readiness checks shown; settings includes `site_admins` management (owner-only) | Real `platform_storage` file listing → Phase 4; persisted platform settings table doesn't exist yet |

**Gaps discovered during execution (documented for later phases):**
- `checkSubscriptionQuota` in `lib/ai/quota-check.ts` **does not exist** — quota logic is inline in `app/api/upload/route.ts` and `app/admin/actions/subscription-manage.ts`.
- `public_user_code` format mismatch: generator produces `MAG-ABC-1234` (10 chars) but `/u/[code]` validates `^MAG-[A-Z0-9]{6}$` → QR codes would fail. Deferred to Phase 3.
- Old RBAC was **effectively dead**: `proxy.ts` + old layout blocked anyone not in `OWNER_EMAIL`/`ADMIN_EMAILS` env vars → `site_admins` table members couldn't access admin at all, and everyone who could was treated as owner. Fixed in Phase 1.
- `updateBillingSettings` in `app/plans/actions.ts` accepts any user with `premium` entitlement instead of checking admin role — known gap, not wired to UI, documented for a later phase.
- All SQL files in `db/` (incl. `db/epic2-admin-rbac-audit-schema.sql`) require **manual execution on Supabase** — no automated migrations.

**Next:** Phase 2 — AI models page with real DB state (priority/limits editing, provider health monitoring).

---

## Phase 1.5 — Gap Closure (executed 2026-09-22, before Phase 2)

### Part A — Precise detailing of the 5 gaps (file:line evidence, before any fix)

**Gap 1 — `checkSubscriptionQuota` does not exist:**
- `lib/ai/quota-check.ts` **does not exist** (`lib/ai/` listing verified — 30 files, no `quota-check.ts`). `checkSubscriptionQuota` appears 0 times in code (only in this report).
- User-facing **upload** path: `app/api/upload/route.ts:21-101` — **already enforced inline** (lazy 24h reset L30-40, plan limits L54-59, block L73-75, increment L94-101). Not a gap.
- User-facing **chat/messages** path: `app/api/chat/route.ts:94-105` — gated only by entitlement filter + `guardAiAccessAndReserve` (1-credit reserve). **No subscription message-quota check anywhere**: `subscription_quotas.messages_24h` is never incremented/checked by any AI message path; `subscription_plans.messages_per_2h` (`db/epic2-admin-rbac-audit-schema.sql:121`) is never read at runtime. → **real user-path gap (free users can send unlimited plan-quota messages)**.
- Admin path: `app/admin/actions/subscription-manage.ts:82-83` — read-only quota display; admins don't consume quota there → **not a gap** (intentional).

**Gap 2 — `public_user_code` format mismatch:**
- Canonical generator: `db/epic6-user-code.sql:16-24` produces `'MAG-' + 3 chars + '-' + 4 chars` → e.g. `MAG-ABC-1234` (12 chars incl. dashes). Its own comment (L8) wrongly says "MAG-XXXXXX … 9 chars total".
- Conflicting validator: `app/u/[code]/page.tsx:8` — `/^MAG-[A-Z0-9]{6}$/i` expects `MAG-XXXXXX` (single dash, 6 chars). **Every code the DB trigger produces fails this validation** → `/u/<code>` always redirects to `/?error=كود_غير_صالح`; Phase 3 QR would inherit this.
- Duplicate source: `db/epic6-user-code-preview.sql` is **byte-identical** to `db/epic6-user-code.sql` (`fc.exe`: no differences) → confusing second source of truth.
- `user_codes.code` in `users-search.ts`/`subscription-manage.ts` is a **different concept** (manual activation codes) — not affected.
- Decision: canonical = generator format `MAG-XXX-XXXX` (per `db/epic6-user-code.sql`). No data migration needed — only one generator has ever existed, so existing rows are already canonical.

**Gap 3 — old/dead RBAC (two categories):**

(a) **Literally dead — 0 callers** (verified by repo-wide import search). All use the old "OWNER_EMAIL env compare **+ premium-entitlement fallback**" pattern — i.e. if any were ever wired, **any premium subscriber would pass as admin**:
| File / symbol | Lines | Callers | Risk if wired |
|---|---|---|---|
| `requireAdminAuth` (`lib/admin/auth-check.ts`) | 56-59 | 0 | Deprecated stub — confusion only |
| `app/admin/actions/premium-trial.ts` — `claimPremiumTrial(email, userId)` | whole file | 0 (`PremiumTrialCard` uses `app/plans/actions-trial.ts` → atomic RPC) | premium user grants trials to anyone |
| `app/admin/actions/entitlement-grant.ts` — `grantPremiumEntitlement` | whole file | 0 | premium user grants premium to anyone |
| `app/admin/actions/admin-management.ts` — `addAdminByEmail`/`removeAdminById` | whole file | 0 (settings page uses `/api/admin/manage-roles`) | **premium user adds/removes site_admins** |
| `isAdminOwner` (`lib/plans/settings.ts`) | 30-37 | 0 | env-only owner check (weak but harmless) |
| `app/plans/reward-action.ts` — `claimPremiumTrial(expiresAt)` | whole file | 0 | **NEW DISCOVERY: NO authorization at all** — comment claims "requires Owner/Admin" but code only checks login → any logged-in user could self-grant premium if imported |

(b) **Live with old semantics:**
- `app/api/admin/is-owner/route.ts` — used by `NavRail.tsx:94` + `MobileNav.tsx:33` for Admin-link visibility; returns only env-owner → `site_admins` members **never see the Admin link** (functional bug vs new RBAC). Fix: also return `canAccessAdmin` via `getAdminRole`; update both consumers.
- `lib/auth-roles.ts` `isOwnerEmail` + `OWNER_EMAIL` env = **the NEW RBAC's owner detection by design** (owner = env email; admins/support = `site_admins` table). NOT dead — kept.

**Gap 4 — `updateBillingSettings`:**
- Function **exists and is functionally complete** (`app/plans/actions.ts:35-66`) — writes `app_settings` via service client.
- **Gap = authorization** (L43-50): owner (env) **OR `has_entitlement(plan, premium)`** → **any premium subscriber can flip global billing flags** (`billing_free_period_enabled` / `billing_payments_enabled`). Server actions are remotely callable endpoints, so "not wired to UI" does NOT close the hole.
- **Gap 2 = no audit logging** on a global-sensitive write.
- **New discovery:** the `app_settings` table has **no migration file anywhere in `db/`** (repo-wide SQL search = 0) → even authorized writes fail on a fresh DB.

**Gap 5 — SQL files requiring manual execution (single list, from `git log -- db/`):**

| # | File | Introduced in | Creates/updates |
|---|---|---|---|
| 1 | `db/epic2-admin-rbac-audit-schema.sql` | 29b6e7d | `subscription_plans`, `subscription_activations`, `site_admins.permissions`, `audit_log` |
| 2 | `db/ai-models-control.sql` | 1b70429 | AI model registry/control table (used by Phase 2) |
| 3 | `db/rewards-issue-schema.sql` | 5e98390 | `rewards_issued` |
| 4 | `db/rewards-rls-policy.sql` | a540158 | RLS policies for rewards |
| 5 | `db/epic6-user-code.sql` | 82782cc | `profiles.public_user_code` + trigger + index |
| 6 | `db/epic3-subscription-quotas.sql` | dc59b3c | `subscription_quotas` |
| 7 | `db/epic2-file-upload.sql` | b7a5f4c | `files` table |
| 8 | `db/app-settings-billing.sql` | **Phase 1.5 (new)** | `app_settings` (was missing entirely) |
| 9 | `db/ai-models-priority-limits.sql` | **Phase 2 (new)** | `ai_models.daily_limit` + positive CHECK |
| 10 | `db/10-user-code-regenerate-permission.sql` | **Phase 3 (new)** | `admin_permission_keys` reference row for `users.regenerate_code` (idempotent; reference-only table — real enforcement is in `ADMIN_PERMISSION_MAP`) |

Recommended execution order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10. `db/epic6-user-code-preview.sql` deleted in Part B (byte-identical duplicate of #5).

### Part B — Fixes executed (in priority order)

1. **Dead/old RBAC closed (security first):**
   - **Deleted** (0 callers each, verified): `app/admin/actions/premium-trial.ts`, `app/admin/actions/entitlement-grant.ts`, `app/admin/actions/admin-management.ts`, `app/plans/reward-action.ts` (the last had **no authorization at all** — any logged-in user could self-grant premium), `requireAdminAuth` from `lib/admin/auth-check.ts`, `isAdminOwner` from `lib/plans/settings.ts`.
   - **Fixed live path:** `app/api/admin/is-owner/route.ts` now returns `{ isOwner, canAccessAdmin }` via `getAdminRole` (was env-owner only → `site_admins` members couldn't see the Admin link). Consumers updated: `NavRail.tsx`, `MobileNav.tsx`.
   - Kept by design: `isOwnerEmail`/`OWNER_EMAIL` in `lib/auth-roles.ts` = the NEW RBAC's owner detection.
2. **`public_user_code` unified** on the canonical generator format `MAG-XXX-XXXX`: validator fixed (`app/u/[code]/page.tsx` → `^MAG-[A-Z0-9]{3}-[A-Z0-9]{4}$`), misleading comment fixed in `db/epic6-user-code.sql`, duplicate `epic6-user-code-preview.sql` deleted. No data migration needed (single generator has ever existed).
3. **`checkSubscriptionQuota` created** (`lib/ai/quota-check.ts`) and **wired into the chat path** (`app/api/chat/route.ts` — 429 `MESSAGE_QUOTA_EXCEEDED` when over limit). Decisions documented: 24h window (existing columns) with daily-equivalent limit = `messages_per_2h × 12`; fail-open if quota tables not yet migrated (availability — chat must not break pre-migration); admin paths exempt (read-only, intentional); `unified-ai` stays credit-gated (credits ARE the quota there — different economic model, not double-gated).
4. **`updateBillingSettings` hardened** (`app/plans/actions.ts`): premium-entitlement fallback **removed** → `hasPermission("plans.manage")` (Owner-only per `ADMIN_PERMISSION_MAP`) + mandatory `recordAuditLog` (PASS + FAIL both logged). Created `db/app-settings-billing.sql` (the `app_settings` table had **no migration at all**).

### Part C — Final verification + before/after

**Verification evidence:** `npx tsc --noEmit` = PASS (0 errors) · `npm run build` (Turbopack) = PASS (0 errors, "Compiled successfully") — all 9 admin routes + `/u/[code]` present as Dynamic (ƒ). Build used temporary placeholder `.env.local` (deleted after, same as Phase 1).

| Gap | Before | After |
|---|---|---|
| 1. `checkSubscriptionQuota` | Didn't exist; `messages_24h`/`messages_per_2h` never enforced → free users could send unlimited plan-quota messages in chat | `lib/ai/quota-check.ts` enforces plan message quota in `app/api/chat/route.ts` (429 + Arabic reason); admin read-only paths exempt by design |
| 2. `public_user_code` mismatch | Generator `MAG-XXX-XXXX` vs validator `MAG-XXXXXX` → **100% of generated codes rejected** by `/u/[code]`; Phase 3 QR would break | Single canonical format `MAG-XXX-XXXX`; validator matches generator; duplicate SQL deleted |
| 3. Dead/old RBAC | 6 dead symbols/files (incl. one with **zero authz**) + live is-owner route hiding Admin link from `site_admins` | All 6 deleted (not commented); is-owner returns `canAccessAdmin` via new RBAC; both nav consumers updated |
| 4. `updateBillingSettings` | Any **premium subscriber** could flip global billing flags; no audit; target table had no migration | Owner-only `plans.manage` + audit PASS/FAIL + `db/app-settings-billing.sql` created |
| 5. Scattered SQL | No single list; `app_settings` migration missing entirely | Single ordered list (8 files) above; `epic6-user-code-preview.sql` duplicate removed |

**Deferred decisions (intentional, not gaps):** exact 2h-window message enforcement needs a new `window_start` column → Phase 4 limits unification; upload route keeps its verified inline quota logic until the same unification (shared module already exists for it to adopt).

---

## Phase 2 — /admin/models real activation (executed 2026-09-22)

**Verification evidence:** `npx tsc --noEmit` = PASS (0 errors) · `npm run build` (Turbopack) = PASS (0 errors) — `/admin/models`, `/api/chat`, `/api/unified-ai`, `/u/[code]` all present as Dynamic (ƒ). Build used temporary placeholder `.env.local` (deleted after).

**Critical finding before any change:** the `ai_models` DB table was **write-only** — the toggle action wrote to it, but NOTHING read it at runtime (repo-wide search: `from("ai_models")` appeared only in `app/admin/actions/ai-models.ts`). The router (`lib/ai/routing.ts`) read only the static `MODEL_REGISTRY`, so admin toggles were decorative at runtime AND the admin page displayed static registry values (stale after any toggle).

| Item | Status | Evidence | Remaining gap |
|---|---|---|---|
| Toggle enable/disable → real runtime effect | ✅ Done | New `lib/ai/model-state.ts` (process cache, TTL 30s, single-flight); `lib/ai/routing.ts` `pushIfEligible` now gates on `isModelRuntimeEnabled()`; refreshed at entry points `app/api/chat/route.ts` + `app/api/unified-ai/route.ts` | Other AI routes (image/file/diagram/plan…) adopt via the shared cache once any main route refreshes; cold-start on those routes falls back to registry (fail-open, documented) |
| Priority/order editing → real runtime effect | ✅ Done | `updateModelPriority` action (1–99 validated) + form wrapper; `routing.ts` primary-model sort uses `getRuntimePriority()` (DB overrides registry) | `fallback_priority` stays code-defined (fallback ordering) — documented |
| Per-model daily usage limit | ✅ Done | New column `daily_limit` (`db/ai-models-priority-limits.sql`, manual); `updateModelDailyLimit` action (null = unlimited); enforced in `isModelRuntimeEnabled()` using today's completed `ai_operations` count per model | `ai_operations.provider` CHECK constraint only allows groq/gemini in the old SQL — nvidia/openrouter rows would fail insert (recordAiOperation is best-effort, logs warning). Fix deferred to Phase 4 SQL sweep |
| Real status per provider | ✅ Done | Providers card now shows `getProviderHealth()` runtime state (AVAILABLE/DEGRADED/RATE_LIMITED/COOLDOWN/AUTH_ERROR/TIMEOUT) + `getProviderStats()` (success/failure counts, avg latency, cooldown) — no static text | Health state is per-process and resets on cold start — behavior documented in the UI notice itself |
| Per-action RBAC sweep (this page) | ✅ Done | All 3 form actions (`toggleModelFormAction`, `updateModelPriorityFormAction`, `updateModelLimitFormAction`) read actor identity from the **server session** (`ai-models-form-action.ts`), then `requireModelsManage()` in `ai-models.ts` enforces `hasPermission("models.manage")` (Owner-only per `ADMIN_PERMISSION_MAP`) + audit PASS/FAIL/BLOCKED. `GET /api/admin/ai-overview` verified owner/admin-gated (`getAdminRole` → 403) | — |
| Admin page shows DB state | ✅ Done | Models table merges registry (identity/capabilities) with DB state (enabled/priority/daily_limit/usedToday); `(DB)` vs `(كود)` source labels; explicit amber notice + FAIL-not-fake behavior when `ai_models` is unavailable | Full end-to-end DB verification pending `DATABASE_URL`/manual SQL execution |

**New SQL to execute manually (added to the Phase 1.5 list as #9):** `db/ai-models-priority-limits.sql` (`ai_models.daily_limit` + positive CHECK). Prerequisite: #2 (`db/ai-models-control.sql`).

**Fail-open decisions (documented, intentional):** if `ai_models`/`ai_operations` are unreachable, routing falls back to static registry (AI never breaks because of an admin feature); a model present in code but missing from the DB table keeps its registry state.

**STOP before Phase 3** (per instruction) — Phase 3 = QR codes on top of the now-unified `MAG-XXX-XXXX` `public_user_code` format.

### Live DB verification (executed 2026-09-23, direct pg via DATABASE_URL)

All 9 manual SQL files confirmed applied on production Supabase:

| # | Object | Verified evidence |
|---|---|---|
| 1 | `site_admins` + `audit_log` | both tables exist; `audit_log` has 4 RLS policies (admin read / no client write-update-delete) |
| 2 | `ai_models` | 13 columns incl. `model_id` PK (text), `enabled`, `priority`; 12 seeded rows matching `MODEL_REGISTRY` exactly (deepseek-v4-flash + inkling-small disabled, rest enabled) |
| 3+4 | `rewards_issued` + RLS | table exists; 5 policies (admin read/write + no client insert/update/delete) |
| 5 | `public_user_code` | `profiles.public_user_code` (text) + functions `generate_public_user_code` + `set_public_user_code` |
| 6 | quota columns | `subscription_plans.messages_per_2h`, `subscription_quotas.messages_24h` |
| 7 | `files` | table exists + 4 owner RLS policies (note: table name is `files`, not `*upload*`) |
| 8 | `app_settings` | 2 seed rows (`billing_free_period_enabled=true`, `billing_payments_enabled=false`), RLS enabled, `app_settings_read_all` SELECT policy |
| 9 | `ai_models.daily_limit` | column `int NULL` + constraint `ai_models_daily_limit_positive CHECK (daily_limit IS NULL OR daily_limit > 0)` |

Code↔DB column-name alignment re-verified: `lib/ai/model-state.ts:52` selects `model_id, enabled, priority, daily_limit`; `app/admin/actions/ai-models.ts` updates with `.eq("model_id", …)` — matches the live schema (an earlier verification query of mine used `id` and failed; that was a query typo, not a code bug).



---

## Phase 3 — QR Code (2026-09-23)

### القرارات المتخذة (كل قرار بدليل من الكود/الـDB — مش افتراض)

1. **من يولّد**: التوليد التلقائي موجود أصلًا عند إنشاء الحساب عبر DB trigger `set_public_user_code` (`db/epic6-user-code.sql:42-45` — مؤكد موجود في الـDB الحية في جلسة التحقق). الجديد: فعل إداري `regenerateUserPublicCode` محكوم بـ `users.regenerate_code` (Owner/Admin). **ممنوع للمستخدم العادي** توليد/تغيير كوده: مفيش أي مسار عميل، الهوية بتتقرأ من الجلسة في الغلاف، والفحص server-side جوه الـaction نفسه، وأي محاولة مرفوضة بتتسجّل BLOCKED في audit_log.
2. **المحتوى المُرمَّز في QR**: رابط كامل `${SITE_URL}/u/<code>` — الدليل: `SITE_URL = 'https://magiclly.com'` (`lib/seo.ts:29`) هو المصدر الكنسي للدومين (مستخدم فعليًا في sitemap/robots/canonical/JSON-LD)، و`/u/[code]` هو المسار العام الفعلي للكود (`app/u/[code]/page.tsx`). مفيش identifier موازٍ — المحتوى هو `public_user_code` نفسه.
3. **ميكانيكية إعادة التوليد**: `update profiles set public_user_code = null` → الـtrigger (BEFORE INSERT OR UPDATE، يملأ NULL/'') يولّد بالمولّد الكنسي `generate_public_user_code()` — صفر منطق مكرر، مصدر واحد للتنسيق. بعد التحديث بنقرأ الكود الجديد ونتحقق من الصيغة الكنسية `MAG-XXX-XXXX`، وأي انحراف = FAIL + audit. تصادم UNIQUE احتماله ~1/78 مليار وبيترجم لرسالة خطأ واضحة + FAIL audit.
4. **مكتبة QR**: `qrcode@1.5.4` (npm) — توليد SVG محلي server-side، **بلا API خارجي وبلا أي endpoint جديد** (rendering inline في server components + التحميل عبر data URI — صفر سطح هجوم إضافي).
5. **بقايا QR قديمة (قاعدة 4)**: لا يوجد — بحث `qrcode|QRCode|qr-code` على الريبو كله = 0 نتائج في الكود (ذِكر توثيقي فقط في docs).

### الملفات

| ملف | نوع | وظيفة |
|---|---|---|
| `lib/auth-roles.ts` | تعديل | مفتاح جديد `users.regenerate_code` في الـunion type + `ADMIN_PERMISSION_KEYS` + `SENSITIVE_ACTIONS` + `ADMIN_PERMISSION_MAP` (owner/admin، sensitive) |
| `app/admin/actions/user-code.ts` | جديد | `regenerateUserPublicCode` — فحص صلاحية + تفريغ العمود (الـtrigger يولّد) + تحقق من الصيغة + audit بـ `action="qr_regenerate"` (PASS/FAIL/BLOCKED) |
| `app/admin/actions/user-code-form-action.ts` | جديد | غلاف form: الهوية من الجلسة فقط + redirect برسالة (نفس نمط ai-models-form-action) |
| `app/admin/users/[id]/page.tsx` | جديد | صفحة تفاصيل المستخدم: البيانات + الكود + QR (SVG inline + تحميل) + زر توليد/إعادة توليد محكوم |
| `app/admin/users/page.tsx` | تعديل | كود المستخدم في نتائج البحث بقى رابط لصفحة التفاصيل |
| `app/u/[code]/page.tsx` | تعديل | عرض QR عام **قراءة-فقط** (بلا أي زر توليد/تعديل) + تحميل SVG |
| `db/10-user-code-regenerate-permission.sql` | جديد | **#10 — يحتاج تشغيل يدوي** (idempotent): صف مرجعي للمفتاح الجديد في `admin_permission_keys` |
| `package.json` / `package-lock.json` | تعديل | +`qrcode`، +`@types/qrcode` (dev) |

### التحقق

- `npx tsc --noEmit` → **PASS** (exit 0).
- `npx next build` (ببيئة الإنتاج الحقيقية) → **PASS**: `Compiled successfully in 32.0s` + `BUILD_OK`، والراوتات الجديدة ظاهرة في مخرجات البناء: `/admin/users`، `/admin/users/[id]`، `/u/[code]`.
- ⚠️ **حدود التحقق بصراحة**: سلوك الـtrigger على `UPDATE ... = null` مُتحقق منه من تعريفه المؤكد في الـDB الحية (`BEFORE INSERT OR UPDATE` يملأ NULL/'') — لم يُنفَّذ توليد حقيقي على بيانات إنتاج تحوّطًا. أول استخدام فعلي من واجهة الأدمن هيظهر كـ PASS في `audit_log` ويأكد السلسلة كاملة end-to-end.
- دفع Git: كود المرحلة 3 في commit **eb65ab3** (مؤكد بـ rev-parse + ls-remote وقت الدفع)، ثم commit توثيقي لاحق **7eea685** — الـtip النهائي المؤكد على `origin/progress-experience` هو **7eea685** (rev-parse + ls-remote متطابقان). ملاحظة تشغيلية: الدفع تم عبر `git push origin HEAD:progress-experience` لأن فرع `progress-experience` المحلي مسحوب في مسار تاني (`C:/Desktop/...`) وقديم — الدفع المباشر باسم الفرع كان هيتحقق من المرجع المحلي القديم، فالمسار الصريح HEAD→remote هو الآمن.

