-- ============================================================================
-- Support admin communication upgrades (MANUAL RUN in Supabase SQL Editor)
-- ============================================================================
-- Adds read-tracking to support messages so admins can mark user messages as read.
-- Also adds admin_last_read_at to tickets for thread-level read state.

ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS read_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS admin_last_read_at timestamptz;

CREATE INDEX IF NOT EXISTS support_messages_unread_idx
  ON public.support_messages (ticket_id, read_at)
  WHERE read_at IS NULL;
