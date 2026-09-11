import { describe, expect, it } from "vitest";
import { appendSystemInstruction, SYSTEM_INSTRUCTION_MAX_CHARS, truncateText } from "../prompt-engine";
import { buildFullContext } from "../context-builder";

function mockSupabaseWithHistory(history: Array<{ role: string; content: string }>) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: table === "profiles" ? { full_name: "أحمد" } : null }),
          order: () => ({
            limit: async () => ({ data: table === "chat_messages" ? history : [] }),
          }),
        }),
      }),
    }),
  };
}

describe("Chaos: Token Limits", () => {
  it("context_truncation_at_limit", () => {
    const basePrompt = "أنت مساعد ذكي...";
    const longInstruction = "أ".repeat(2000);
    const result = appendSystemInstruction(basePrompt, longInstruction);
    const instructionPart = result.split("تعليمات تنسيق الإخراج الإلزامية")[1] ?? "";
    expect(instructionPart.length).toBeLessThanOrEqual(SYSTEM_INSTRUCTION_MAX_CHARS + 8);
    expect(result.length).toBeLessThan(basePrompt.length + SYSTEM_INSTRUCTION_MAX_CHARS + 80);
  });

  it("message_history_truncated", async () => {
    const mockHistory = Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `رسالة ${i}`,
    }));
    const { messages } = await buildFullContext(
      "user-123",
      "session-456",
      "سؤال جديد",
      { maxHistoryMessages: 10 },
      mockSupabaseWithHistory(mockHistory) as never
    );
    expect(messages.length).toBeLessThanOrEqual(12);
  });

  it("truncateText_adds_ellipsis", () => {
    expect(truncateText("abc", 10)).toBe("abc");
    expect(truncateText("abcdefghij", 5).endsWith("…")).toBe(true);
    expect(truncateText("abcdefghij", 5).length).toBe(5);
  });

  it("history_keeps_most_recent", async () => {
    const mockHistory = Array.from({ length: 20 }, (_, i) => ({
      role: "user",
      content: `old-${i}`,
    }));
    const { messages } = await buildFullContext(
      "u",
      "s",
      "new",
      { maxHistoryMessages: 3 },
      mockSupabaseWithHistory(mockHistory) as never
    );
    const contents = messages.map((m) => m.content).join("\n");
    expect(contents).toContain("old-19");
    expect(contents).not.toContain("old-0");
  });

  it("default_history_cap_is_10", async () => {
    const mockHistory = Array.from({ length: 40 }, (_, i) => ({
      role: "user",
      content: `m${i}`,
    }));
    const { messages } = await buildFullContext("u", "s", "q", {}, mockSupabaseWithHistory(mockHistory) as never);
    const hist = messages.filter((m) => m.role !== "system" && m.content !== "q");
    expect(hist.length).toBe(10);
  });

  it("long_history_message_clipped", async () => {
    const { messages } = await buildFullContext(
      "u",
      "s",
      "q",
      { maxHistoryMessages: 1 },
      mockSupabaseWithHistory([{ role: "user", content: "x".repeat(8000) }]) as never
    );
    const hist = messages.find((m) => m.content.startsWith("x"));
    expect((hist?.content.length ?? 0)).toBeLessThanOrEqual(4001);
  });

  it("empty_instruction_still_has_marker", () => {
    const result = appendSystemInstruction("base", "");
    expect(result).toContain("تعليمات تنسيق الإخراج الإلزامية");
  });

  it("short_instruction_not_padded", () => {
    const result = appendSystemInstruction("base", "ok");
    expect(result).toContain("ok");
    expect(result.endsWith("ok")).toBe(true);
  });
});
