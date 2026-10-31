# Academic Workspace — Phase 3.5 Migration History Strategy Resolution

Review-only. No SQL executed. No migration repair. No `db push`. No history changes. No migration files changed. No remote changes.

## 1. Scope and evidence

### Local repository state
- Repository root: `C:\Users\hp\.cline\worktrees\853e3\smart-study-assistant`
- There is **no** `supabase/migrations/` directory.
- SQL changes are stored as manually applied files under `db/`.
- Relevant local files:
  - `db/16-ai-usage-events.sql`
  - `db/17-lecture-upload-tickets.sql`
  - `db/18-academic-workspace-subjects.sql`
  - `db/19-academic-workspace-corrective.sql`
- `db/18-academic-workspace-subjects.sql` is a draft/manual migration. It is not a Supabase CLI migration and has no timestamp version.
- `db/19-academic-workspace-corrective.sql` is preparation-only and is not yet applied remotely.

### Remote database state (from prior read-only reports)
- Remote Supabase migration history reportedly contains 15 recorded migrations.
- `db/18-academic-workspace-subjects.sql` is **not** recorded in remote migration history.
- The remote schema nevertheless contains the Academic Workspace objects created by migration 18.
- The remote copy differs from the local draft in at least one critical way:
  - Composite FKs use blanket `ON DELETE SET NULL`.
  - The local draft uses column-specific `ON DELETE SET NULL (subject_id)` / `ON DELETE SET NULL (lecture_id)`.
- Migration 19 has not been applied remotely.

### Phase 3.4 conclusion carried forward
- Migration 18 must not be rerun.
- Migration 18 must not be blindly marked applied.
- Migration 19 SQL was reviewed as correct.
- The recommended history strategy was still unresolved.

## 2. Actual local and remote migration timelines

### Local timeline (relevant subset)
1. `db/16-ai-usage-events.sql` — manual Phase 5-C1 AI usage events table.
2. `db/17-lecture-upload-tickets.sql` — manual lecture upload ticket table.
3. `db/18-academic-workspace-subjects.sql` — manual/draft Academic Workspace schema:
   - creates `workspace_subjects`;
   - adds `lectures.subject_id`;
   - adds `materials.subject_id` and `materials.lecture_id`;
   - creates composite unique constraints and composite FKs;
   - creates lecture-material consistency trigger.
4. `db/19-academic-workspace-corrective.sql` — corrective migration:
   - ensures composite unique targets;
   - removes legacy `lectures.subject_id -> university_subjects` FK;
   - recreates composite FKs with column-specific `SET NULL`;
   - creates lecture-to-material synchronization trigger;
   - intentionally does not force RLS on `materials`.

### Remote timeline (known at report level, not exact versions)
- Remote has 15 recorded migrations in Supabase history.
- The exact version list/timestamps were not captured in this session because:
  - no linked Supabase CLI project is available in this repository;
  - the Supabase MCP project lookup is currently unusable in this environment.
- The remote history does **not** include migration 18.
- The remote schema already contains migration 18's Academic Workspace objects.
- Migration 19 is not recorded as applied.

Important: migration 18 is not a versioned Supabase CLI migration. It is a manually applied SQL file. Therefore it does not have a Supabase migration version that can simply be repaired.

## 3. Verified Supabase CLI behavior

CLI version verified in this environment:

```text
supabase CLI 2.122.0 (via npm exec --package supabase@2.122.0)
```

Verified command behavior from `--help` and official documentation:

### `supabase migration list`
- Lists local and remote migrations.
- Compares the local `supabase/migrations/` folder against the remote `supabase_migrations.schema_migrations` table.

### `supabase db push`
- Pushes new migrations to the remote database.
- Compares local migration files against the remote history table.
- Runs only migrations not yet applied, in order.
- `--include-all` includes all migrations not found on the remote history table.
- This means a later migration does **not** bypass an earlier missing migration. If migration 18 is present as a local migration file but absent from remote history, `db push` will attempt migration 18 before migration 19/20.

### supabase migration repair
- Updates the migration history table only.
- Does not apply SQL.
- Does not revert SQL.




### supabase db pull
- Pulls the current remote schema into a new local migration file.
- Can be used to create a baseline migration from an existing remote database.

### Official documentation behavior
Supabase tracks applied migrations in supabase_migrations.schema_migrations. Git tracks migration files. These are separate systems and must be kept in sync. If a migration is missing remotely but its schema change is already present, supabase migration repair --status applied <version> can correct the history record. Repair updates tracking only.

## 4. Answer to the required strategy questions

### Q1: If migration 18 is local but absent remotely, will supabase db push attempt migration 18 before a newly created migration 20?
Yes.

If migration 18 exists as a local migration file and is absent from the remote history table, Supabase considers it pending. db push runs pending migrations in version order. A migration 20 does not skip migration 18. --include-all makes this even more explicit by including all migrations not found remotely.

### Q2: Can a dedicated reconciliation migration safely solve this ordering issue without modifying remote history?
Yes, but only if it is designed as the first migration in the CLI sequence and migration 18 is not also present as a separate pending CLI migration.

A dedicated reconciliation/baseline migration can:
- assert that Academic Workspace objects already exist;
- avoid destructive recreation;
- normalize only what migration 19 needs;
- be marked applied on the existing remote without rerunning its SQL.

However, if both migration 18 and the new reconciliation migration remain in the CLI folder, the ordering problem remains. The reconciliation migration must supersede migration 18 in the CLI migration set, not sit beside it.

### Q3: What happens to a fresh database if migration 18 is changed, replaced, or marked as applied?
- If migration 18 is changed to match the remote baseline, a fresh database gets the changed baseline. Migration 19 must remain compatible with that baseline.
- If migration 18 is replaced by a baseline migration, a fresh database must run the replacement first, then migration 19.
- If migration 18 is merely marked applied on an existing remote database, no SQL runs. A fresh database will not automatically receive migration 18 unless a migration file still creates those objects.
- Therefore, history repair alone is not a fresh-install strategy. The SQL that creates the schema must still exist somewhere for new databases.

### Q4: Can we preserve both the existing remote database and a fresh installation?
Yes, with a clear split:
- Existing remote database: do not rerun migration 18. Apply only migration 19 after DB-side dependency verification.
- Fresh installation: run the schema-creating migration first, then migration 19.
- If adopting Supabase CLI later, use a generated baseline migration for the existing remote schema, mark it applied on remote, and keep migration 19 after it.
### Q5: What exact sequence would safely reconcile remote history and apply migration 19?
For the current manual workflow:
1. Do not run migration 18 on the existing remote project.
2. Do not repair migration 18.
3. Verify DB-side dependencies for lectures_subject_id_fkey.
4. Run migration 19 on a test/staging database.
5. Run validation tests.
6. After separate approval, run migration 19 on production.

For a future CLI adoption:
1. Capture exact remote history with supabase migration list.
2. Generate a baseline from remote with supabase db pull.
3. Review the generated baseline manually.
4. Place migration 19 after the baseline in supabase/migrations/.
5. Mark only the baseline as applied on the existing remote with supabase migration repair --status applied <baseline-version>.
6. Do not include db/18-academic-workspace-subjects.sql separately in the CLI migration set because the baseline supersedes it.
7. Test a fresh database with supabase db reset or equivalent before production.

## 5. Strategy comparison

### Strategy A - Reconcile migration 18 after proving equivalence
- Concept: rewrite or verify migration 18 so it exactly matches remote, then repair it as applied.
- Pros: preserves original numbering.
- Cons: current evidence shows the local draft is not byte-for-byte equivalent to remote. The remote uses blanket ON DELETE SET NULL; the local draft uses column-specific SET NULL. Re-running migration 18 would also collide with existing objects.
- Verdict: not safe as currently written. Reject unless migration 18 is first rewritten to exactly represent the remote baseline and independently verified.

### Strategy B - Replace or redesign migration 18 for fresh installations, with safe remote reconciliation
- Concept: keep a schema-creating migration for fresh installs, but do not execute or repair the old draft on the existing remote.
- Pros: preserves fresh-install capability. Avoids pretending the draft was the exact remote operation.
- Cons: requires maintaining two conceptual paths: manual fresh install and existing remote corrective-only.
- Verdict: acceptable, and is the basis of the current manual workflow.

### Strategy C - Dedicated baseline strategy
- Concept: generate one baseline migration from the remote schema, mark it applied on remote, and put future migrations after it.
- Pros: cleanest long-term Supabase CLI history. Fresh databases can be built from baseline + future migrations. Existing remote is not rerun.
- Cons: baseline must be generated and reviewed carefully. It is a larger change to repository workflow. It must include all objects that migration 18 currently creates.
- Verdict: recommended for any future CLI adoption, but not required to apply migration 19 now.

### Strategy D - Use supabase migration repair only
- Concept: mark migration 18 as applied.
- Pros: fixes the history table without executing SQL.
- Cons: migration 18 is not a versioned CLI migration. Its SQL differs from remote. Blindly marking it applied would hide an untracked schema difference and make future history misleading.
- Verdict: do not use for migration 18 in its current form.
## 6. Recommended strategy

Recommended strategy: manual-first now, optional dedicated baseline later.

1. Keep the current manual SQL workflow as the source of truth for this phase.
2. Do not execute migration 18 on the existing remote project.
3. Do not repair migration 18.
4. Apply only migration 19 to the existing remote project, after DB-side dependency verification and staging validation.
5. Preserve db/18-academic-workspace-subjects.sql and db/19-academic-workspace-corrective.sql as the fresh-install path:
   - Fresh install: run db/18-academic-workspace-subjects.sql, then db/19-academic-workspace-corrective.sql.
   - Existing remote: run only db/19-academic-workspace-corrective.sql.
6. If Supabase CLI migration tracking is adopted later, create a dedicated baseline migration from the remote schema using supabase db pull. Do not try to repair the unversioned migration 18. Mark only the generated baseline as applied on the existing remote. Keep migration 19 after the baseline. Do not include migration 18 separately in the CLI migration set.

This resolves the strategy without changing remote history or migration files.

## 7. Exact future commands and expected effects

Read-only inspection commands (safe to run, no DB changes):

COMMAND: npm exec --package supabase@2.122.0 -- supabase migration list --linked

Expected effect: shows local versus remote migration versions and identifies divergence. Does not change data or history.

Future staging validation commands (only after separate approval):

COMMAND: Apply db/19-academic-workspace-corrective.sql through the project's approved SQL execution path to a disposable/staging database only.

Expected effect: applies composite unique/FK correction and synchronization trigger. Migration 18 is not rerun.

Future CLI adoption commands (only if a CLI workflow is explicitly approved later):

COMMAND: npm exec --package supabase@2.122.0 -- supabase db pull
COMMAND: npm exec --package supabase@2.122.0 -- supabase migration list --linked
COMMAND: npm exec --package supabase@2.122.0 -- supabase migration repair --status applied <baseline-version>

Expected effects:
- db pull creates a new baseline migration from the remote schema.
- migration list confirms the baseline and divergence state.
- migration repair --status applied <baseline-version> updates the history table only. It does not execute SQL.
- The existing remote database keeps its current schema and data.

Do not run db push until the baseline and migration 19 are reviewed together.

## 8. Fresh-database installation implications

- A fresh database must still receive the Academic Workspace schema.
- The schema-creating SQL remains available in db/18-academic-workspace-subjects.sql.
- Migration 19 remains compatible with a fresh install because its statements are guarded/idempotent where needed and recreate FKs after ensuring unique targets.
- If a CLI baseline is adopted later, fresh databases should run:
  1. generated baseline migration;
  2. migration 19.
- db/18-academic-workspace-subjects.sql should not also run in the CLI path, because the baseline already includes its objects.

## 9. Existing-remote-database implications

- The existing remote database already has migration 18's objects.
- Migration 18 must not be rerun.
- Migration 18 must not be repaired as applied in its current unversioned/draft form.
- Only migration 19 should be applied.
- Migration 19 is transactional and does not force RLS on materials.
- Existing user data is not backfilled or destructively changed by migration 19.

## 10. Risks and rollback considerations

- Risk: remote history remains out of sync with manual SQL files until a baseline is adopted. This is acceptable if the manual execution path is documented and followed.
- Risk: future developers may assume db push can be used directly. It cannot safely be used until a baseline migration and migration 19 are placed in supabase/migrations/.
- Risk: if someone later runs supabase migration repair --status applied 18..., it will not work as intended because migration 18 is not a versioned CLI migration and its SQL differs from remote.
- Rollback for migration 19 is documented separately in docs/ACADEMIC_WORKSPACE_TEST_ROLLBACK_PLAN.md.
- If migration 19 fails, its transaction rolls back. The database remains at the pre-migration-19 state.
- No remote history change is recommended in this phase.

## 11. Final verdict

HISTORY STRATEGY RESOLVED
