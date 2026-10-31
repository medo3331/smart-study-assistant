# Academic Workspace — Schema & RLS Architecture Review (Read-only)

## 1. Existing schema inventory

### Verified tables
- `public.materials` (`db/pages.sql`): id uuid pk, user_id uuid fk auth.users, title text not null, file_type, file_size, content text default '', summary, note, created_at, updated_at. RLS owner-only (select/insert/update/delete). Index `materials_user_created_idx (user_id, created_at desc)`.
- `public.lectures` (`db/14-lectures.sql`): id uuid pk, user_id uuid not null fk auth.users, title, original_filename, storage_path, source_type check, mime_type, file_size, duration_seconds, language, transcript_text, transcript_data, transcription_model/provider, status check, created_at, updated_at. RLS owner full access (for all). Index `lectures_user_created_idx (user_id, created_at desc)`. Unique (user_id, storage_path).
- `public.university_subjects` (`db/phase-2.2-university-academic-subjects.sql`): public catalog, read-only (RLS select true, write false). Verified academic subjects only.
- `public.study_configs`/`study_days`: course plans, user-owned (verified via app code).
- `chat_conversations`/`chat_messages`: user-owned (verified in route).

### Application dependencies
- `lib/pages-data.ts`: fetchMaterials/insertMaterial/updateMaterial/deleteMaterial.
- `lib/ai/lecture-store.ts`: saveLectureForCurrentUser.
- `app/lectures/page.tsx`, `app/dashboard/workspace/page.tsx`.
- Workspace Source Resolver queries lectures/materials by user_id.

## 2. Proposed minimal schema (layer, not parallel system)

Create ONE user-owned table for workspace subjects:

```
workspace_subjects (
  id uuid pk,
  user_id uuid not null fk auth.users,
  name text not null,
  stage text not null check (basic|secondary|university|postgraduate),
  curriculum text null,
  grade_or_year text null,        -- e.g. "Year 2" / "Grade 10"
  specialization text null,      -- e.g. "Dentistry"
  catalog_subject_id uuid null fk university_subjects(id) on delete set null,
  created_at, updated_at
)
```

Extend existing tables (nullable, backward compatible):
- `lectures.subject_id uuid null fk workspace_subjects(id) on delete set null`
- `materials.subject_id uuid null fk workspace_subjects(id) on delete set null`
- `materials.lecture_id uuid null fk lectures(id) on delete set null`

Optional (defer):
- `workspace_questions` (id, user_id, subject_id, lecture_id null, kind, payload jsonb, created_at)
- `workspace_notes` (id, user_id, subject_id, lecture_id null, content, created_at)

Rationale: extend existing tables instead of duplicating content. Link by IDs only.

## 3. Relationship diagram

```
auth.users
  └── workspace_subjects (user_id)
        ├── lectures.subject_id
        ├── materials.subject_id (+ materials.lecture_id)
        ├── workspace_questions.subject_id/lecture_id
        └── workspace_notes.subject_id/lecture_id
```

## 4. Legacy inbox query

```sql
-- materials unorganized
SELECT id, title, file_type, created_at
FROM materials
WHERE user_id = :uid AND subject_id IS NULL
ORDER BY created_at DESC;

-- lectures unorganized
SELECT id, title, original_filename, status, created_at
FROM lectures
WHERE user_id = :uid AND subject_id IS NULL
ORDER BY created_at DESC;
```

- Includes failed/processing/empty records (status shown).
- No auto-classification; Magic suggestions are UI-only, require confirmation.
- No duplicate entries (single source per table).

## 5. RLS policy matrix

For `workspace_subjects` and optional tables:
- SELECT: `auth.uid() = user_id`
- INSERT: `WITH CHECK (auth.uid() = user_id)`
- UPDATE: `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
- DELETE: `USING (auth.uid() = user_id)`

For `lectures`/`materials` subject_id updates:
- Existing owner policies already cover; add FK constraint only.
- Linking protection: application must verify subject ownership before setting subject_id (or rely on FK + RLS on subjects). Recommendation: enforce in app + FK; no SECURITY DEFINER needed.

IDOR risk: low if app validates ownership; FK alone not sufficient for cross-user link prevention at DB level unless trigger. Recommend app-level validation + RLS.

## 6. Migration strategy

1. Create `workspace_subjects` (nullable FKs not needed here).
2. Add nullable `subject_id` to lectures, materials.
3. Add nullable `lecture_id` to materials.
4. Create optional tables.
5. Add indexes.
6. No data backfill; legacy records remain null (inbox).
7. Rollback: drop columns/tables (data in new tables lost, but legacy untouched).

Compatibility: existing APIs/pages work because columns nullable and no query changes required initially.

## 7. Performance/index recommendations

- `workspace_subjects`: index `(user_id, created_at desc)`.
- `lectures`: add `(user_id, subject_id, created_at desc)` (partial where subject_id not null optional).
- `materials`: add `(user_id, subject_id, created_at desc)` and `(user_id, lecture_id)`.
- Inbox queries use existing `(user_id, created_at desc)` indexes.
- Pagination: limit/offset or cursor on created_at + id.

## 8. Compatibility risks

- `materials.title` NOT NULL: OK.
- `lectures` status check: unaffected.
- Upload/transcription flows: unaffected (no required subject_id).
- Unified AI resolver: optional subject filtering later.

## 9. Open decisions

1. Should `workspace_subjects` allow duplicate names per user? (Recommend unique per user+name+stage.)
2. Should `catalog_subject_id` link to `university_subjects`? (Recommended optional.)
3. Should optional tables be in this migration or deferred? (Recommend defer to reduce risk.)

## 10. Verdict

**READY AFTER SPECIFIC DECISIONS** — schema is backward-compatible and minimal. Need approval on open decisions (especially #3) before drafting migration. No implementation performed.
