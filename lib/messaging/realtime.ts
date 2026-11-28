// ===========================================================================
// MAGICLY — Messaging Realtime — Supabase Realtime subscriptions handler
// Phase 5: Real-time messaging, read receipts, typing indicators
// ===========================================================================

import { createClient } from "@/lib/supabase/server";

/**
 * Realtime subscription utilities for messaging.
 *
 * Uses Supabase Realtime to push:
 * - new messages to all participants
 * - read receipt updates
 * - typing indicators
 *
 * Channel naming:
 *   messaging:{conversation_id}
 *
 * Events published via Postgres triggers or directly via Realtime:
 *   - 'message:new'        — new message
 *   - 'message:read'       — read receipt
 *   - 'typing:start'       — user started typing
 *   - 'typing:stop'        — user stopped typing
 *
 * NOTE: This file is a utility — the actual channel subscription is done
 * in the client-side React components (ChatWorkspace.tsx).
 */

export type RealtimeEventType =
  | "message:new"
  | "message:read"
  | "typing:start"
  | "typing:stop";

export interface RealtimeMessageEvent {
  type: "message:new";
  payload: {
    message: {
      id: string;
      conversation_id: string;
      sender_id: string;
      body: string;
      is_deleted: boolean;
      created_at: string;
    };
  };
}

export interface RealtimeReadReceiptEvent {
  type: "message:read";
  payload: {
    conversation_id: string;
    message_id: string;
    participant_id: string; // who read
    read_at: string;
  };
}

export interface RealtimeTypingEvent {
  type: "typing:start" | "typing:stop";
  payload: {
    conversation_id: string;
    participant_id: string;
    user_id: string;
    username: string;
  };
}

export function getRealtimeChannel(conversationId: string): string {
  return `messaging:${conversationId}`;
}

export function getEventType(message: { id: string; conversation_id: string; sender_id: string; body: string; is_deleted: boolean; created_at: string; }): RealtimeEventType {
  // Always publish as "message:new"
  return "message:new";
}

export function getReadReceiptPayload(
  conversationId: string,
  messageId: string,
  participantId: string,
  readAt: string,
): RealtimeReadReceiptEvent["payload"] {
  return {
    conversation_id: conversationId,
    message_id: messageId,
    participant_id: participantId,
    read_at: readAt,
  };
}

export function getTypingPayload(
  conversationId: string,
  participantId: string,
  userId: string,
  username: string,
  isTyping: boolean,
): RealtimeTypingEvent["payload"] {
  return {
    conversation_id: conversationId,
    participant_id: participantId,
    user_id: userId,
    username,
  };
}

/**
 * Build the subscription options for a conversation channel.
 * Used by client-side components (via @supabase/supabase-js).
 */
export function buildChannelOptions(conversationId: string) {
  return {
    config: {
      broadcast: {
        self: true,
      },
      presence: {
        key: `conversation:${conversationId}`,
      },
      // Postgres changes trigger replication of the affected row
      // We listen to the 'messages' table
    },
  };
}
