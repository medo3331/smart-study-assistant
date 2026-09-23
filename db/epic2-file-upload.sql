-- ============================================================
-- EPIC 2 — File Upload Organization (profile-linked, quota-enforced)
-- ============================================================

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  original_name text not null,
  file_size bigint not null default 0,
  file_type text not null check (file_type in ('pdf','word','text','image','video','audio')),
  classification text,
  stage text,
  grade text,
  subject text,
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_files_profile on public.files(profile_id);
create index if not exists idx_files_classification on public.files(classification);
create index if not exists idx_files_created on public.files(created_at desc);

alter table public.files enable row level security;

drop policy if exists "files: owner reads" on public.files;
create policy "files: owner reads"
  on public.files for select
  using (profile_id = auth.uid());

drop policy if exists "files: owner insert" on public.files;
create policy "files: owner insert"
  on public.files for insert
  with check (profile_id = auth.uid());

drop policy if exists "files: owner update" on public.files;
create policy "files: owner update"
  on public.files for update
  using (profile_id = auth.uid());

drop policy if exists "files: owner delete" on public.files;
create policy "files: owner delete"
  on public.files for delete
  using (profile_id = auth.uid());
