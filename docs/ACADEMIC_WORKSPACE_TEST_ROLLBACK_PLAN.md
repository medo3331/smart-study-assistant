# Academic Workspace — Test, Rollback, and Execution Plan

## Validation tests (run after controlled migration)
1. Delete a workspace subject:
   - Linked lectures keep their rows.
   - Linked materials keep their rows.
   - `subject_id` becomes NULL on both lectures and materials.
   - `user_id` never changes.
2. Delete a lecture:
   - Linked materials keep their rows.
   - `lecture_id` becomes NULL.
   - `user_id` never changes.
3. Update a lecture subject from A to B:
   - Materials linked to that lecture update to B.
   - Unrelated materials remain unchanged.
4. Update a lecture subject to NULL:
   - Materials linked to that lecture update to NULL.
5. Insert a material linked to a lecture:
   - `materials_lecture_subject_check` accepts matching/null subject.
   - Rejects mismatched subject.
6. Cross-user linking attempts:
   - Composite FK rejects mismatched `user_id`.
7. Existing owner RLS policies:
   - Owner can read/write own rows.
   - Non-owner cannot read/write.
8. Existing legacy lecture data:
   - Null `subject_id` rows remain valid.
   - No university_subjects dependency required.

## Rollback plan
- Reverse trigger first:
  `drop trigger if exists lectures_subject_change_sync_materials on public.lectures;`
  `drop function if exists public.sync_materials_on_lecture_subject_change();`
- Restore previous composite FK definitions only if needed:
  - Drop new constraints and recreate prior definitions.
- Restore legacy FK only if investigation changes:
  `alter table public.lectures add constraint lectures_subject_id_fkey foreign key (subject_id) references public.university_subjects(id) on delete set null;`
- Do not drop columns or delete data during rollback.
- Rollback must preserve all user data.

## Exact future commands (DO NOT RUN NOW)
### Review
- `git status --short`
- `git diff -- db/19-academic-workspace-corrective.sql docs/ACADEMIC_WORKSPACE_MIGRATION_RECONCILIATION.md docs/ACADEMIC_WORKSPACE_TEST_ROLLBACK_PLAN.md`

### Controlled execution (manual, after approval)
1. Open Supabase SQL Editor for project `lgaqgkihhmedtdzcgpnc`.
2. Paste and run `db/19-academic-workspace-corrective.sql`.
3. Capture full output and any error code.
4. Run validation queries from the test list.
5. If using Supabase CLI later:
   - `supabase migration list --linked`
   - `supabase db pull --linked`
   - Review generated baseline before any `supabase migration repair`.

### Post-execution verification
- Re-run remote schema verification.
- Confirm constraints, triggers, indexes, and RLS state.
- Confirm no row count changes except expected null updates caused by deletes/tests.
