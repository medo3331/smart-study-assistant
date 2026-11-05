# Academic Workspace — Final Schema Hardening Review (Read-only)

## 1. Cross-user relationship protection

### Verified nullability
- `materials.user_id`: NOT NULL (`db/pages.sql`).
- `lectures.user_id`: NOT NULL (`db/14-lectures.sql`).
- `workspace_subjects.user_id`: NOT NULL (proposed).

### Composite FK strategy
To prevent cross-user links at DB level:
1. `workspace_subjects` must have `UNIQUE (id, user_id)` (composite unique).
2. `lectures` must have `UNIQUE (id, user_id)` (composite unique) — add if not present.
3. `materials` FK to subjects:
   `FOREIGN KEY (subject_id, user_id) REFERENCES workspace_subjects(id, user_id) ON DELETE SET NULL`
   - Nullable `subject_id` allowed; when null, FK not enforced.
   - When set, both subject_id and user_id must match a workspace_subjects row.
4. `materials` FK to lectures:
   `FOREIGN KEY (lecture_id, user_id) REFERENCES lectures(id, user_id) ON DELETE SET NULL`
   - Same nullable handling.

This ensures DB rejects cross-user relationships even if app checks are bypassed.

### RLS changes
- No new RLS needed beyond owner-only policies on workspace_subjects.
- Existing lectures/materials policies already owner-scoped.
- Ensure UPDATE paths validate ownership (app-level + composite FK).

## 2. Subject uniqueness

Proposed strategy:
- Normalize name: `lower(trim(name))`.
- Use a partial unique index with NULLS NOT DISTINCT (PostgreSQL 15+):
```
CREATE UNIQUE INDEX workspace_subjects_unique_context
ON workspace_subjects (user_id, lower(trim(name)), stage, curriculum, grade_or_year, specialization)
NULLS NOT DISTINCT;
```
- Behavior: NULL values treated as equal (no duplicate contexts with nulls).
- Compatibility: requires PG 15+. If older, use expression index with COALESCE sentinels.
- Assumption: Supabase PG version >= 15 (verify before migration).

## 3. Lecture-material consistency

Requirement: if a material links to a lecture, both must share the same subject (when subject present).

- Simple FK cannot enforce this (cross-column constraint across tables).
- Option A: DB trigger on materials insert/update: if lecture_id is set, verify lectures.subject_id matches materials.subject_id (or both null).
- Option B: Allow nullable and validate in app; accept eventual inconsistency risk.
- Recommendation: Add a BEFORE INSERT/UPDATE trigger on materials for strict consistency, since legacy records are nullable and trigger can skip nulls.

## 4. Catalog compatibility

- `university_subjects` is public read-only; `catalog_subject_id` FK optional with ON DELETE SET NULL.
- Basic/secondary subjects can have null catalog_subject_id.
- Postgraduate subjects not blocked (no catalog requirement).
- Deleting catalog entry sets null, does not delete workspace subject.

## 5. Inbox and indexing

Recommended indexes:
- `workspace_subjects`: (user_id, created_at desc).
- `lectures`: (user_id, subject_id, created_at desc) — composite for subject listing; existing (user_id, created_at desc) covers inbox.
- `materials`: (user_id, subject_id, created_at desc), (user_id, lecture_id).
- Partial index for inbox optional:
  `CREATE INDEX materials_inbox_idx ON materials (user_id, created_at desc) WHERE subject_id IS NULL;`
  Justified only if inbox queries are frequent and table large; otherwise existing index suffices.

## 6. Migration order and rollback

Order:
1. Create workspace_subjects + unique (id,user_id) + indexes.
2. Add unique (id,user_id) to lectures if missing.
3. Add nullable subject_id to lectures/materials + nullable lecture_id to materials.
4. Add composite FKs.
5. Add subject uniqueness index.
6. Add trigger for lecture-material consistency.
7. Add optional tables (deferred).

Rollback: reverse order; dropping columns removes new links but legacy data intact.

## 7. Existing-data compatibility risks

- Existing lectures/materials have null subject_id → inbox (expected).
- Unique (id,user_id) on lectures: id already pk; adding composite unique is safe (no duplicates because id unique).
- workspace_subjects empty initially → no FK violations.

## 8. Final verdict

**READY FOR MIGRATION DRAFT** — all hardening items addressed with concrete definitions. Need approval on optional tables deferral (already approved) and PG version check. No migration written or executed.
