# Magicly Admin Control Center — Comprehensive Audit Report

**تاريخ الفحص:** 2026-10-25  
**الفرع:** `cline/47234`  
**HEAD:** `54fabe6cf2f0ee76da1b6f78fc3710d5fc3cb7e9`  
**مسار المستودع:** `C:\Users\hp\.cline\worktrees\47234\smart-study-assistant`  
**اسم المشروع (Supabase):** `Project1` (`lgaqgkihhmedtdzcgpnc`, eu-west-3)

## 1. Git status (غير متغيّر)

```text
## cline/47234
 M app/dashboard/components/NavRail.tsx
 M app/dashboard/components/nav-config.ts
 M app/dashboard/page.tsx
 M app/dashboard/workspace/page.tsx
```

## 2. حدود الفحص

- Read-only فقط. لم تنفذ migrations أو تغييرات بيانات أو إرسال بريد.
- فحص الكود (app/lib/db) والـDB (Supabase read-only).
- لم تُكشف أسرار.

## 3. خريطة معمارية (تدفق البيانات)

Client → Next.js Server Components/Actions → getAdminContext/requireAdminPermission → Supabase (anon + service_role) + Postgres → pg direct (DATABASE_URL) للتحليلات.

**مصادر الحقيقة:**
- المستخدم: `profiles` + Supabase Auth
- الخطة/الاشتراك: `entitlements(kind='plan')` + `subscription_activations` + `subscription_plans`
- AI usage/credit: `ai_credit_ledger` + `reserve_ai_credit`/`refund_ai_credit`
- نماذج AI: `ai_models` + `MODEL_REGISTRY` (code)
- صلاحيات Admin: `site_admins` + env Owner + `admin_permission_keys`
- Audit: `audit_log` (service_role writes)

## 4. صفحات Admin

| المسار | الصلاحية | الحالة |
|---|---|---|
| `/admin` | users.read | Exists |
| `/admin/users` | users.read | Exists (بحث/فلاتر/حظر) |
| `/admin/users/[id]` | users.read | Exists (read-only consumption) |
| `/admin/subscriptions` | subscriptions.manage | Exists (تفعيل يدوي) |
| `/admin/plans` | plans.manage | Partial (قراءة فقط) |
| `/admin/models` | models.manage | Exists (تفعيل/أولوية/حد يومي) |
| `/admin/rewards` | rewards.manage | Exists |
| `/admin/audit-log` | audit.read | Exists (فلاتر+pagination) |
| `/admin/files` | files.moderate | Exists |
| `/admin/settings` | admins.manage | Partial |

## 5. مصدر بيانات المستخدمين

- `profiles` (35 صفًا) + Supabase Auth.
- `display_name`, `email`, `created_at`, `persona`, `role`, `public_user_code`, `is_banned`, `banned_at`, `ban_reason`, `credits` (integer) موجودة.
- **ملاحظة:** `profiles.credits` موجود، لكن مصدر الحقيقة للرصيد هو `ai_credit_ledger`، وليس `profiles.credits` (تعارض).
- `email` يُجلب via service client في `searchUsers` (server-side).
- `user_codes` مرتبط.
- `entitlements` يحدد الخطة/التجربة.
- `subscription_activations` يحدد تواريخ الاشتراك.

### جدول Fields (User Directory)

| Field | Current source | Available? | Current UI | Missing work | Security notes |
|---|---|---|---|---|---|
| id | profiles.id | Yes | Yes | — | service-role read |
| display_name | profiles.display_name | Yes | Yes | — | — |
| email | profiles.email | Yes | Yes | — | server-side only |
| created_at | profiles.created_at | Yes | Yes | DB pagination (limit 50) | — |
| persona/role | profiles | Yes | Yes | — | — |
| public_user_code | profiles | Yes | Yes | — | — |
| is_banned/banned_at/ban_reason | profiles | Yes | Yes | — | service-role writes |
| plan_key | entitlements (derived) | Yes | Yes (free/premium/trial) | pro/ultra not shown in directory | — |
| on_trial | entitlements metadata | Yes | Yes | — | — |
| AI credits balance | ai_credit_ledger sum(delta) | Yes (user detail) | Yes | directory doesn't show | — |
| messages count | ai_credit_ledger reason=ai_reserve | Yes | Yes | — | — |
| files count/bytes | files.profile_id | Yes | Yes | — | — |
| active subscription | subscription_activations | Yes | Yes | — | — |
| last activity | NOT reliable | No (ai_operations empty) | N/A | Needs instrumentation | — |
## 6. صلاحيات Admin — Permission Matrix

**المصادر:** `lib/auth-roles.ts`, `lib/admin/auth-check.ts`, `admin_permission_keys`, `site_admins`, env `OWNER_EMAIL`.

| Operation | Page/API | Required permission | Server-side check | Audit log | Finding |
|---|---|---|---|---|---|
| Admin layout access | `/admin/*` | role from DB/env | Yes | No | Good |
| Page access | each page | `requireAdminPermission` | Yes | No | Good |
| Users search | `searchUsers` | implicit (page) | Service client; no permission re-check inside action | No | Page guards; action itself not permission-checked |
| Ban/unban | `banUser/unbanUser` | `users.ban`/`users.unban` | Yes | Yes (PASS/FAIL/BLOCKED) | Good |
| Subscription activate | `activateSubscription` | Owner only | Yes | Yes | Good |
| Extend subscription | `extendSubscription` | Owner only | Yes | Yes | Good |
| Models toggle/priority/limit | ai-models actions | `models.manage` | Yes | Yes | Good |
| Plans read | `/admin/plans` | `plans.manage` | Yes | No | Read-only |
| Billing settings save | `updateBillingSettings` | **BUG:** accepts any user with entitlement `premium` | Weak | Unknown | Security gap (documented) |
| Manage admins | `/api/admin/manage-roles` | `admins.manage` (Owner) | Yes | Yes | Good |
| Audit log read | `/admin/audit-log` | `audit.read` | Yes | N/A | Good |
| Add credits | `/api/admin/add-credits` | Admin | Yes (claimed) | Ledger reason=admin_grant | Need verify permission code |

**Permission keys (from code):**  
`users.read`, `users.ban`, `users.unban`, `users.regenerate_code`, `plans.manage`, `trial.manage`, `models.manage`, `rewards.manage`, `admins.manage`, `files.moderate`, `audit.read`, `subscriptions.manage`.

## 7. قاعدة البيانات (relevant tables)

| Table | Rows | Notes |
|---|---:|---|
| profiles | 35 | user source |
| subscription_plans | 3 | free/pro/ultra |
| entitlements | 2 | plan rows only |
| subscription_activations | 2 | manual activations |
| subscription_quotas | 0 | unused in runtime |
| ai_models | 12 | runtime state |
| ai_credit_ledger | 461 | credit truth |
| ai_operations | 0 | no usage analytics recorded currently |
| app_settings | 2 | billing flags |
| announcement_email_campaigns | 5 | campaigns exist |
| announcement_email_recipients | 5 | recipients exist |
| runtime_error_events | 0 | no errors recorded |
| audit_log / admin_audit_log | ? | audit trail |

**RLS:** enabled on sensitive tables; admin reads via service_role or direct PG (`DATABASE_URL`).  
**Indexes:** not fully verified; user search uses `limit 50`, `order created_at desc`. Need verify indexes on `profiles.created_at`, `email`, `public_user_code`, `ai_credit_ledger.user_id/created_at`, `entitlements.user_id`.

## 8. مصدر الحقيقة للاشتراكات/الخطط/التجربة

- **Plan source:** `subscription_plans` (free/pro/ultra; limits: messages_per_2h, uploads_daily, max_file_size_mb, file_types, video_audio_exclusive, trial_days, is_active).
- **User plan entitlement:** `entitlements(kind='plan', value='premium'|'free'?, metadata.source='premium_trial_0_5')`.
- **Manual activation:** `subscription_activations` (user_code/user_id, plan_key, duration_days, activated_by, note, created_at, revoked_at, revoked_by).
- **Quota tracking:** `subscription_quotas` (messages_24h, uploads_today, last_reset_at) — **0 rows**, not used by unified-ai (gap).
- **Free trial 7 days?** `subscription_plans.trial_days=0` in DB; trial represented by entitlement metadata `premium_trial_0_5`. Exact trial enforcement **Needs verification** (economy-phase-0-5-trial-atomic.sql not fully read).
- **Post-expiry behavior:** entitlements filter `expires_at > now()`; activation expiry computed in code from `duration_days`. No automatic downgrade job observed (**Needs verification**).
- **Conflicts:** `profiles.credits` duplicates ledger; entitlements vs `subscription_activations` can diverge (extend updates entitlement best-effort).

## 9. Credits / Usage / Limits

### Truth sources
- **Balance:** `SUM(ai_credit_ledger.delta)` per user.
- **Reserve:** `reserve_ai_credit` (server-generated refId `ai_req:<uuid>`).
- **Refund:** `refund_ai_credit` (best-effort on failure).
- **Usage:** `ai_credit_ledger.reason='ai_reserve'` (1 request = 1 credit).
- **Rate limits:** computed from `ai_credit_ledger` (sliding window) — constants in `lib/ai/rate-limit.ts`.
- **Subscription quota:** `checkSubscriptionQuota` (fail-open) — **not called in unified-ai** (gap).

### Defects (confirmed)
1. `FREE_TEXT_LIMIT = 30` in code vs DB `messages_per_2h = 20` (mismatch).
2. `subscription_quotas` never used in unified-ai (0 rows).
3. Model access hardcoded (`FREE_MODELS`/`GATED_MODELS`) instead of DB-driven.
4. Premium detection inconsistent: rate limit uses `has_entitlement` (any premium) vs gated models use `advanced-study` feature.
5. Refund best-effort; race condition in window enforcement.
6. `ai_operations` empty → model daily limits (`usedToday`) always 0; analytics missing.
7. `profiles.credits` duplicate source of truth.

## 10. User detail page (proposed sections)

1. **Overview:** name, email, created_at, persona/role, banned status, last activity (Unavailable — needs instrumentation).
2. **Plan:** entitlement value, trial flag, expires_at; latest activation (plan_key, duration, created_at, note, activated_by); computed expiry.
3. **Usage:** files count/bytes; AI messages (reserve count); subscription quota used/limit (currently 0/not tracked).
4. **Credits:** balance (sum delta); recent ledger entries (reserve/refund/admin_grant).
5. **Activity:** ai_operations (currently empty → Needs instrumentation); runtime errors (0 rows).
6. **Emails:** campaign/recipient status (tables exist, but no admin UI/API in code → Missing).
7. **Admin audit:** audit_log filtered by resource_id/user.

## 11. Email Center (Resend)

- **Tables exist:** `announcement_email_campaigns`, `announcement_email_recipients`, `announcements`, `announcement_reads`.
- **No code references** to campaign tables (search returned none) → **Email Center UI/API Missing**.
- Resend used only in `app/api/feedback/route.ts` (feedback emails).
- Supabase Auth email via SMTP (Resend) documented in `docs/auth-google-setup.md`.
- **No welcome email automation** found.
- **Idempotency/delivery tracking:** tables have status/counts, but no server code uses them → Needs implementation.
- **Accepted vs delivered:** Resend `accepted` ≠ delivered; webhook handling not found → Missing.

## 12. Analytics & System Health

- `lib/admin/overview.ts`: users, premium, trials, activations by plan, files today/week, messages today.
- `lib/admin/ai-overview.ts`: AI reserve counts (total/24h/3h), super/ultra counts, entitlements.
- `lib/admin/economy-overview.ts`: coins ledger/wallets.
- `runtime_error_events`: 0 rows (table exists; instrumentation maybe not wired).
- `magicly_incidents`: 1 row.
- Provider health: `lib/ai/health.ts` (config + runtime stats).
- **Limits:** AI ops empty; no model usage analytics; no active user definition (needs instrumentation).

## 13. Function Status Matrix

| Function | Status |
|---|---|
| Admin RBAC (server-side) | Exists |
| User directory search/filter/ban | Exists |
| User detail read-only analytics | Partial |
| Subscription manual activation/extend | Exists |
| Plans read-only | Partial |
| Plans editable + billing save | Broken/Weak (permission bug) |
| Models enable/priority/limit | Exists |
| AI credit guard/reserve/refund | Exists |
| Subscription quota enforcement | Missing (unused) |
| Model access DB-driven | Missing (hardcoded) |
| Email Center (campaigns/recipients) | Missing |
| Welcome email automation | Missing |
| Runtime error reporting | Partial (table exists, 0 rows) |
| AI operations analytics | Broken/Empty (0 rows) |
| User create/invite | Missing |
| User delete | Missing |
| Email change flow | Missing |
| Per-user limits override | Missing |

## 14. Security & Privacy Risks (severity)

1. **High:** `updateBillingSettings` accepts any user with `premium` entitlement (documented gap).
2. **High:** `profiles.credits` duplicate source of truth vs ledger (risk of inconsistency).
3. **Medium:** Sliding window race condition under concurrency (no atomic enforcement).
4. **Medium:** Refund best-effort; failed refunds may not be retried.
5. **Medium:** `ai_operations` empty → model daily limits not enforced; analytics blind.
6. **Medium:** No Email Center implementation despite tables; potential orphaned campaign data.
7. **Low:** Search limit 50; no DB pagination for users (acceptable for now).
8. **Low:** Plan filters in directory derive `plan_key` only free/premium/trial, not pro/ultra.

## 15. Duplicate/Conflicting Sources

- `profiles.credits` vs `ai_credit_ledger` sum.
- `subscription_plans.messages_per_2h` (20) vs code `FREE_TEXT_LIMIT` (30).
- `subscription_quotas` vs rate-limit ledger (two tracking systems).
- `entitlements` vs `subscription_activations` (manual activations may not update entitlements atomically; extend updates best-effort).
- `MODEL_REGISTRY` (code) vs `ai_models` (DB) (some fields DB-driven, access hardcoded).

## 16. Proposed Design (reuse existing)

- **Reuse:** `ai_credit_ledger`, `reserve_ai_credit`, `refund_ai_credit`, `subscription_plans`, `entitlements`, `has_entitlement`, `ai_models`, admin RBAC/audit.
- **Do not create** parallel credit/plan tables or store credits in profiles.
- **Minimal changes:**
  1. Extend `subscription_plans` with price/currency/credit fields (admin-configurable pricing).
  2. Extend `ai_models` with credit cost + plan/entitlement availability (or plan-model mapping table).
  3. Fix `updateBillingSettings` permission (owner-only + audit).
  4. Add concurrency-safe window enforcement (atomic reserve + count).
  5. Wire `checkSubscriptionQuota` into unified-ai (or remove if redundant).
  6. Implement Email Center using existing campaign tables + Resend + webhooks.
  7. Instrument `ai_operations` (ensure writes happen) and runtime errors.
  8. Add user lifecycle actions (create/invite via Supabase Admin API, delete with safeguards) with audit.

## 17. Phased Implementation Plan

- **Phase 0:** Audit & design (done).
- **Phase 1:** User directory (search/filter/sort/pagination) — partially done; improve DB-level pagination and pro/ultra filters.
- **Phase 2:** Minimal migration (price/credit/availability columns) + idempotency tests.
- **Phase 3:** Admin plan/model editors (server actions + audit) — remove hardcoded fallbacks only after DB authoritative.
- **Phase 4:** Admin lifecycle controls (user create/invite, subscription manage, limits) with permissions + audit.
- **Phase 5:** Email Center (recipient selection, preview, campaign log, delivery status, welcome email).
- **Phase 6:** Platform analytics & system health (AI usage by user/model/provider, failures, campaign results).

## 18. Acceptance Tests (proposed)

- Non-admin cannot access admin APIs (401/403).
- Limited permission does not grant others.
- User search/sort/pagination correct.
- Credit balance = sum ledger; no duplicate reserve/refund.
- Provider failure triggers refund (idempotent).
- Admin UI changes do not alter limits unless DB updated.
- No duplicate email sends; accepted vs delivered distinguished.
- Campaign errors handled per recipient.
- No secrets in logs.
- Existing auth/subscription/AI flows not broken.

## 19. Files Expected to Change (future, not now)

- `lib/ai/rate-limit.ts`, `lib/ai/model-access.ts`, `lib/ai/quota-check.ts`
- `app/api/unified-ai/route.ts` (+ other AI routes)
- `app/admin/plans/page.tsx`, `app/admin/models/page.tsx`
- `app/admin/actions/*` (new server actions)
- `db/*` (minimal migrations)
- `app/api/admin/*` (email center endpoints)
- `lib/admin/*` (analytics)

## 20. Open Questions for Owner

1. Should pricing be stored in `subscription_plans` (extend) or a separate `pricing_plans` table? (Recommend extend existing.)
2. Is a 7-day trial actually required? Current `trial_days=0` in DB; trial represented by entitlement metadata.
3. Should `profiles.credits` be removed/deprecated in favor of ledger? (Recommend deprecate, read from ledger.)
4. Should subscription quota (messages_24h) replace or complement rate-limit ledger? (Recommend single source: ledger + plan config.)
5. Is welcome email required now? (No implementation exists.)
6. Which AI routes need quota enforcement? (unified-ai only observed; others need verification.)

## 21. Verification Gaps

- Did not read all AI routes (`/api/chat`, `/api/ai`, `/api/generate-plan`, `/api/generate-slides`) fully.
- Did not verify DB indexes or RLS policies in detail (table list + columns only).
- Did not verify trial enforcement logic (economy-phase-0-5-trial-atomic.sql not read).
- Did not verify `add-credits` permission code (file not read).
- `ai_usage_events` schema not inspected.
- No tests executed (read-only constraint).

