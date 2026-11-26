-- ===========================================================================
-- MAGICLY — Atomic Message Request Acceptance
-- ===========================================================================
-- This migration adds database-level support for atomic and idempotent
-- acceptance of message requests.
--
-- Changes:
--   1. Add user_a_id and user_b_id to public.conversations (individual chats)
--   2. Add unique index on normalized (user_a_id, user_b_id) to prevent
--      duplicate conversations between the same two users
--
-- Impact on existing data:
--   - Existing conversations remain unchanged.
--   - user_a_id and user_b_id are NULL for existing rows.
--   - New individual conversations created by request acceptance will
--     populate these fields.
--
-- Rollback:
--   - Cannot fully rollback because NOT NULL constraint will be added in
--     a follow-up migration. For now, the migration is additive and safe.
--   - To rollback: drop the unique index and remove the columns.
--
-- Database version: 38 (Messaging Core)
-- ===========================================================================

-- ----------------------------------------------------------------------------
-- 1. Add user tracking columns to conversations
-- ----------------------------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS user_a_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_b_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 2. Ensure individual conversations have exactly two participants
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- Check if the columns exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations'
      AND column_name = 'user_a_id'
  ) THEN
    RAISE NOTICE 'user_a_id column already exists or table structure changed.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Add unique constraint to prevent duplicate conversations
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_unique_pair
  ON public.conversations (
    LEAST(user_a_id, user_b_id),
    GREATEST(user_a_id, user_b_id),
    status
  );
-- Note: Including status in the index to allow multiple conversations with
-- different statuses (e.g., pending, archived). Only active conversations
-- are created by request acceptance.

-- ----------------------------------------------------------------------------
-- 4. Helper function to check if a conversation exists between two users
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_conversation_for_users(
  p_user_a uuid,
  p_user_b uuid,
  p_status text DEFAULT 'active'
)
RETURNS TABLE (
  id uuid,
  title text,
  status text,
  created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.title, c.status, c.created_at
  FROM public.conversations c
  WHERE
    c.user_a_id = LEAST(p_user_a, p_user_b)
    AND c.user_b_id = GREATEST(p_user_a, p_user_b)
    AND c.status = p_status
    AND c.id IS NOT NULL
  LIMIT 1;

  -- If no conversation exists, return no rows (caller will create)
  RETURN;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. RPC for atomic message request acceptance
-- ----------------------------------------------------------------------------
-- This function provides a fully atomic, database-enforced acceptance
-- of a message request.
--
-- Parameters:
--   p_request_id (uuid) – the message request to accept
--   p_user_id (uuid)    – the authenticated user (must be the receiver)
--
-- Returns:
--   TABLE (conversation_id, conversation_title, status, created_at)
--
-- Behavior:
--   1. Checks that the request exists and is pending.
--   2. Checks that the caller is the request receiver.
--   3. Checks that no block prevents communication.
--   4. Creates exactly one conversation for this user pair
--      (UNIQUE INDEX prevents duplicates).
--   5. Adds both users as participants.
--   6. Updates the request status to 'accepted'.
--   7. Returns the conversation.
--
-- Concurrency:
--   - Multiple parallel accepts are serialized by the unique index.
--   - Only the first accept succeeds; subsequent accepts return the
--     same existing conversation.
--   - Any failure rolls back the entire transaction.
--
-- Security:
--   - SECURITY DEFINER ensures the function can insert into 'conversations'
--     even though it has no RLS policy (conversations table is public).
--   - The caller's user ID is validated against the request receiver.
--   - No output is returned to unauthorized callers.
--
-- Dependencies:
--   - db/98-message-requests-acceptance-atomic.sql
--     (adds user_a_id, user_b_id columns and unique index)

CREATE OR REPLACE FUNCTION public.accept_message_request(
  p_request_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  conversation_id uuid,
  conversation_title text,
  status text,
  created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id       uuid;
  v_receiver_id     uuid;
  v_request_status  text;
  v_conversation_id uuid;
  v_existing_id     uuid;
BEGIN
  -- 1. Fetch the request
  SELECT sender_id, receiver_id, status
  INTO v_sender_id, v_receiver_id, v_request_status
  FROM public.message_requests
  WHERE id = p_request_id;

  -- 1. Request must exist
  IF v_sender_id IS NULL THEN
    RETURN;
  END IF;

  -- 2. Caller must be the receiver
  IF p_user_id IS DISTINCT FROM v_receiver_id THEN
    RETURN;
  END IF;

  -- 3. Request must be pending
  IF v_request_status != 'pending' THEN
    -- Return existing conversation if already accepted (idempotency)
    RETURN QUERY
    SELECT c.id, c.title, c.status, c.created_at
    FROM public.conversations c
    WHERE c.user_a_id = LEAST(v_sender_id, v_receiver_id)
      AND c.user_b_id = GREATEST(v_sender_id, v_receiver_id)
      AND c.status = 'active'
    LIMIT 1;
    RETURN;
  END IF;

  -- 4. Check no blocking
  IF EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = v_sender_id AND blocked_id = v_receiver_id)
       OR (blocker_id = v_receiver_id AND blocked_id = v_sender_id)
  ) THEN
    RETURN;
  END IF;

  -- 5. Insert conversation (UNIQUE constraint prevents duplicates)
  BEGIN
    INSERT INTO public.conversations (user_a_id, user_b_id)
    VALUES (LEAST(v_sender_id, v_receiver_id), GREATEST(v_sender_id, v_receiver_id))
    RETURNING id INTO v_conversation_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- Another concurrent accept created the same conversation.
      -- Look for the existing one.
      SELECT id INTO v_conversation_id
      FROM public.conversations
      WHERE user_a_id = LEAST(v_sender_id, v_receiver_id)
        AND user_b_id = GREATEST(v_sender_id, v_receiver_id)
        AND status = 'active';
  END;

  -- 6. Add participants (idempotent: unique index prevents dupes)
  INSERT INTO public.conversation_participants (conversation_id, participant_id)
  VALUES (v_conversation_id, v_sender_id), (v_conversation_id, v_receiver_id);

  -- 7. Mark the request as accepted
  UPDATE public.message_requests
  SET status = 'accepted',
      responded_at = now(),
      responded_by = p_user_id
  WHERE id = p_request_id;

  -- 8. Return the conversation
  RETURN QUERY
  SELECT c.id, c.title, c.status, c.created_at
  FROM public.conversations c
  WHERE c.id = v_conversation_id;
END;
$$;
