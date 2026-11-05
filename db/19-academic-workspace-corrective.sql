-- ============================================================================
-- Phase 3.3 — Academic Workspace Corrective Migration (PREPARATION ONLY)
-- File: db/19-academic-workspace-corrective.sql
-- Target: PostgreSQL 17 (Supabase)
-- ============================================================================
-- Safe to apply to the already-existing remote Academic Workspace schema.
-- Do NOT run migration 18 again on the existing remote project.
-- Fresh installations: run db/18-academic-workspace-subjects.sql first, then this file.
-- Existing remote projects: run ONLY this file.
-- No data backfill, no destructive data changes, no FORCE RLS on materials.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Ensure composite unique targets exist (required by composite FKs)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workspace_subjects_id_user_unique') then
    alter table public.workspace_subjects
      add constraint workspace_subjects_id_user_unique unique (id, user_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'lectures_id_user_unique') then
    alter table public.lectures
      add constraint lectures_id_user_unique unique (id, user_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'materials_id_user_unique') then
    alter table public.materials
      add constraint materials_id_user_unique unique (id, user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Remove legacy lectures.subject_id -> university_subjects FK if present
-- ---------------------------------------------------------------------------
-- Investigation result: no application/repository reference to this FK or to
-- lectures.subject_id as a university_subjects link. Dropping it allows a
-- lecture to be linked to an ordinary workspace subject without also needing
-- a university_subjects row.
do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'lectures'
      and c.conname = 'lectures_subject_id_fkey'
  ) then
    alter table public.lectures
      drop constraint lectures_subject_id_fkey;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Recreate composite FKs with column-specific SET NULL
--    user_id is NOT NULL and must never be nulled.
-- ---------------------------------------------------------------------------
alter table public.lectures
  drop constraint if exists lectures_subject_user_fk;

alter table public.lectures
  add constraint lectures_subject_user_fk
  foreign key (subject_id, user_id)
  references public.workspace_subjects (id, user_id)
  on delete set null (subject_id);

alter table public.materials
  drop constraint if exists materials_subject_user_fk;

alter table public.materials
  add constraint materials_subject_user_fk
  foreign key (subject_id, user_id)
  references public.workspace_subjects (id, user_id)
  on delete set null (subject_id);

alter table public.materials
  drop constraint if exists materials_lecture_user_fk;

alter table public.materials
  add constraint materials_lecture_user_fk
  foreign key (lecture_id, user_id)
  references public.lectures (id, user_id)
  on delete set null (lecture_id);

-- ---------------------------------------------------------------------------
-- 3. Lecture -> material synchronization trigger
-- ---------------------------------------------------------------------------
-- When lectures.subject_id changes, update only materials linked to that
-- lecture and owned by the same user. Handles A -> B and subject -> NULL.
create or replace function public.sync_materials_on_lecture_subject_change()
returns trigger
language plpgsql
as $$
begin
  update public.materials
     set subject_id = NEW.subject_id
   where lecture_id = NEW.id
     and user_id = NEW.user_id
     and subject_id is distinct from NEW.subject_id;

  return NEW;
end;
$$;

drop trigger if exists lectures_subject_change_sync_materials on public.lectures;

create trigger lectures_subject_change_sync_materials
  after update of subject_id on public.lectures
  for each row
  when (OLD.subject_id is distinct from NEW.subject_id)
  execute function public.sync_materials_on_lecture_subject_change();

-- ---------------------------------------------------------------------------
-- 4. RLS hardening decision (INTENTIONALLY NOT ENABLED)
-- ---------------------------------------------------------------------------
-- FORCE ROW LEVEL SECURITY on materials is NOT enabled here.
-- Reason: the application uses Supabase clients whose service-role/maintenance
-- paths, triggers, and existing owner policies must be reviewed first.
-- Enabling FORCE RLS can make service-role or definer-context operations
-- subject to policy checks and may break background jobs or admin tooling.
-- If approved later, run separately after verifying all access paths:
--
--   alter table public.materials force row level security;
--
-- The existing materials RLS policies remain enabled and unchanged.

commit;

-- ============================================================================
-- END
-- ============================================================================
