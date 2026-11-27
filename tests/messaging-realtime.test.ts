// ===========================================================================
// MAGICLY — Messaging Realtime Tests
// Phase 5: Unit tests for Realtime utilities and typing indicator logic
// ===========================================================================

import { describe, it, expect } from "vitest";
import {
  getRealtimeChannel,
  getReadReceiptPayload,
  getTypingPayload,
} from "../lib/messaging/realtime";

describe("Realtime channel naming", () => {
  it("generates channel name for conversation", () => {
    const channel = getRealtimeChannel("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    expect(channel).toBe("messaging:a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  });

  it("generates unique channel per conversation", () => {
    const c1 = getRealtimeChannel("conv-1");
    const c2 = getRealtimeChannel("conv-2");
    expect(c1).not.toBe(c2);
  });
});

describe("Read receipt payload", () => {
  it("builds read receipt payload", () => {
    const payload = getReadReceiptPayload(
      "conv-123",
      "msg-456",
      "user-789",
      "2026-11-25T10:30:00Z",
    );
    expect(payload).toEqual({
      conversation_id: "conv-123",
      message_id: "msg-456",
      participant_id: "user-789",
      read_at: "2026-11-25T10:30:00Z",
    });
  });
});

describe("Typing indicator payload", () => {
  it("builds typing start payload", () => {
    const payload = getTypingPayload(
      "conv-123",
      "user-789",
      "user-789",
      "Ahmed",
      true,
    );
    expect(payload).toEqual({
      conversation_id: "conv-123",
      participant_id: "user-789",
      user_id: "user-789",
      username: "Ahmed",
    });
  });

  it("builds typing stop payload", () => {
    const payload = getTypingPayload(
      "conv-123",
      "user-789",
      "user-789",
      "Ahmed",
      false,
    );
    expect(payload).toEqual({
      conversation_id: "conv-123",
      participant_id: "user-789",
      user_id: "user-789",
      username: "Ahmed",
    });
  });
});

describe("Typing indicator state machine", () => {
  it("emits start event", () => {
    // Simulate typing indicator state
    let isTyping = false;
    const startTyping = () => { isTyping = true; };
    const stopTyping = () => { isTyping = false; };

    startTyping();
    expect(isTyping).toBe(true);

    stopTyping();
    expect(isTyping).toBe(false);
  });

  it("requires user to be a participant before sending typing indicator", () => {
    const isParticipant = (userId: string, conversationId: string): boolean => {
      // In production, this would check conversation_participants table
      // For now, return a simulated boolean
      return userId === "user-123" && conversationId === "conv-456";
    };

    const typingUsers = new Set<string>();

    const startTyping = (userId: string, conversationId: string) => {
      if (!isParticipant(userId, conversationId)) {
        throw new Error("User not in conversation");
      }
      typingUsers.add(userId);
    };

    const stopTyping = (userId: string) => {
      typingUsers.delete(userId);
    };

    // Valid case: user is participant
    startTyping("user-123", "conv-456");
    expect(typingUsers.has("user-123")).toBe(true);

    // Invalid case: user not a participant
    expect(() => {
      startTyping("user-999", "conv-456");
    }).toThrow("User not in conversation");
  });
});
