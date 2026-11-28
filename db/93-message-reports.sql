-- ===========================================================================
-- MAGICLY — MESSAGING CORE — Abuse reporting
-- ===========================================================================
-- message_reports holds reports against messages or conversations for
-- abuse, spam, or harassment.
--
-- Columns:
--   id                 (uuid, PK)
--   reporter_id        (uuid, FK → auth.users.id) — who reported
--   message_id         (uuid, FK → messages.id, nullable) — the reported message
--   conversation_id    (uuid, FK → conversations.id) — the conversation
--   reason             (text) — reason for the report
--   status             (text) — open | reviewed | dismissed
--   created_at         (timestamptz)
--
-- Idempotent: safe to run more than once.
-- ===========================================================================

create table if not exists public.message_reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null
    references auth.users (id) on delete cascade,
  message_id        uuid references public.messages (id) on delete cascade,
  conversation_id   uuid not null
    references public.conversations (id) on delete cascade,
  reason            text not null,
  status            text not null default 'open'
    check (status in ('open', 'reviewed', 'dismissed')),
  created_at        timestamptz not null default now()
);

create index if not exists idx_message_reports_reporter
  on public.message_reports (reporter_id);

create index if not exists idx_message_reports_conversation
  on public.message_reports (conversation_id);

create index if not exists idx_message_reports_status
  on public.message_reports (status);

create policy "message_reports: insert own report"
  on public.message_reports for insert
  with check (reporter_id = auth.uid());

create policy "message_reports: read own reports"
  on public.message_reports for select
  using (reporter_id = auth.uid());
