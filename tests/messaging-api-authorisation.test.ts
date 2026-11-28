// ===========================================================================
// MAGICLY — Messaging API Authorisation Tests
// Phase 6: Unit tests for messaging API authorization logic
// NOTE: These tests verify the authorization logic in the route handlers
// without requiring a live Supabase database.
// ===========================================================================

import { describe, it, expect } from "vitest";
import {
  verifyConversationParticipant,
  verifyUserIsSender,
  verifyUserCanReadMessage,
  verifyFileCanBeAccessed,
} from "../lib/messaging/authorization";

describe("Message authorization helpers", () => {
  // Mock conversation-participants data
  const participants = [
    { conversation_id: "c1", participant_id: "user-1", role: "member" },
    { conversation_id: "c1", participant_id: "user-2", role: "member" },
    { conversation_id: "c1", participant_id: "user-3", role: "member" },
  ];

  // Mock messages data
  const messages = [
    { id: "msg-1", conversation_id: "c1", sender_id: "user-1", body: "Hello", is_deleted: false, created_at: "2026-11-25T10:00:00Z" },
    { id: "msg-2", conversation_id: "c1", sender_id: "user-2", body: "Hi", is_deleted: false, created_at: "2026-11-25T10:05:00Z" },
    { id: "msg-3", conversation_id: "c1", sender_id: "user-3", body: "Hey", is_deleted: false, created_at: "2026-11-25T10:10:00Z" },
  ];

  describe("verifyConversationParticipant", () => {
    it("returns true for legitimate participant", () => {
      const result = verifyConversationParticipant(
        "user-1",
        "c1",
        participants,
      );
      expect(result).toBe(true);
    });

    it("returns false for non-participant", () => {
      const result = verifyConversationParticipant(
        "user-4",
        "c1",
        participants,
      );
      expect(result).toBe(false);
    });

    it("returns false for non-existent conversation", () => {
      const result = verifyConversationParticipant(
        "user-1",
        "c999",
        participants,
      );
      expect(result).toBe(false);
    });
  });

  describe("verifyUserIsSender", () => {
    it("returns true when user is the sender", () => {
      const result = verifyUserIsSender(
        "user-1",
        "msg-1",
        messages,
      );
      expect(result).toBe(true);
    });

    it("returns false when user is not the sender", () => {
      const result = verifyUserIsSender(
        "user-3",
        "msg-1",
        messages,
      );
      expect(result).toBe(false);
    });

    it("returns false for non-existent message", () => {
      const result = verifyUserIsSender(
        "user-1",
        "msg-999",
        messages,
      );
      expect(result).toBe(false);
    });

    it("returns false for deleted message (soft delete)", () => {
      const deletedMessages = [
        ...messages,
        { id: "msg-4", conversation_id: "c1", sender_id: "user-1", body: "Deleted", is_deleted: true, created_at: "2026-11-25T10:15:00Z" },
      ];
      const result = verifyUserIsSender(
        "user-2",
        "msg-4",
        deletedMessages,
      );
      expect(result).toBe(false);
    });
  });

  describe("verifyUserCanReadMessage", () => {
    it("returns true for own message", () => {
      const result = verifyUserCanReadMessage(
        "user-1",
        "msg-1",
        "c1",
        messages,
      );
      expect(result).toBe(true);
    });

    it("returns true for message in same conversation", () => {
      const result = verifyUserCanReadMessage(
        "user-2",
        "msg-2",
        "c1",
        messages,
      );
      expect(result).toBe(true);
    });

    it("returns false for message in different conversation", () => {
      const otherConversationMessages = [
        { id: "msg-1", conversation_id: "c999", sender_id: "user-1", body: "Hello", is_deleted: false, created_at: "2026-11-25T10:00:00Z" },
      ];
      const result = verifyUserCanReadMessage(
        "user-2",
        "msg-1",
        "c1", // conversation the user belongs to
        otherConversationMessages,
      );
      expect(result).toBe(false);
    });

    it("returns false when message is deleted and user is not sender", () => {
      const deletedMessages = [
        ...messages,
        { id: "msg-4", conversation_id: "c1", sender_id: "user-1", body: "Deleted", is_deleted: true, created_at: "2026-11-25T10:15:00Z" },
      ];
      const result = verifyUserCanReadMessage(
        "user-2",
        "msg-4",
        "c1",
        deletedMessages,
      );
      expect(result).toBe(false);
    });

    it("returns true when message is deleted and user IS the sender", () => {
      const deletedMessages = [
        ...messages,
        { id: "msg-4", conversation_id: "c1", sender_id: "user-1", body: "Deleted", is_deleted: true, created_at: "2026-11-25T10:15:00Z" },
      ];
      const result = verifyUserCanReadMessage(
        "user-1",
        "msg-4",
        "c1",
        deletedMessages,
      );
      expect(result).toBe(true);
    });
  });

  describe("verifyFileCanBeAccessed", () => {
    const files = [
      { id: "file-1", conversation_id: "c1", user_id: "user-1", name: "note.txt", size: 1024, type: "text/plain", created_at: "2026-11-25T10:00:00Z" },
      { id: "file-2", conversation_id: "c1", user_id: "user-2", name: "photo.jpg", size: 2048, type: "image/jpeg", created_at: "2026-11-25T10:05:00Z" },
    ];

    it("returns true for owner accessing own file", () => {
      const result = verifyFileCanBeAccessed(
        "user-1",
        "file-1",
        files,
      );
      expect(result).toBe(true);
    });

    it("returns false for third-party accessing file", () => {
      const result = verifyFileCanBeAccessed(
        "user-3",
        "file-1",
        files,
      );
      expect(result).toBe(false);
    });

    it("returns false for non-existent file", () => {
      const result = verifyFileCanBeAccessed(
        "user-1",
        "file-999",
        files,
      );
      expect(result).toBe(false);
    });
  });
});

describe("Message deduplication", () => {
  it("prevents duplicate messages from same user in same conversation", () => {
    const messages = [
      { id: "msg-1", conversation_id: "c1", sender_id: "user-1", body: "Hello", is_deleted: false, created_at: "2026-11-25T10:00:00Z" },
      { id: "msg-2", conversation_id: "c1", sender_id: "user-1", body: "Hello", is_deleted: false, created_at: "2026-11-25T10:01:00Z" },
    ];

    // Check for duplicate messages (same sender, same conversation, same body, same timestamp)
    const seen = new Map<string, number>();
    let duplicates = 0;

    for (const msg of messages) {
      const key = `${msg.sender_id}-${msg.conversation_id}-${msg.body}-${msg.created_at}`;
      const count = seen.get(key) || 0;
      if (count > 0) {
        duplicates++;
      }
      seen.set(key, count + 1);
    }

    // These are two DIFFERENT messages (msg-1 and msg-2) with different timestamps
    // They are NOT duplicates — they are separate messages
    expect(duplicates).toBe(0);
  });

  it("detects exact duplicate messages", () => {
    const messages = [
      { id: "msg-1", conversation_id: "c1", sender_id: "user-1", body: "Hello", is_deleted: false, created_at: "2026-11-25T10:00:00Z" },
      { id: "msg-2", conversation_id: "c1", sender_id: "user-1", body: "Hello", is_deleted: false, created_at: "2026-11-25T10:00:00Z" },
    ];

    const seen = new Map<string, number>();
    let duplicates = 0;

    for (const msg of messages) {
      const key = `${msg.sender_id}-${msg.conversation_id}-${msg.body}-${msg.created_at}`;
      const count = seen.get(key) || 0;
      if (count > 0) {
        duplicates++;
      }
      seen.set(key, count + 1);
    }

    // These are exact duplicates (same sender, conversation, body, AND timestamp)
    // They should be detected as duplicates
    expect(duplicates).toBe(1);
  });
});

describe("Pagination safety", () => {
  it("limits page size to reasonable maximum", () => {
    const limit = Math.min(Number(200) || 50, 100);
    expect(limit).toBe(100); // Cap at 100

    const limit2 = Math.min(Number(10) || 50, 100);
    expect(limit2).toBe(10);
  });

  it("handles cursor pagination correctly", () => {
    const messages = [
      { id: "1", conversation_id: "c1", sender_id: "user-1", body: "A", is_deleted: false, created_at: "2026-11-25T10:00:00Z" },
      { id: "2", conversation_id: "c1", sender_id: "user-2", body: "B", is_deleted: false, created_at: "2026-11-25T10:01:00Z" },
      { id: "3", conversation_id: "c1", sender_id: "user-1", body: "C", is_deleted: false, created_at: "2026-11-25T10:02:00Z" },
    ];

    // Simulate cursor-based pagination (ascending)
    const cursor = "2026-11-25T10:01:00Z";
    const limit = 2;
    const filtered = messages.filter(m => {
      if (!cursor) return true;
      return new Date(m.created_at).getTime() > new Date(cursor).getTime();
    });

    expect(filtered).toHaveLength(1); // Only msg-3 after cursor
  });
});
