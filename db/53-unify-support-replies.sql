-- Unify legacy ticket_replies with the support_messages conversation stream.
-- Run after phase-communication-center.sql and support-admin-communication.sql.
-- This migration is safe to rerun and preserves the original ticket_replies rows.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other';
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

UPDATE public.support_tickets SET title = subject WHERE title IS NULL OR btrim(title) = '';
UPDATE public.support_tickets SET subject = title WHERE subject IS NULL OR btrim(subject) = '';
UPDATE public.support_tickets SET description = '' WHERE description IS NULL;

-- The deployed ticket_status enum does not include `pending`. Normalize the
-- legacy `in_progress` enum value to the existing `open` value instead.
UPDATE public.support_tickets
SET status = 'open'
WHERE status::text = 'in_progress';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.support_tickets'::regclass
      AND conname = 'support_tickets_category_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_category_check
      CHECK (category IN ('login','account','payment','bug','content','performance','other'));
  END IF;
END $$;

ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS read_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS admin_last_read_at timestamptz;

-- Avoid duplicate message creation on retries while retaining source rows.
INSERT INTO public.support_messages (ticket_id, author_id, author_role, body, created_at)
SELECT r.ticket_id,
       COALESCE(r.sender_id, t.user_id),
       CASE WHEN r.is_admin THEN 'admin' ELSE 'user' END,
       r.message,
       r.created_at
FROM public.ticket_replies r
JOIN public.support_tickets t ON t.id = r.ticket_id
WHERE r.message IS NOT NULL
  AND length(btrim(r.message)) BETWEEN 1 AND 5000
  AND NOT EXISTS (
    SELECT 1
    FROM public.support_messages m
    WHERE m.ticket_id = r.ticket_id
      AND m.author_id = COALESCE(r.sender_id, t.user_id)
      AND m.author_role = CASE WHEN r.is_admin THEN 'admin' ELSE 'user' END
      AND m.body = r.message
      AND m.created_at = r.created_at
  );

CREATE INDEX IF NOT EXISTS support_messages_ticket_idx
  ON public.support_messages(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS support_messages_unread_idx
  ON public.support_messages(ticket_id, read_at)
  WHERE read_at IS NULL;
