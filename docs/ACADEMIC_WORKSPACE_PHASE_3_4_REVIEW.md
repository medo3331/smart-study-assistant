# Academic Workspace — Phase 3.4 Final Migration Reconciliation Review

Review-only. No SQL executed. No migration repair. No db push. No history changes.

## 1. Files reviewed
- `db/18-academic-workspace-subjects.sql`
- `db/19-academic-workspace-corrective.sql`
- `docs/ACADEMIC_WORKSPACE_MIGRATION_RECONCILIATION.md`
- `docs/ACADEMIC_WORKSPACE_TEST_ROLLBACK_PLAN.md`

## 2. Migration history strategy comparison

### Approach A — Reconcile migration 18 as baseline, then apply migration 19
- Not safe as written. `db/18-academic-workspace-subjects.sql` lines 72-78 and 103-109 already use column-specific `ON DELETE SET NULL (subject_id)`, while Phase 3.2 found the remote FKs use blanket `ON DELETE SET NULL`. The files are not byte-for-byte equivalent to the remote baseline.
- Re-running migration 18 would also collide with existing tables, constraints, indexes, and triggers because many statements are not fully guarded by existence checks.
- Verdict: reject unless migration 18 is first rewritten to exactly represent the remote baseline.

### Approach B — Create a dedicated baseline/reconciliation migration
- Safest conceptual approach. A new migration should document/normalize the already-existing remote schema without rerunning migration 18.
- It can assert the presence of required objects and apply only normalization needed for migration 19.
- It avoids pretending that the local draft of migration 18 was the exact remote operation.
- Verdict: recommended as the history-facing strategy, paired with migration 19 as the corrective step.

### Approach C — Use Supabase migration repair to mark migration 18 as applied
- Only safe after independently proving every operation in migration 18 matches the remote schema.
- Current evidence does not prove equivalence because the remote FK definitions differ from the local draft.
- Blindly marking migration 18 as applied would hide an untracked schema difference and make future history misleading.
- Verdict: do not use yet.

## 3. Recommended strategy
Create a dedicated reconciliation/baseline migration before or alongside migration 19.

Recommended sequence:
1. Do not execute or repair migration 18.
2. Create a new reconciliation migration that:
   - asserts `workspace_subjects`, composite unique constraints, columns, indexes, triggers, and RLS state exist;
   - records that migration 18 was applied outside Supabase migration history;
   - does not recreate existing objects destructively.
3. Apply `db/19-academic-workspace-corrective.sql` only after the reconciliation baseline is accepted.
4. If Supabase CLI is introduced later, generate a baseline with `supabase db pull`, review it manually, then use `supabase migration repair --status applied <version>` only for a file whose contents exactly match the remote baseline.
## 4. SQL correctness review of migration 19
File: `db/19-academic-workspace-corrective.sql`

- Lines 18-34: ensures composite unique targets exist. This is dependency-safe and required before FK recreation.
- Lines 43-57: drops `lectures_subject_id_fkey` only if present. This is idempotent.
- Lines 63-88: drops and recreates all three composite FKs with:
  - `ON DELETE SET NULL (subject_id)` at lines 70 and 79
  - `ON DELETE SET NULL (lecture_id)` at line 88
  This is PostgreSQL 17-compatible column-specific syntax and prevents nulling `user_id`.
- Lines 95-116: creates/replaces the lecture-to-material sync trigger. The trigger is scoped by `lecture_id = NEW.id` and `user_id = NEW.user_id` at lines 102-103.
- Lines 121-131: intentionally does not force RLS on materials; documents the deferred decision.
- Lines 13-132: wrapped in `begin;` / `commit;`, so a failure rolls back the transaction.
- Drop/recreate ordering is dependency-safe: unique targets are ensured before FKs, and legacy FK is removed before corrective FKs.

## 5. Trigger interaction review
Existing trigger: `materials_lecture_subject_check` (`db/18-academic-workspace-subjects.sql`, lines 138-168).

New trigger: `sync_materials_on_lecture_subject_change` (`db/19-academic-workspace-corrective.sql`, lines 95-116).

- Recursion: not expected. The new trigger updates `materials`, which fires the existing BEFORE trigger on `materials`, but that trigger does not update `lectures`. No cycle is created.
- A -> B: materials linked to the changed lecture are updated to subject B.
- A -> NULL: materials linked to the changed lecture are updated to NULL.
- Delete subject: composite FK sets `subject_id` to NULL on lectures and materials. The new trigger may also propagate the lecture change to linked materials; ownership is preserved because updates are scoped by `user_id`.
- Delete lecture: `materials_lecture_user_fk` sets `lecture_id` to NULL. `user_id` remains unchanged.
- Ownership: all updates are scoped by `lecture_id` and `user_id`, so materials are not reassigned across users.
- Edge case requiring a test database: if multiple materials are linked to one lecture and one material has a manually different `subject_id`, the sync trigger overwrites it to the lecture's new subject. This is consistent with the lecture-material consistency rule but should be tested before production.

## 6. Legacy FK dependency review
- Repository search found no application or migration reference requiring `lectures.subject_id` to reference `university_subjects`.
- `university_subjects` is used for university catalog browsing, not personal Academic Workspace subjects.
- Therefore removal is prepared in migration 19, but final database-side dependency confirmation should still be performed before execution.

## 7. Required SQL corrections
No required SQL corrections identified in migration 19 during this review.

Optional future correction, not included now:
- If production access paths are audited and approved, separately run `alter table public.materials force row level security;`.

## 8. Precise future execution sequence
1. Review `git diff` for all Phase 3.3/3.4 files.
2. Create or approve a reconciliation baseline migration for the untracked remote schema.
3. Run migration 19 on a test/staging database first.
4. Execute validation tests from `docs/ACADEMIC_WORKSPACE_TEST_ROLLBACK_PLAN.md`.
5. Review actual database output and row counts.
6. Only after separate approval, run migration 19 on production.
7. Re-run remote schema verification.

## 9. Pre-production test checklist
- Delete workspace subject: lectures and materials remain; `subject_id` becomes NULL; `user_id` unchanged.
- Delete lecture: linked materials remain; `lecture_id` becomes NULL; `user_id` unchanged.
- Update lecture subject A -> B: linked materials update to B.
- Update lecture subject to NULL: linked materials update to NULL.
- Insert material linked to lecture: consistency trigger accepts valid data and rejects mismatched subject.
- Cross-user linking attempt: composite FK rejects it.
- Existing owner RLS policies remain functional.
- Existing null `subject_id` records remain valid.
- No unexpected row deletions or ownership changes.

## Final verdict
MIGRATION HISTORY STRATEGY UNRESOLVED

