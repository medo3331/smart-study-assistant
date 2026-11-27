/**
 * 🎯 ذاكرة المحادثة — سجل الأدوار بيوصَل للموديل فعلاً
 * ═══════════════════════════════════════════════════════════════════
 *
 * 🚨 **العرض اللي الملف ده بيقفله:**
 *
 *   UnifiedChat بيبعت آخر رسالة بس → `unifiedAI` كان بيبنى
 *   `[system, user]` من غير أي سجل → الموديل «بينسى» رسالة قبلها
 *   («الملف اللي لسه بتعمله» → «ممكن توضح اسم الملف بالظبط»).
 *
 * العقد: `input.history` لازم يترتّب **بعد** الـ system و**قبل** رسالة
 * الطالب، وكل دور مقيّد الطول عشان المرفقات المحفوظة ما تسحبش النموذج.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/usage-accounting", () => ({
  recordAiUsage: vi.fn(async () => {}),
}));
vi.mock("@/lib/ai/usage-scheduler", () => ({
  scheduleUsageRecording: async (run: () => Promise<unknown>) => {
    await run();
  },
}));

import { unifiedAI } from "../unified-ai";

const okBody = () => ({
  choices: [{ message: { content: "تمام، الملف اللي بتعمله هو…" } }],
  usage: { prompt_tokens: 5, completion_tokens: 5 },
});

let capturedBodies: Array<{ messages: Array<{ role: string; content: string }> }> = [];

function jsonFetch() {
  return vi.fn(async (_url: unknown, init?: { body?: string }) => {
    capturedBodies.push(JSON.parse(init?.body ?? "{}"));
    return {
      ok: true,
      status: 200,
      json: async () => okBody(),
      text: async () => "",
    };
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  capturedBodies = [];
  process.env.GROQ_API_KEY = "test-key";
});

describe("chat memory — تاريخ المحادثة يوصل للموديل", () => {
  it("✅ يبني [system, ...history, user] بنفس الترتيب", async () => {
    globalThis.fetch = jsonFetch();

    const res = await unifiedAI({
      prompt: "والملف اللي لسه بتعمله؟",
      language: "ar",
      history: [
        { role: "user", content: "اشرح المحاضرة دي" },
        { role: "assistant", content: "تم الشرح — الملف فيه 24 slide." },
      ],
    });

    expect(res.ok).toBe(true);
    const body = capturedBodies[0];
    const roles = body.messages.map((m) => m.role);
    expect(roles).toEqual(["system", "user", "assistant", "user"]);
    // آخر رسالة = سؤال الطالب الحالي.
    expect(body.messages[body.messages.length - 1].content).toContain("اللي لسه بتعمله");
    // دور المساعد السابق موجود بمحتواه — ده اللي كان بيضيع.
    expect(body.messages[2].content).toContain("24 slide");
  });

  it("✅ بدون history → [system, user] فقط (نفس السلوك المحفوظ للزوار)", async () => {
    globalThis.fetch = jsonFetch();

    const res = await unifiedAI({ prompt: "اشرح الضغط", language: "ar" });

    expect(res.ok).toBe(true);
    const roles = capturedBodies[0].messages.map((m) => m.role);
    expect(roles).toEqual(["system", "user"]);
  });

  it("✅ يقيّد طول كل دور في التاريخ — المرفقات المحفوظة ما تسحبش النموذج", async () => {
    globalThis.fetch = jsonFetch();

    await unifiedAI({
      prompt: "كم slide؟",
      language: "ar",
      history: [
        { role: "user", content: "م".repeat(5000) },
      ],
    });

    const historyTurn = capturedBodies[0].messages[1];
    expect(historyTurn.content.length).toBeLessThanOrEqual(3000);
  });
});
