-- ============================================================================
-- Sprint 2b.1 — Conversation summary column for chat_conversations
-- ============================================================================
-- Adds a nullable `summary` column to store a structured, bounded conversation
-- summary. Existing conversations remain valid with summary = NULL.
--
-- This migration is a FILE ONLY. Do NOT execute it against any database
-- without explicit approval and review.
-- ============================================================================

alter table public.chat_conversations
  add column if not exists summary text;

-- Optional index for future search (not created to keep migration minimal).
-- create index if not exists chat_conversations_summary_idx
--   on public.chat_conversations using gin (to_tsvector('simple', coalesce(summary, '')));

comment on column public.chat_conversations.summary is
  'Bounded, structured conversation summary. NULL for legacy/short conversations. Regenerable. Never replaces original messages.';