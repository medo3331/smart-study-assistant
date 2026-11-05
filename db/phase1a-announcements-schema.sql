-- ============================================================================
-- Phase 1A (MANUAL RUN) -- Announcements schema & RLS
-- ============================================================================
-- Scope: database only. No UI, no API routes, no permission keys.
-- Idempotent: safe to run more than once.
-- Does not modify site_admins or any Phase 0 security fix.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(btrim(title)) > 0),
  body         text not null check (length(btrim(body)) > 0),
  audience     text not null default 'all'
               check (audience in ('all', 'student', 'graduate', 'freelancer')),
  status       text not null default 'draft'
               check (status in ('draft', 'published', 'archived')),
  publish_at   timestamptz,
  expires_at   timestamptz,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint announcements_publish_expires_check
    check (publish_at is null or expires_at is null or publish_at < expires_at)
);

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 2. Constraints (idempotent for pre-existing tables)
-- ----------------------------------------------------------------------------
-- Ensure defaults and NOT NULL are present on pre-existing tables.
alter table public.announcements
  alter column audience set default 'all';
alter table public.announcements
  alter column status set default 'draft';

-- Re-create CHECK constraints deterministically (not relying on IF NOT EXISTS alone).
alter table public.announcements drop constraint if exists announcements_audience_check;
alter table public.announcements
  add constraint announcements_audience_check
  check (audience in ('all', 'student', 'graduate', 'freelancer'));

alter table public.announcements drop constraint if exists announcements_status_check;
alter table public.announcements
  add constraint announcements_status_check
  check (status in ('draft', 'published', 'archived'));

alter table public.announcements drop constraint if exists announcements_publish_expires_check;
alter table public.announcements
  add constraint announcements_publish_expires_check
  check (publish_at is null or expires_at is null or publish_at < expires_at);

alter table public.announcements drop constraint if exists announcements_title_not_blank;
alter table public.announcements
  add constraint announcements_title_not_blank
  check (length(btrim(title)) > 0);

alter table public.announcements drop constraint if exists announcements_body_not_blank;
alter table public.announcements
  add constraint announcements_body_not_blank
  check (length(btrim(body)) > 0);

-- ----------------------------------------------------------------------------
-- 3. Indexes
-- ----------------------------------------------------------------------------
create index if not exists announcements_status_audience_publish_idx
  on public.announcements (status, audience, publish_at, expires_at);

create index if not exists announcements_created_by_idx
  on public.announcements (created_by);

create index if not exists announcement_reads_user_id_idx
  on public.announcement_reads (user_id);
-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------
alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;

-- Audience is intentionally NOT derived from profiles.persona.
-- profiles.persona is user-mutable, so it is not a trusted authorization source.
-- Audience remains metadata for future application/API filtering. RLS enforces
-- publication and active time windows only.

drop policy if exists "announcements: authenticated read published" on public.announcements;
create policy "announcements: authenticated read published"
  on public.announcements
  for select
  to authenticated
  using (
    status = 'published'
    and (publish_at is null or publish_at <= now())
    and (expires_at is null or expires_at > now())
  );

drop policy if exists "announcement_reads: authenticated self read" on public.announcement_reads;
create policy "announcement_reads: authenticated self read"
  on public.announcement_reads
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "announcement_reads: authenticated self insert" on public.announcement_reads;
create policy "announcement_reads: authenticated self insert"
  on public.announcement_reads
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.announcements a
      where a.id = announcement_id
        and a.status = 'published'
        and (a.publish_at is null or a.publish_at <= now())
        and (a.expires_at is null or a.expires_at > now())
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Documentation
-- ----------------------------------------------------------------------------
comment on table public.announcements is
  'Phase 1A -- announcements. Reads are RLS-protected; writes are service_role only.';

comment on table public.announcement_reads is
  'Phase 1A -- per-user announcement read receipts. Self read/insert only.';

-- ============================================================================
-- ROLLBACK (manual, if needed):
--   drop policy if exists "announcement_reads: authenticated self insert" on public.announcement_reads;
--   drop policy if exists "announcement_reads: authenticated self read" on public.announcement_reads;
--   drop policy if exists "announcements: authenticated read published" on public.announcements;
--   drop table if exists public.announcement_reads;
--   drop table if exists public.announcements;
-- ============================================================================
-- REVIEW BEFORE RUNNING:
--   1) Fully additive except RLS policies on the two new tables.
--   2) No anonymous access (RLS enabled, no anon policies).
--   3) Audience is metadata only; RLS does not depend on mutable profiles.persona.
--   4) Apply manually; no production SQL is executed by the app.
-- ============================================================================

