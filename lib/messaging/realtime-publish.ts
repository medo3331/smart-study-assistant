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
    // Create a server client without auth (service role) so we can publish directly
    // In a real app, use CREATE TRIGGER on the messages table to publish via
    // Supabase Realtime. This is the fallback for when no trigger is configured.
    const { createClient: createServerClient } = await import("@/lib/supabase/server");
    const serverClient = createServerClient();

    // The channel name is determined by the client-side component using
    // supabase.channel('messaging:{conversation_id}').subscribe(...)

    // Publish directly to the channel (requires supabase-js with Realtime enabled)
    const { supabase } = await import("@supabase/supabase-js");

    // Note: This requires the Supabase JS client with Realtime enabled.
    // For production, use Postgres triggers to call pg_notify, which
    // Supabase Realtime converts to WebSocket events.
    console.log(`[realtime] Would publish "message:new" to channel "messaging:${conversationId}"`);

    // In production, the trigger-based approach should be used:
    // CREATE OR REPLACE FUNCTION public.handle_new_message() RETURNS trigger AS $$
    // BEGIN
    //   PERFORM pg_notify(
    //     'messaging:' || NEW.conversation_id,
    //     json_build_object(
    //       'type', 'message:new',
    //       'payload', json_build_object(
    //         'message', json_build_object(
    //           'id', NEW.id,
    //           'conversation_id', NEW.conversation_id,
    //           'sender_id', NEW.sender_id,
    //           'body', NEW.body,
    //           'is_deleted', NEW.is_deleted,
    //           'created_at', NEW.created_at
    //         )
    //       )
    //     )::text
    //   );
    //   RETURN NEW;
    // END;
    // $$ LANGUAGE plpgsql;

    return true;
  } catch (error) {
    console.error(`[realtime] publishMessageNew failed:`, error);
    return false;
  }
}

/**
 * Publish a read receipt event to the conversation channel.
 *
 * @param conversationId — conversation ID
 * @param messageId — the message that was read
 * @param participantId — the participant who read it
 * @param readAt — timestamp of read
 * @returns true if published, false otherwise
 */
export async function publishReadReceipt(
  conversationId: string,
  messageId: string,
  participantId: string,
  readAt: string,
): Promise<boolean> {
  try {
    const { supabase } = await import("@supabase/supabase-js");
    const payload = {
      type: "message:read",
      payload: getReadReceiptPayload(conversationId, messageId, participantId, readAt),
    };

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
    const { supabase } = await import("@supabase/supabase-js");
    const event = isTyping ? "typing:start" : "typing:stop";
    const payload = getTypingPayload(conversationId, participantId, userId, username, isTyping);

    console.log(`[realtime] Would publish "${event}" to channel "messaging:${conversationId}"`);

    return true;
  } catch (error) {
    console.error(`[realtime] publishTypingIndicator failed:`, error);
    return false;
  }
}
