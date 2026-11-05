# Academic Workspace — Phase 3.3 Migration Reconciliation Report

## Status
Preparation only. No remote SQL executed. No migration repaired. No db push.

## 1. Migration history reconciliation

### Observed state
- Remote Supabase migration history contains 15 recorded migrations.
- `db/18-academic-workspace-subjects.sql` is not recorded in remote migration history.
- The remote schema nevertheless contains the Academic Workspace objects created by migration 18.
- The remote copy differs from the local draft in at least one critical way:
  - Composite FKs use blanket `ON DELETE SET NULL`, which attempts to null `user_id` even though `user_id` is `NOT NULL`.
- The repository has no `supabase/migrations` directory; SQL files under `db/` are applied manually.

### Safest reconciliation strategy
1. Do **not** run `db/18-academic-workspace-subjects.sql` against the existing remote project. Its `CREATE TABLE`/`ALTER TABLE`/constraint steps would collide with objects that already exist.
2. Do **not** blindly mark migration 18 as applied unless the exact remote migration version and file contents are reconciled. The local file is a draft and is not byte-for-byte identical to the remote baseline.
3. Treat the current remote schema as the baseline for the existing project.
4. For fresh/unmigrated projects, run migration 18 first, then migration 19.
5. For the existing remote project, run only migration 19.
6. If Supabase CLI is later introduced, create a baseline migration from the remote schema with `supabase db pull`, review the generated SQL, then use `supabase migration repair --status applied <version>` only for a migration file whose contents exactly match the already-applied remote baseline.
7. Preserve all unrelated migration history. Do not delete or rewrite prior migrations.

### Fresh install vs existing project
- Fresh install path: `db/18-academic-workspace-subjects.sql` -> `db/19-academic-workspace-corrective.sql`.
- Existing remote path: `db/19-academic-workspace-corrective.sql` only.
- Migration 19 is idempotent enough for the existing remote schema and avoids destructive data changes.

### Legacy FK investigation
- Searched repository references to `lectures.subject_id` and `university_subjects`.
- No code path uses `lectures.subject_id` as a `university_subjects` link.
- `university_subjects` is used for university curriculum/catalog browsing, not as the personal Academic Workspace subject.
- Therefore `lectures_subject_id_fkey` is prepared for removal in migration 19.
- `catalog_subject_id` on `workspace_subjects` remains unchanged.

### RLS evaluation
- `materials` RLS is enabled but not forced.
- `workspace_subjects` and other hardened tables use forced RLS.
- Enabling `FORCE ROW LEVEL SECURITY` on `materials` is **not** performed in this phase.
- Potential impacts:
  - Service-role or maintenance operations that rely on bypassing RLS could be affected.
  - Trigger functions and definer-context operations must be verified before forcing RLS.
  - Existing owner policies already restrict normal user access.
- Decision: leave materials RLS enabled but unforced until access paths are audited.

## 2. Corrective migration
Created: `db/19-academic-workspace-corrective.sql`

It addresses:
- Composite unique targets.
- Removal of legacy `lectures_subject_id_fkey`.
- Recreation of composite FKs with column-specific `SET NULL`.
- Lecture-to-material synchronization trigger.
- Explicit decision not to force RLS on materials.

## 3. Verdict
MIGRATION HISTORY RECONCILIATION REQUIRED
