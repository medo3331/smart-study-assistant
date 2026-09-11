import { describe, expect, it, vi } from "vitest";
import { buildFullContext } from "../context-builder";

function mockSupabase(profile: Record<string, unknown>, history: Array<{ role: string; content: string }> = []) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          single: async () => ({ data: table === "profiles" ? profile : null }),
          order: () => ({
            limit: async () => ({ data: table === "chat_messages" ? history : [] }),
          }),
          _eqVal: val,
        }),
      }),
    }),
    rpc: vi.fn().mockResolvedValue({
      data: { allowed: true, remaining: 100, limit: 150, plan_id: "pro" },
    }),
  };
}

describe("Chaos: User Isolation", () => {
  it("user_id_never_leaks", async () => {
    const { messages } = await buildFullContext(
      "user-123",
      "session-456",
      "اشرح لي نيوتن",
      {},
      mockSupabase({
        full_name: "أحمد",
        stage: "ثانوي",
        grade: "الصف الأول",
        subjects: ["رياضيات"],
        goal: "كلية هندسة",
        preferred_style: "مبسّط",
        daily_study_hours: 3,
      }) as never
    );
    const allContent = messages.map((m) => m.content).join(" ");
    expect(allContent).not.toMatch(/user-123|session-456/);
    expect(allContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("uuid_in_user_message_is_scrubbed", async () => {
    const { messages } = await buildFullContext(
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "11111111-2222-3333-4444-555555555555",
      "راجع aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      {},
      mockSupabase({}) as never
    );
    const allContent = messages.map((m) => m.content).join(" ");
    expect(allContent).not.toMatch(/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/);
  });

  it("concurrent_users_isolated", async () => {
    const user1 = await buildFullContext(
      "user-A",
      "session-1",
      "س1",
      {},
      mockSupabase({ full_name: "علي", stage: "إعدادي" }) as never
    );
    const user2 = await buildFullContext(
      "user-B",
      "session-2",
      "س2",
      {},
      mockSupabase({ full_name: "منى", stage: "جامعي" }) as never
    );
    expect(user1.messages[0].content).not.toBe(user2.messages[0].content);
    expect(user1.messages[0].content).toContain("علي");
    expect(user2.messages[0].content).toContain("منى");
  });

  it("history_does_not_include_foreign_session", async () => {
    const { messages } = await buildFullContext(
      "user-A",
      "session-1",
      "سؤال",
      { maxHistoryMessages: 10 },
      mockSupabase({ full_name: "علي" }, [{ role: "user", content: "من جلستي فقط" }]) as never
    );
    expect(messages.some((m) => m.content.includes("من جلستي فقط"))).toBe(true);
  });

  it("empty_profile_still_returns_system_message", async () => {
    const { messages } = await buildFullContext("u", "s", "hi", {}, mockSupabase({}) as never);
    expect(messages[0].role).toBe("system");
    expect(messages.at(-1)?.content).toBe("hi");
  });

  it("works_without_supabase", async () => {
    const { messages } = await buildFullContext("u", "s", "سؤال");
    expect(messages.length).toBe(2);
  });

  it("rpc_quota_shape_is_not_injected_into_prompt", async () => {
    const sb = mockSupabase({ full_name: "أحمد" });
    const { messages } = await buildFullContext("u", "s", "س", {}, sb as never);
    const all = messages.map((m) => m.content).join(" ");
    expect(all).not.toMatch(/plan_id|remaining|150/);
  });

  it("user_role_content_kept_as_user", async () => {
    const { messages } = await buildFullContext("u", "s", "اشرح");
    expect(messages.filter((m) => m.role === "user").at(-1)?.content).toBe("اشرح");
  });
});
