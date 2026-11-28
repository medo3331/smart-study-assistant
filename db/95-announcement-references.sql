-- ===========================================================================
-- MAGICLY — Inbox integration — Announcement references
-- ===========================================================================
-- Links the existing announcement system to the Unified Inbox.
-- This is a read-only reference: no duplicate announcement data is stored.
-- The inbox aggregates announcements by joining this table with the existing
-- announcements table.
--
-- Columns:
--   id                 (uuid, PK)
--   announcement_id    (uuid, FK → public.announcements.id)
--   user_id            (uuid, FK → auth.users.id)
--   read_at            (timestamptz) — when the user last read this announcement
--   created_at         (timestamptz)
--
-- Unique: (announcement_id, user_id)
--
-- Idempotent: safe to run more than once.
-- ===========================================================================

create table if not exists public.announcement_references (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null
    references public.announcements (id) on delete cascade,
  user_id         uuid not null
    references auth.users (id) on delete cascade,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),

  unique (announcement_id, user_id)
);

create index if not exists idx_announcement_ref_user
  on public.announcement_references (user_id);

create index if not exists idx_announcement_ref_ann
  on public.announcement_references (announcement_id);

create policy "announcement_references: read own"
  on public.announcement_references for select
  using (user_id = auth.uid());

create policy "announcement_references: insert own"
  on public.announcement_references for insert
  with check (user_id = auth.uid());

create policy "announcement_references: update own"
  on public.announcement_references for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
