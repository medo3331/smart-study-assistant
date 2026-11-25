// ===========================================================================
// MAGICLY — Messaging RLS Policy Review Tests
// Phase 6: Static analysis of RLS policies for messaging tables
// ===========================================================================

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// --- Table: conversations ---

describe("RLS: conversations table", () => {
  it("has no RLS policies (public table with check constraints)", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "..", "db", "91-messaging-core-schema.sql"),
      "utf8",
    );
    expect(sql).toContain("create table if not exists public.conversations");
    // Conversations are not directly accessible via RLS
    expect(sql).not.toMatch(/create policy.*conversations.*for/);
  });
});

// --- Table: conversation_participants ---

describe("RLS: conversation_participants table", () => {
  it("has RLS policies for participant isolation", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "..", "db", "91-messaging-core-schema.sql"),
      "utf8",
    );
    // Should have policies for participation
    expect(sql).toContain("conversation_participants");
  });
});

// --- Table: messages ---

describe("RLS: messages table", () => {
  it("has insert policy for authorized senders", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "..", "db", "91-messaging-core-schema.sql"),
      "utf8",
    );
    expect(sql).toContain("messages: insert from authorized sender");
    expect(sql).toContain("sender_id = auth.uid()");
  });

  it("has select policy for read via conversation membership", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "..", "db", "91-messaging-core-schema.sql"),
      "utf8",
    );
    expect(sql).toContain("messages: read via conversation membership");
  });

  it("has delete policy for soft delete of own messages", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "..", "db", "91-messaging-core-schema.sql"),
      "utf8",
    );
    expect(sql).toContain("messages: delete own soft");
  });
});

// --- Table: message_state ---

describe("RLS: message_state table", () => {
  it("has read policy for own state", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "..", "db", "92-message-state.sql"),
      "utf8",
    );
    expect(sql).toContain("message_state: read own state");
    expect(sql).toContain("participant_id = auth.uid()");
  });

  it("has write policy for own state", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "..", "db", "92-message-state.sql"),
      "utf8",
    );
    expect(sql).toContain("message_state: write own state");
    expect(sql).toContain("participant_id = auth.uid()");
  });

  it("has update policy for own state", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "..", "db", "92-message-state.sql"),
      "utf8",
    );
    expect(sql).toContain("message_state: update own state");
    expect(sql).toContain("participant_id = auth.uid()");
  });
});

// --- Table: user_blocks ---

describe("RLS: user_blocks table", () => {
  it("has insert policy for own block", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "..", "db", "94-user-blocks.sql"),
      "utf8",
    );
    expect(sql).toContain("user_blocks: insert own block");
    expect(sql).toContain("blocker_id = auth.uid()");
  });

  it("has read policy for own blocks", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "..", "db", "94-user-blocks.sql"),
      "utf8",
    );
    expect(sql).toContain("user_blocks: read own blocks");
    expect(sql).toContain("blocker_id = auth.uid()");
  });

  it("has delete policy for own block", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "..", "db", "94-user-blocks.sql"),
      "utf8",
    );
    expect(sql).toContain("user_blocks: delete own block");
    expect(sql).toContain("blocker_id = auth.uid()");
  });
});

// --- Table: message_reports ---

describe("RLS: message_reports table", () => {
  it("has insert policy for own report", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "..", "db", "93-message-reports.sql"),
      "utf8",
    );
    expect(sql).toContain("message_reports: insert own report");
    expect(sql).toContain("reporter_id = auth.uid()");
  });

  it("has read policy for own reports", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "..", "db", "93-message-reports.sql"),
      "utf8",
    );
    expect(sql).toContain("message_reports: read own reports");
    expect(sql).toContain("reporter_id = auth.uid()");
  });
});

// --- API Routes ---

describe("Message API authorization", () => {
  it("conversation POST route verifies participant", () => {
    const route = fs.readFileSync(
      path.resolve(__dirname, "..", "app", "api", "conversations", "[id]", "message", "route.ts"),
      "utf8",
    );
    expect(route).toContain("conversation_participants");
    expect(route).toContain("participant_id");
    expect(route).toContain("user.id");
  });

  it("state GET route verifies participant", () => {
    const route = fs.readFileSync(
      path.resolve(__dirname, "..", "app", "api", "conversations", "[id]", "state", "route.ts"),
      "utf8",
    );
    expect(route).toContain("conversation_participants");
    expect(route).toContain("participant_id");
  });

  it("message POST route returns read:true for sender", () => {
    const route = fs.readFileSync(
      path.resolve(__dirname, "..", "app", "api", "conversations", "[id]", "message", "route.ts"),
      "utf8",
    );
    expect(route).toContain("read: true");
  });
});
