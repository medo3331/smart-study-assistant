-- ===========================================================================
-- MAGICLY — MESSAGING CORE — Per-user message visibility state
-- ===========================================================================
-- This table holds the per-user state for each message: whether the user
-- has archived or deleted it, or muted notifications for it.
--
-- It is SEPARATE from the messages table so that one user's action does not
-- affect another user's view.
--
-- Columns:
--   user_msg_state_id  (uuid, PK)
--   message_id         (uuid, FK → messages.id)
--   participant_id     (uuid, FK → auth.users.id) — the user this state belongs to
--   is_archived        (bool) — user's archive state
--   is_deleted         (bool) — user's soft-delete state
--   is_muted           (bool) — user's mute state for this message
--   created_at         (timestamptz)
--   updated_at         (timestamptz)
--
-- Idempotent: safe to run more than once.
-- ===========================================================================

create table if not exists public.message_state (
  user_msg_state_id uuid primary key default gen_random_uuid(),
  message_id        uuid not null
    references public.messages (id) on delete cascade,
  participant_id    uuid not null
    references auth.users (id) on delete cascade,
  is_archived       boolean not null default false,
  is_deleted        boolean not null default false,
  is_muted          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (message_id, participant_id)
);

create index if not exists idx_message_state_message
  on public.message_state (message_id);

create index if not exists idx_message_state_participant
  on public.message_state (participant_id);

create policy "message_state: read own state"
  on public.message_state for select
  using (participant_id = auth.uid());

create policy "message_state: write own state"
  on public.message_state for insert
  with check (participant_id = auth.uid());

create policy "message_state: update own state"
  on public.message_state for update
  using (participant_id = auth.uid())
  with check (participant_id = auth.uid());
