# University Hub — Audit + Technical Design + Implementation Plan

> **Status:** AUDIT ONLY — no files modified, no migrations run.
> **Project:** smart-study-assistant (Magicly) — branch `cline/3126f`
> **DB project:** `lgaqgkihhmedtdzcgpnc` (eu-west-3, ACTIVE_HEALTHY, PG 17.6)
> **Date:** 2026-10-31

## 1. Current-state audit

### 1.1 Database (remote Supabase)

Catalog-related tables that already exist (verified via `information_schema`):

| Table | Rows | Purpose |
|---|---|---|
| `universities` | 1 | `Cairo University (CAU)` |
| `university_faculties` | 1 | `Faculty of Engineering (ENG)` under CAU |
| `university_departments` | 1 | `Computer Engineering (CSED)` under ENG |
| `university_levels` | 4 | Year 1–4 (L1–L4) |
| `university_semesters` | 2 | S1, S2 |
| `university_subjects` | 3 | Verified CU CCEc subjects (CS505/CS301/CS220) |
| `university_resources` | 0 | Published resources per subject |
| `workspace_subjects` | 0 | Per-user workspace subjects (personal) |
| `materials` | 19 | User files (linked to workspace_subjects) |
| `lectures` | 22 | User lectures (linked to workspace_subjects) |

`workspace_subjects` schema (verified):
- `id, user_id, name, stage (basic/secondary/university/postgraduate), curriculum, grade_or_year, specialization, catalog_subject_id (FK → university_subjects.id), created_at, updated_at`
- FKs: `materials` and `lectures` reference `(subject_id, user_id)` → `workspace_subjects(id, user_id)`; `catalog_subject_id` → `university_subjects.id`.

Key observation: the DB **already implements the 3-level separation** the user asked for:
1. **Academic Catalog** = `universities → university_faculties → university_departments → university_subjects` (shared, admin-managed, RLS read-only to anon/authenticated).
2. **Student Academic Workspace** = `workspace_subjects` (per user, FK to catalog via `catalog_subject_id`).
3. **Learning Content** = `materials`, `lectures`, `university_resources`.

### 1.2 Code (app/)

- `app/university/page.tsx` — "University Curriculum" page. Loads profile → builds `EducationContext` → if full university context, queries `university_subjects` by university/faculty/department/level/semester. Shows empty/fallback states; never fabricates.
- `app/university/[subjectId]/page.tsx` — subject detail; loads subject + published `university_resources`.
- `lib/education/context.ts` — `getEducationContext` (profile → context) + `getAvailableSubjects` (school branch via curricula/subjects; university branch via university_subjects).
- `app/api/university/goal/route.ts` — uses university_subjects names as subject hints.
- `app/admin/*` — admin panel with nav in `lib/admin/nav.ts` (8 items). Permissions in `lib/auth-roles.ts` (`AdminPermissionKey` union, `ADMIN_PERMISSION_MAP`).

### 1.3 Admin panel

- Auth: `getAdminContext` + `requireAdminPermission` per page; owner/admin/support roles.
- Nav is a single source (`ADMIN_NAV`) consumed by layout + home + quick-nav.

## 2. Technical design (part A)

### 2.1 Core principle: reuse, don't duplicate

- Keep `university_subjects` as the course/subject catalog. Do NOT repurpose it as "major".
- Introduce a new generic Academic Catalog layer: `academic_faculties` + `academic_majors`, shared, admin-managed, with `content_status` enum (`ready`, `preparing`, `coming_soon`).
- Link `university_subjects` -> `academic_majors` optionally via nullable `major_id` (existing 3 rows stay intact).
- Add optional `major_id` to `workspace_subjects` so a student's workspace ties to a chosen major even before courses exist.

### 2.2 Proposed schema (new tables — applied later, NOT now)

academic_faculties: id, slug UNIQUE, name_ar, name_en, icon, sort_order, is_visible, timestamps.
academic_majors: id, faculty_id FK, slug, name_ar, name_en, description_ar, content_status CHECK, is_visible, merged_into_id, timestamps, UNIQUE(faculty_id, slug).
major_suggestions: id, user_id, faculty_id NULL FK, faculty_name_raw, major_name_raw, university_name, extra_info, status CHECK, reviewed_by, reviewed_at, review_note, linked_major_id, timestamps.
major_suggestion_votes: suggestion_id FK, user_id FK, created_at, PK(suggestion_id, user_id).

Dedup rule: normalize key (lower(trim(major_name_raw)), faculty). If a pending suggestion matches, do NOT create new row — insert a vote (idempotent via PK). Admin shows vote_count = 1 + count(votes).

## 2.5 Admin pages (new, under /admin/catalog)

- /admin/catalog — overview (counts: faculties, majors, pending suggestions, top requested).
- /admin/catalog/faculties — CRUD + visibility + sort order.
- /admin/catalog/majors — CRUD + move faculty + content_status + visibility + merge.
- /admin/catalog/suggestions — review queue: approve/reject/needs_info, edit name, move faculty, merge with existing major, shows vote count.
- /admin/catalog/stats — top requested majors (by vote count).

Pattern: server components + server actions ("use server"), requireAdminPermission, createServiceClient, redirect with success/error query params — identical to app/admin/files.

## 2.6 Student-facing University Hub redesign

Replace the current "subjects only" app/university/page.tsx with a 3-tier hub:
1. Tier 1 — Faculties grid (from academic_faculties where is_visible). Each card -> /university/faculty/[slug].
2. Tier 2 — Majors grid (from academic_majors where faculty_id = ... and is_visible). Each card shows content_status badge. Click -> /university/major/[slug].
3. Tier 3 — Major detail page (/university/major/[slug]):
   - Header: major name + faculty.
   - If content_status = 'coming_soon'/'preparing': show "المحتوى التعليمي قادم قريبًا!" card with what will be available (المواد والمحاضرات / شرح AI / ملخصات / اختبارات) — never an empty page.
   - If ready: list linked university_subjects (via major_id) + materials/lectures of student's workspace.
   - "تخصصك مش موجود؟ اقترح إضافة تخصصك" button -> modal form -> POST /api/university/suggest-major.

Keep existing /university subjects route working for current CAU students (backward compat).

## 2.7 Student suggestion API

- POST /api/university/suggest-major — authenticated. Validates input. Performs dedup normalization + vote logic. Returns { ok, suggestion_id, vote_count }.

## 2.8 Content status on existing subjects

Add nullable major_id uuid FK -> academic_majors.id to university_subjects (nullable, backward compatible). Existing 3 rows get NULL (untouched).

## 2.9 Workspace integration (no auto-move, per prior decision)

- Add nullable major_id uuid FK -> academic_majors.id to workspace_subjects.
- When a student picks a major in the hub, set workspace_subjects.major_id for their workspace subjects (user-confirmed, no auto-move of files).
- Old files remain in Unorganized Files; linking is user-confirmed.

## 3. Implementation phases

| # | Phase | Deliverable | Risk |
|---|---|---|---|
| 01 | Audit (this doc) | Report + design | none |
| 02 | Migration review | Re-check remote migrations + advisors before any DDL | low |
| 03 | DDL migration A | academic_faculties, academic_majors, major_suggestions, major_suggestion_votes + RLS + indexes | medium |
| 04 | DDL migration B | major_id nullable FK on university_subjects and workspace_subjects | low |
| 05 | Seed data | Insert initial faculties + majors via SQL (admin-run, idempotent) | low |
| 06 | Admin permission + nav | Add catalog.manage to auth-roles + nav + DB reference row | low |
| 07 | Admin UI | /admin/catalog/* pages + actions | medium |
| 08 | Student hub UI | New faculty/major pages + coming-soon card + suggestion modal | medium |
| 09 | Suggestion API | /api/university/suggest-major with dedup + votes | medium |
| 10 | Workspace link | major_id on workspace_subjects + user-confirmed linking | low |
| 11 | QA | permissions, dedup, empty states, i18n ar/en, RLS anon tests | — |

### 3.1 Pre-migration checklist (MANDATORY before Phase 03)

- Re-run supabase__list_migrations and supabase__get_advisors (security + performance).
- Confirm no existing table named academic_faculties/academic_majors/major_suggestions (already confirmed absent).
- Confirm university_subjects.major_id and workspace_subjects.major_id do not yet exist (confirmed absent).
- Do NOT re-run or assume "Migration 18/19" — they are not present in remote history; treat as external notes.
- All DDL via apply_migration (not execute_sql), with idempotent CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

## 4. Decisions needed from user before implementation

1. Naming: academic_majors vs majors vs specializations? (Recommend academic_majors.)
2. Faculty list final: user provided 4 priority faculties + 9 additional domains. Confirm whether to seed all 13 as academic_faculties in Phase 05, or start with the 4 priority only.
3. Content status default: new majors default to coming_soon (recommended) so they always show a prepared page, never empty.
4. Suggestion dedup threshold: user mentioned "50 students -> merge". Recommend vote-count display at any count >= 2 (no hard threshold), admin decides.
5. Route strategy: keep /university subjects page as-is and add /university/hub for the new catalog, OR replace /university with hub and move subjects to /university/subjects. Recommend keeping /university as hub and adding /university/curriculum for the existing CAU subjects (backward-compat redirect).
6. Permissions: new catalog.manage owner+admin (recommended) or owner-only? Recommend owner+admin (matches files.moderate pattern).

## 5. What this audit did NOT do

- No file edits, no new files except this report.
- No migrations, no DDL, no data changes.
- No changes to university_subjects, workspace_subjects, materials, lectures, or any existing table.
- Existing Unorganized Files / auto-move rule untouched.

## 6. Recommended next step

After user reviews this report and confirms the 6 decisions in section 4, proceed to Phase 02 (migration review) + Phase 03 (DDL migration A) only, then pause for verification before Phase 04.


### 2.3 RLS policy sketch

- academic_faculties, academic_majors: SELECT for anon+authenticated; writes service_role only.
- major_suggestions: INSERT by authenticated (own row); SELECT own or admin; UPDATE status service_role only.
- major_suggestion_votes: INSERT by authenticated (own).

### 2.4 Admin permission

Add `catalog.manage` to AdminPermissionKey union + ADMIN_PERMISSION_KEYS + ADMIN_PERMISSION_MAP (owner/admin, sensitive) + admin_permission_keys reference row. New nav item `/admin/catalog`.

- No existing "University / Catalog / Majors" admin section.
- No student-suggestion / review workflow tables exist yet (verified: no `major_requests`, `faculty_requests`, etc.).

### 1.4 Migrations

- Remote migrations list (15 entries, latest `expand_support_ticket_categories` 2026-10-29). No "Migration 18/19" referenced anywhere in repo; the user's note refers to external phase numbering. **No migration will be re-run or re-created in this audit.** Any future migration must be reviewed against `supabase__list_migrations` first.

### 1.5 Gaps vs. user's University Hub vision

1. Catalog is **university-specific** (CAU only) and **subject-level** (courses), not **major/faculty-level**. There is no concept of "College/Major" as a browseable entity independent of a specific university.
2. No "coming soon" content-status field on `university_subjects` (only `university_resources.status`).
3. No student suggestion table / review workflow.
4. No admin UI for managing faculties/majors/content status.
5. No de-duplication of repeated suggestions.
6. `workspace_subjects` personal workspace is separate and already correct; must not be touched.
---

## 7. Phase 02 — Migration & Architecture Review (executed)

**Date:** 2026-10-31 (act pass)

### 7.1 Migrations re-check
- Re-ran `supabase__list_migrations` — 15 entries, latest `expand_support_ticket_categories` (2026-10-29). No new migrations since audit. No "Migration 18/19" present in remote history (external notes only). **No migration re-run.**

### 7.2 Advisors re-check
- Security advisor: existing findings only (anonymous-access policies on many tables, leaked-password protection disabled). **No finding references any new academic_* table** (they don't exist yet). New tables will ship with explicit RLS policies (see Migration A).
- Performance advisor: existing findings only (unindexed FKs, duplicate indexes on notes/referrals/user_weaknesses). **No new-table findings.** Migration A adds covering indexes on every FK + unique constraints.

### 7.3 Naming / FK / backward-compat review
- Confirmed absence of `academic_faculties`, `academic_majors`, `university_major_offerings`, `major_suggestions`, `major_suggestion_votes` (none exist).
- Confirmed `university_subjects.major_id` and `workspace_subjects.major_id` do NOT exist yet — Migration A deliberately does **not** add them (deferred to a later phase to keep Phase 03 strictly additive and zero-risk to existing tables). They will be added in a follow-up migration after Phase 03 approval.
- `universities`, `university_departments` already exist → Migration A safely references them.
- `auth.users` exists → suggestions/votes reference it (ON DELETE CASCADE).

### 7.4 Architecture decision — Faculty vs Major vs Department vs Workspace vs Content
To support the case where the same topic is a standalone major in one university
and a track inside another major in a different university, Migration A uses:
- `academic_majors.parent_major_id` + `relation_type` (`standalone`/`track`/`specialization`/`alias`)
  → Cyber Security can be its own major (standalone) OR a track of Computer Science.
- `university_major_offerings` (university × department × major) → a university
  "offers" a generic major through a specific department, without duplicating the catalog.
- Generic catalog (academic_*) is university-independent; university-specific linkage
  lives only in `university_major_offerings` and (later) `university_subjects.major_id`.

### 7.5 Decisions applied (user-approved, 2026-10-31)
1. academic_majors (canonical entity) ✓
2. 13 faculties prepared ✓ (seed data deferred to Phase 05)
3. Default content_status = coming_soon ✓
4. vote_count displayed at >= 2 ✓ (no hard threshold; admin controls merge)
5. /university = Hub; existing subjects move to /university/curriculum ✓ (route changes deferred to Phase 06)
6. catalog.manage for owner + admin ✓ (code changes deferred to Phase 06)

---

## 8. Phase 03 — Migration A (PREPARED, NOT APPLIED)

**File:** `db/university-hub-phase-03-academic-catalog.sql`
**Status:** Prepared only. NOT applied to remote DB. Awaiting explicit approval.

### 8.1 New tables (5)
| Table | Purpose |
|---|---|
| `academic_faculties` | 13 college-level faculties (generic, university-independent) |
| `academic_majors` | Generic majors; supports standalone + track/specialization/alias via parent_major_id |
| `university_major_offerings` | Links generic majors to specific university departments (availability) |
| `major_suggestions` | Student-proposed majors review queue |
| `major_suggestion_votes` | One vote per user per suggestion (dedup) |

### 8.2 Columns of note
- `academic_majors.content_status` CHECK in (`ready`,`preparing`,`coming_soon`), default `coming_soon`.
- `academic_majors.relation_type` CHECK in (`standalone`,`track`,`specialization`,`alias`), default `standalone`.
- `academic_majors.merged_into_id` → supports admin merge of duplicate suggestions.
- `major_suggestions.status` CHECK in (`pending`,`approved`,`rejected`,`needs_info`), default `pending`.

### 8.3 Constraints / indexes
- Unique: `academic_faculties.slug`; `academic_majors (faculty_id, slug)`; `university_major_offerings (university_id, department_id, major_id)`; `major_suggestion_votes (suggestion_id, user_id)`.
- Covering indexes on every FK + status/sort indexes.

### 8.4 RLS policies
- `academic_faculties`, `academic_majors`, `university_major_offerings`: SELECT for anon+authenticated (public read). All writes via service_role.
- `major_suggestions`: INSERT by authenticated where user_id = auth.uid(); SELECT own rows only.
- `major_suggestion_votes`: INSERT by authenticated where user_id = auth.uid().
- Admin reads/writes on suggestions & votes via service_role (consistent with existing admin pattern).

### 8.5 Trigger
- `public.set_updated_at()` (CREATE OR REPLACE, idempotent) + per-table BEFORE UPDATE triggers (guarded).

### 8.6 Safety / rollback
- **Zero changes to existing tables.** Rollback = drop the 5 new tables + trigger function (only if unused) + policies. No data loss risk to existing student content.
- Idempotent: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, policy guards via DO blocks, trigger guards. Safe to re-run.
- NOT applied remotely. No `apply_migration` or `execute_sql` was called.

### 8.7 Static validation
- SQL reviewed for syntax (balanced parentheses, valid CHECK constraints, valid FK references to existing tables).
- No remote execution performed. Phase 04 (apply) is blocked pending explicit approval.

### 8.8 Deferred to later phases (NOT in Migration A)
- `university_subjects.major_id` nullable FK + `workspace_subjects.major_id` nullable FK (Phase 04 follow-up).
- `catalog.manage` permission + admin nav (Phase 06).
- 13-faculty seed data (Phase 05).
- Route changes / hub page (Phase 06).
- Student suggestion API + vote-count display (Phase 07).

---

## 9. Mandatory Stop Point (Phase 03 complete)

Per user authorization, execution stops here. **Do NOT proceed to Phase 04 or apply the migration remotely until explicit approval.**

**Approval checklist for user:**
1. Review `db/university-hub-phase-03-academic-catalog.sql` (complete SQL).
2. Confirm all 5 tables, columns, constraints, indexes (§8.1-8.3).
3. Confirm RLS policies (§8.4).
4. Confirm safety/rollback (§8.6).
5. Reply with explicit approval to apply Migration A to remote DB (Phase 04).

