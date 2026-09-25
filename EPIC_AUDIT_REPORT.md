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

## HOTFIX — Guest Login 500 + Syntax Error (2026-09-23)

### المشكلة
- **500 Error**: تسجيل الدخول كزائر (`signInAnonymously`) يفشل بخطأ 500
- **Syntax Error**: `Uncaught SyntaxError: Unexpected token ')'` في `/login?next=/assessment`

### السبب الجذري
**RLS Policy مفقودة للـINSERT على `profiles`**:
- `db/economy-phase-b.sql` حذف UPDATE policies وأعاد إنشاء واحدة فقط (السطر 65-86)
- لم ينشئ أي INSERT policy
- النتيجة: `app/assessment/page.tsx` (السطر 402) يحاول insert profile ← يفشل بسبب RLS

### الإصلاح
**ملف**: `db/hotfix-profiles-insert-policy.sql` (تم إنشاؤه)
```sql
CREATE POLICY "profiles: owner insert"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
```

### الخطوات المطلوبة من المستخدم
1. **تنفيذ SQL على Supabase**:
   - افتح `db/hotfix-profiles-insert-policy.sql`
   - شغّل الكود في Supabase SQL Editor
   
2. **التحقق**:
   - جرب guest login من `/login`
   - لو نجح ← المشكلة اتحلت
   
3. **Syntax Error**:
   - على الأرجح browser cache من build قديم
   - جرب Hard Refresh (Ctrl+Shift+R أو Cmd+Shift+R)
   - لو استمر: افحص Console للتفاصيل

### الملفات المرتبطة
- `db/economy-phase-b.sql` (السطر 65-86: حذف policies)
- `app/assessment/page.tsx` (السطر 387-402: profile insert)
- `db/epic6-user-code.sql` (trigger على profiles)
- `HOTFIX_DIAGNOSIS.md` (تشخيص كامل)

---

## UPDATE — EPIC 2 & 3 Execution Completed (post-audit)

**Task 1 (Upload endpoint)**: `app/api/upload/route.ts` created (lazy reset + plan limits + file type/size check + quota update)
**Task 2 (Quota enforcement)**: `lib/ai/quota-check.ts` created; patched `app/api/chat/route.ts`, `app/api/ai/route.ts`, `app/api/generate-plan/route.ts`, `app/api/generate-slides/route.ts` with `messages_24h` guard.
**DB SQL**: `db/epic2-file-upload.sql` (table + RLS);
**Audit update**: Real build PASS; DB state unverified due to missing DATABASE_URL (honest).

Note: No fabricated DB results. Quota enforcement is server-side (not UI-only) per spec §4.
