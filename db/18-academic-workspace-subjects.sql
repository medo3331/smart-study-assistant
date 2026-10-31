-- ============================================================================
-- Phase: Academic Workspace — Subjects + safe linking (READ-ONLY FILE; not executed)
-- Migration #18 (proposed)
-- ============================================================================
-- هذا الملف إعدادي (draft) للمراجعة. لا يُنفّذ تلقائياً.
-- ============================================================================

-- 1. workspace_subjects
create table if not exists public.workspace_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  stage text not null check (stage in ('basic','secondary','university','postgraduate')),
  curriculum text,
  grade_or_year text,
  specialization text,
  catalog_subject_id uuid references public.university_subjects(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_subjects_id_user_unique unique (id, user_id)
);

-- composite unique for cross-user FK safety
-- (id alone is PK, but (id,user_id) unique required for composite FKs)

create index if not exists workspace_subjects_user_created_idx
  on public.workspace_subjects (user_id, created_at desc);

-- RLS
alter table public.workspace_subjects enable row level security;
alter table public.workspace_subjects force row level security;

drop policy if exists "workspace_subjects: owner full access" on public.workspace_subjects;
create policy "workspace_subjects: owner full access"
  on public.workspace_subjects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- updated_at trigger (reuse existing function)
drop trigger if exists workspace_subjects_set_updated_at on public.workspace_subjects;
create trigger workspace_subjects_set_updated_at
  before update on public.workspace_subjects
  for each row execute function public.set_updated_at();

-- subject uniqueness (NULLS NOT DISTINCT) — requires PG15+
drop index if exists workspace_subjects_unique_context;
create unique index workspace_subjects_unique_context
  on public.workspace_subjects
  (user_id, lower(trim(name)), stage, curriculum, grade_or_year, specialization)
  nulls not distinct;

-- 2. Extend lectures
alter table public.lectures
  add column if not exists subject_id uuid;

-- composite unique on lectures (id,user_id) for cross-user FK
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lectures_id_user_unique'
  ) then
    alter table public.lectures
      add constraint lectures_id_user_unique unique (id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lectures_subject_user_fk'
  ) then
    alter table public.lectures
      add constraint lectures_subject_user_fk
      foreign key (subject_id, user_id)
      references public.workspace_subjects (id, user_id)
      on delete set null (subject_id);
  end if;
end $$;

create index if not exists lectures_user_subject_created_idx
  on public.lectures (user_id, subject_id, created_at desc);

-- 3. Extend materials
alter table public.materials
  add column if not exists subject_id uuid,
  add column if not exists lecture_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'materials_id_user_unique'
  ) then
    alter table public.materials
      add constraint materials_id_user_unique unique (id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'materials_subject_user_fk'
  ) then
    alter table public.materials
      add constraint materials_subject_user_fk
      foreign key (subject_id, user_id)
      references public.workspace_subjects (id, user_id)
      on delete set null (subject_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'materials_lecture_user_fk'
  ) then
    alter table public.materials
      add constraint materials_lecture_user_fk
      foreign key (lecture_id, user_id)
      references public.lectures (id, user_id)
      on delete set null (lecture_id);
  end if;
end $$;

create index if not exists materials_user_subject_created_idx
  on public.materials (user_id, subject_id, created_at desc);
create index if not exists materials_user_lecture_idx
  on public.materials (user_id, lecture_id);

-- partial inbox indexes (justified for unorganized queries)
create index if not exists materials_inbox_idx
  on public.materials (user_id, created_at desc)
  where subject_id is null;
create index if not exists lectures_inbox_idx
  on public.lectures (user_id, created_at desc)
  where subject_id is null;

-- 4. Lecture-material consistency trigger
create or replace function public.check_material_lecture_subject()
returns trigger
language plpgsql
as $$
declare
  lec_subject uuid;
begin
  if new.lecture_id is null then
    return new;
  end if;
  select subject_id into lec_subject
  from public.lectures
  where id = new.lecture_id and user_id = new.user_id;
  if not found then
    raise exception 'Lecture not found for user';
  end if;
  if new.subject_id is not null and lec_subject is not null and new.subject_id <> lec_subject then
    raise exception 'Material subject does not match lecture subject';
  end if;
  -- if material subject null, inherit lecture subject
  if new.subject_id is null then
    new.subject_id := lec_subject;
  end if;
  return new;
end;
$$;

drop trigger if exists materials_lecture_subject_check on public.materials;
create trigger materials_lecture_subject_check
  before insert or update on public.materials
  for each row execute function public.check_material_lecture_subject();

-- 5. Catalog compatibility already handled via ON DELETE SET NULL
-- (no extra action)
-- ============================================================================
-- END (draft)
-- ============================================================================
