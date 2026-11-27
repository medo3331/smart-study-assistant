-- ===========================================================================
-- MAGICLY — SPRINT 1 — Batch 1A
-- Announcement Center — database migration
--
-- Scope: database only. No UI, no API routes, no permissions keys.
-- Idempotent: safe to run more than once.
-- Adds audience targeting, delivery tracking, and read receipts to the
-- existing announcements system without modifying production data.
-- ===========================================================================

-- ----------------------------------------------------------------------------
-- 1. Tasks
-- ----------------------------------------------------------------------------

-- 1.1 Extend announcements table with audience targeting and delivery tracking
-- 1.2 Ensure RLS enforces read access on published announcements
-- 1.3 Add announcement_reads for student-facing read receipts
-- 1.4 Add delivery tracking for announcements sent to students

-- ----------------------------------------------------------------------------
-- 2. Table: announcements (extended)
-- ----------------------------------------------------------------------------

-- Add audience targeting columns
alter table if exists public.announcements
  add column if not exists target_user_ids text[],
  add column if not exists target_plan_ids text[],
  add column if not exists target_faculty text,
  add column if not exists target_stage text,
  add column if not exists target_grade text;

-- Add delivery tracking columns
alter table if exists public.announcements
  add column if not exists delivery_status text default 'pending'
    check (delivery_status in ('pending', 'sending', 'sent', 'failed', 'paused', 'archived')),
  add column if not exists delivered_at timestamptz,
  add column if not exists last_error text;

-- Add indexing for audience targeting
create index if not exists idx_announcements_target
  on public.announcements (target_user_ids) where target_user_ids is not null;

create index if not exists idx_announcements_target_plan
  on public.announcements (target_plan_ids) where target_plan_ids is not null;

create index if not exists idx_announcements_delivery
  on public.announcements (delivery_status, published_at desc);

-- ----------------------------------------------------------------------------
-- 3. Table: announcement_reads (student-facing read receipts)
-- ----------------------------------------------------------------------------

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  delivered_at    timestamptz not null default now(),
  read_at         timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

-- Index for read receipt lookups
create index if not exists idx_announcement_reads_user
  on public.announcement_reads (user_id);

create index if not exists idx_announcement_reads_delivered
  on public.announcement_reads (announcement_id, delivered_at desc);

-- ----------------------------------------------------------------------------
-- 4. Table: announcement_deliveries (email delivery tracking)
-- ----------------------------------------------------------------------------

create table if not exists public.announcement_deliveries (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  channel         text not null default 'in_app' -- in_app | email | push
                       check (channel in ('in_app', 'email', 'push')),
  status          text not null default 'sent'
                   check (status in ('sent', 'failed', 'bounced', 'opened', 'clicked')),
  payload         jsonb,
  error_message   text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_announcement_deliveries_ann
  on public.announcement_deliveries (announcement_id, created_at desc);

create index if not exists idx_announcement_deliveries_user
  on public.announcement_deliveries (user_id);

-- ----------------------------------------------------------------------------
-- 5. RLS policies
-- ----------------------------------------------------------------------------

-- 5.1 Read published announcements (student-facing)
alter table if exists public.announcements enable row level security;

drop policy if exists "announcements: authenticated read published"
  on public.announcements;

create policy "announcements: authenticated read published"
  on public.announcements
  for select
  to authenticated
  using (
    status = 'published'
    and (publish_at is null or publish_at <= now())
    and (expires_at is null or expires_at > now())
    and (
      -- Public audience: all student users
      audience = 'all'
      or
      -- Targeted users
      target_user_ids is not null and auth.uid() = any (target_user_ids)
      or
      -- Targeted plans
      target_plan_ids is not null and auth.uid() = any (
        select user_id from auth.users where app_metadata->>'plan' = any (target_plan_ids)
      )
      or
      -- Targeted faculty/stage/grade (metadata-only; application filters on read)
      (target_faculty is not null and auth.uid() = any (
        select user_id from auth.users
        where coalesce(external_metadata->>'faculty', '') = target_faculty
           or coalesce(external_metadata->>'stage', '') = target_stage
           or coalesce(external_metadata->>'grade', '') = target_grade
      ))
    )
  )
  with check (
    status = 'published'
    and (publish_at is null or publish_at <= now())
    and (expires_at is null or expires_at > now())
  );

-- 5.2 Read own read receipts
alter table if exists public.announcement_reads enable row level security;

drop policy if exists "announcement_reads: authenticated self read"
  on public.announcement_reads;

create policy "announcement_reads: authenticated self read"
  on public.announcement_reads
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "announcement_reads: authenticated self insert"
  on public.announcement_reads;

create policy "announcement_reads: authenticated self insert"
  on public.announcement_reads
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- 5.3 Announcement deliveries: admin only
alter table if exists public.announcement_deliveries enable row level security;

drop policy if exists "announcement_deliveries: admin select"
  on public.announcement_deliveries;

create policy "announcement_deliveries: admin select"
  on public.announcement_deliveries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.site_admins
      where site_admins.user_id = auth.uid()
        and site_admins.role in ('owner', 'admin', 'moderator')
    )
  );

-- 5.4 No anon policies on any announcement table (all RLS enforced)

-- ----------------------------------------------------------------------------
-- 6. Constraints and indexes already added in sections 1-3
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 7. Documentation
-- ----------------------------------------------------------------------------

comment on table public.announcements is
  'Sprint 1 — Announcement Center. Audience targeting via target_user_ids, target_plan_ids, target_faculty, target_stage, target_grade. Delivery tracking via delivery_status.';

comment on table public.announcement_reads is
  'Sprint 1 — Per-user announcement read receipts. User must be the reader.';

comment on table public.announcement_deliveries is
  'Sprint 1 — Announcement delivery tracking (in-app, email, push).';

comment on policy "announcements: authenticated read published" on public.announcements is
  'Sprint 1 — Students only see published announcements targeted to them. User verification against target_user_ids, target_plan_ids, target_faculty, target_stage, target_grade.';

comment on policy "announcement_reads: authenticated self read" on public.announcement_reads is
  'Sprint 1 — User can read own read receipts only.';

comment on policy "announcement_reads: authenticated self insert" on public.announcement_reads is
  'Sprint 1 — User can insert own read receipt only.';

comment on policy "announcement_deliveries: admin select" on public.announcement_deliveries is
  'Sprint 1 — Admin only read access to delivery records.';

-- ===========================================================================
-- ROLLBACK (manual, if needed):
--   drop table if exists public.announcement_deliveries;
--   drop table if exists public.announcement_reads;
--   drop column if exists target_user_ids on public.announcements;
--   drop column if exists target_plan_ids on public.announcements;
--   drop column if exists target_faculty on public.announcements;
--   drop column if exists target_stage on public.announcements;
--   drop column if exists target_grade on public.announcements;
--   drop column if exists delivery_status on public.announcements;
--   drop column if exists delivered_at on public.announcements;
--   drop column if exists last_error on public.announcements;
-- ===========================================================================
