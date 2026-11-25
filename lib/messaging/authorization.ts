// ===========================================================================
// MAGICLY — Messaging Authorization helpers
// Phase 6: Reusable authorization functions for the messaging system
// These are used by API routes to validate user permissions.
// ===========================================================================

import { createClient } from "@/lib/supabase/server";

/**
 * Verify that the authenticated user is a participant of the conversation.
 *
 * @param userId - authenticated user ID
 * @param conversationId - conversation ID to check
 * @param participants - array of participants (from DB query)
 * @returns true if user is a participant
 */
export function verifyConversationParticipant(
  userId: string,
  conversationId: string,
  participants: Array<{ conversation_id: string; participant_id: string }>,
): boolean {
  return participants.some(
    (p) => p.conversation_id === conversationId && p.participant_id === userId,
  );
}

/**
 * Verify that the authenticated user is the sender of the message.
 *
 * @param userId - authenticated user ID
 * @param messageId - message ID to check
 * @param messages - array of messages (from DB query)
 * @returns true if user is the sender and message is not soft-deleted for that user
 */
export function verifyUserIsSender(
  userId: string,
  messageId: string,
  messages: Array<{
    id: string;
    conversation_id: string;
    sender_id: string;
    body: string;
    is_deleted: boolean;
    created_at: string;
  }>,
): boolean {
  const message = messages.find((m) => m.id === messageId);
  if (!message) return false;

  // Soft-deleted messages are hidden from other users
  if (message.is_deleted && message.sender_id !== userId) {
    return false;
  }

  // User must be the sender
  return message.sender_id === userId;
}

/**
 * Verify that the authenticated user can read the message.
 *
 * - Users can read their own messages
 * - Users can read messages in conversations they participate in
 * - Soft-deleted messages are hidden from non-senders
 *
 * @param userId - authenticated user ID
 * @param messageId - message ID to check
 * @param messages - array of messages (from DB query)
 * @returns true if user can read the message
 */
export function verifyUserCanReadMessage(
  userId: string,
  messageId: string,
  conversationId: string,
  messages: Array<{
    id: string;
    conversation_id: string;
    sender_id: string;
    body: string;
    is_deleted: boolean;
    created_at: string;
  }>,
): boolean {
  const message = messages.find((m) => m.id === messageId);
  if (!message) return false;

  // User can always read own messages (even if soft-deleted)
  if (message.sender_id === userId) {
    return true;
  }

  // User cannot read soft-deleted messages they are not the sender of
  if (message.is_deleted) {
    return false;
  }

  // User cannot read messages from a different conversation
  if (message.conversation_id !== conversationId) {
    return false;
  }

  // User can read messages in the same conversation only if they're a participant
  // or the sender of the message
  return (
    messages.some(
      (m) => m.conversation_id === conversationId && m.sender_id === userId,
    ) || message.sender_id === userId
  );
}

/**
 * Verify that the authenticated user can access the file.
 *
 * @param userId - authenticated user ID
 * @param fileId - file ID to check
 * @param files - array of files (from DB query)
 * @returns true if user can access the file
 */
export function verifyFileCanBeAccessed(
  userId: string,
  fileId: string,
  files: Array<{
    id: string;
    conversation_id: string;
    user_id: string;
    name: string;
    size: number;
    type: string;
    created_at: string;
  }>,
): boolean {
  const file = files.find((f) => f.id === fileId);
  if (!file) return false;

  // Users can access files they own
  return file.user_id === userId;
}

/**
 * Verify that a user is not blocked by another user.
 *
 * @param blockerId - the user who might have blocked
 * @param blockedId - the user who might be blocked
 * @param blocks - array of block records
 * @returns true if the relationship is allowed
 */
export function verifyUserNotBlocked(
  blockerId: string,
  blockedId: string,
  blocks: Array<{ blocker_id: string; blocked_id: string }>,
): boolean {
  return !blocks.some(
    (b) => b.blocker_id === blockerId && b.blocked_id === blockedId,
  );
}

/**
 * Get unread count for a user in a conversation.
 *
 * @param userId - the user to check
 * @param conversationId - conversation ID
 * @param messages - all messages in the conversation
 * @param readUntil - the timestamp of the user's last read message
 * @returns number of unread messages
 */
export function getUnreadCount(
  userId: string,
  conversationId: string,
  messages: Array<{
    id: string;
    conversation_id: string;
    sender_id: string;
    body: string;
    is_deleted: boolean;
    created_at: string;
  }>,
  readUntil: string | null,
): number {
  const userMessages = messages.filter(
    (m) => m.conversation_id === conversationId && m.sender_id !== userId,
  );

  return userMessages.filter((m) => {
    if (m.is_deleted) return false;
    if (!readUntil) return true;
    return new Date(m.created_at) > new Date(readUntil);
  }).length;
}
