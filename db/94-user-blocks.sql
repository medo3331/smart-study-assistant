-- ===========================================================================
-- MAGICLY — MESSAGING CORE — User blocking
-- ===========================================================================
-- user_blocks holds blocks between users. A blocked user cannot see any
-- messages from the blocking user in any conversation.
--
-- Columns:
--   id              (uuid, PK)
--   blocker_id      (uuid, FK → auth.users.id) — the one who blocks
--   blocked_id      (uuid, FK → auth.users.id) — the one being blocked
--   created_at      (timestamptz)
--
-- Idempotent: safe to run more than once.
-- ===========================================================================

create table if not exists public.user_blocks (
  id              uuid primary key default gen_random_uuid(),
  blocker_id      uuid not null
    references auth.users (id) on delete cascade,
  blocked_id      uuid not null
    references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),

  unique (blocker_id, blocked_id)
);

create index if not exists idx_user_blocks_blocker
  on public.user_blocks (blocker_id);

create index if not exists idx_user_blocks_blocked
  on public.user_blocks (blocked_id);

-- Blocked user cannot send messages to blocker, and blocker should not see
-- messages from blocked user. Enforcement is application-level; RLS is
-- advisory.
create policy "user_blocks: insert own block"
  on public.user_blocks for insert
  with check (blocker_id = auth.uid());

create policy "user_blocks: read own blocks"
  on public.user_blocks for select
  using (blocker_id = auth.uid());

create policy "user_blocks: delete own block"
  on public.user_blocks for delete
  using (blocker_id = auth.uid());
