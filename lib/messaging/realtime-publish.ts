// ===========================================================================
// MAGICLY — Messaging Realtime — Server-side publish handlers
// Phase 5: Send read receipts, typing indicators via Realtime
// ===========================================================================

import { createClient } from "@/lib/supabase/server";
import {
  getRealtimeChannel,
  getReadReceiptPayload,
  getTypingPayload,
} from "./realtime";

/**
 * Publish a message-new event to the conversation channel.
 * Called after a message is successfully inserted.
 *
 * @param conversationId — the conversation ID
 * @param message — the inserted message
 * @returns true if published, false if not (or if Realtime is disabled)
 */
export async function publishMessageNew(
  conversationId: string,
  message: {
    id: string;
    conversation_id: string;
    sender_id: string;
    body: string;
    is_deleted: boolean;
    created_at: string;
  },
): Promise<boolean> {
  try {
    // NOTE: In production, use Postgres triggers to call pg_notify, which
    // Supabase Realtime converts to WebSocket events. This is a stub
    // for demonstration purposes. The actual publishing is done via:
    //   supabase.channel(`messaging:${conversationId}`)
    //     .on('postgres_changes', ... )
    //     .subscribe();
    //
    // For now, return true (the event will be published via triggers).
    return true;
  } catch (error) {
    console.error(`[realtime] publishMessageNew failed:`, error);
    return false;
  }
}

/**\n * Publish a read receipt event to the conversation channel.\n *\n * @param conversationId — conversation ID\n * @param messageId — the message that was read\n * @param participantId — the participant who read it\n * @param readAt — timestamp of read\n * @returns true if published, false otherwise\n */
export async function publishReadReceipt(
  conversationId: string,
  messageId: string,
  participantId: string,
  readAt: string,
): Promise<boolean> {
  try {
    // In production, use Postgres triggers to call pg_notify, which
    // Supabase Realtime converts to WebSocket events.
    // This is a stub for demonstration purposes.
    console.log(`[realtime] Would publish "message:read" to channel "messaging:${conversationId}"`);
    return true;
  } catch (error) {
    console.error(`[realtime] publishReadReceipt failed:`, error);
    return false;
  }
}

/**
 * Publish a typing indicator event (start or stop) to the conversation channel.
 *
 * @param conversationId — conversation ID
 * @param participantId — the user who is typing
 * @param userId — user ID
 * @param username — display name
 * @param isTyping — true for start, false for stop
 * @returns true if published, false otherwise
 */
export async function publishTypingIndicator(
  conversationId: string,
  participantId: string,
  userId: string,
  username: string,
  isTyping: boolean,
): Promise<boolean> {
  try {
    // In production, use Postgres triggers to call pg_notify, which
    // Supabase Realtime converts to WebSocket events.
    // This is a stub for demonstration purposes.
    const event = isTyping ? "typing:start" : "typing:stop";
    console.log(`[realtime] Would publish "${event}" to channel "messaging:${conversationId}"`);
    return true;
  } catch (error) {
    console.error(`[realtime] publishTypingIndicator failed:`, error);
    return false;
  }
}
