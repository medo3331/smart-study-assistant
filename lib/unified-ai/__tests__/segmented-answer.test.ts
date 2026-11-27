/**
 * 🎯 عقد التوصيل التدريجي + صمود الـ rate limit — سلسلة المحاولات في unifiedAI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 🚨 **العرض اللي الملف ده بيقفله:**
 *
 *   الطالب بيقول «اشرح لي جزء معين من المحاضرة» ونص الجزء كبير → الرد الواحد
 *   الطويل بياخد توكنز كتير ووقت تفكير طويل → المزوّد المجاني بيرجّع 429 →
 *   `PROVIDER_ERROR` يوصل للطالب فورًا من غير أي محاولة.
 *
 * **العقود:**
 *   1. 429 على الموديل الأساسي ← إعادة محاولة واحدة (Retry-After) ثم fallback
 *      لموديل بديل من MODEL_REGISTRY (مش hard-code خارج السجل).
 *   2. علامة `[[متابعة]]` ← تتشال من الرد + `hasMore: true` للواجهة.
 *   3. `finish_reason === "length"` ← `hasMore: true` (الرد اتقطع على السقف).
 *   4. سجل المحادثة له ميزانية إجمالية — مش 12 دور × 3000 حرف بلا سقف.
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

type CapturedCall = {
  url: string;
  model?: string;
  messages?: Array<{ role: string; content: string }>;
};

let captured: CapturedCall[] = [];
let responder: (callNo: number, url: string, init?: RequestInit) => unknown;

function installFetch() {
  let callNo = 0;
  globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    callNo += 1;
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string; messages?: Array<{ role: string; content: string }> };
    captured.push({ url: String(url), model: body.model, messages: body.messages });
    return responder(callNo, String(url), init) as Response;
  }) as unknown as typeof fetch;
}

const okResponse = (content: string, finishReason = "stop") => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  text: async () => "",
  json: async () => ({
    choices: [{ message: { content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 10, completion_tokens: 10 },
  }),
});

const rateLimitedResponse = (retryAfter = "0") => ({
  ok: false,
  status: 429,
  headers: { get: (name: string) => (name === "retry-after" ? retryAfter : null) },
  text: async () => "rate limit exceeded",
  json: async () => ({}),
});

beforeEach(() => {
  captured = [];
  process.env.GROQ_API_KEY = "test-key";
  delete process.env.NVIDIA_API_KEY;
});

describe("التوصيل التدريجي — علامة المتابعة و hasMore", () => {
  it("✅ علامة [[متابعة]] تتشال من الرد وتطلع hasMore: true", async () => {
    responder = () => okResponse("الجزء الأول من الشرح بعمق.\n\n[[متابعة]]");
    installFetch();

    const res = await unifiedAI({ prompt: "اشرح لي المحاضرة", language: "ar" });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.answer).not.toContain("[[متابعة]]");
      expect(res.hasMore).toBe(true);
    }
  });

  it("✅ رد مكتمل من غير علامة → hasMore falsy", async () => {
    responder = () => okResponse("شرح قصير واكتفى.");
    installFetch();

    const res = await unifiedAI({ prompt: "اشرح الضغط", language: "ar" });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.hasMore).toBeFalsy();
  });

  it("✅ finish_reason=length (رد مقطوع على السقف) → hasMore: true", async () => {
    responder = () => okResponse("شرح طويل اتقطع…", "length");
    installFetch();

    const res = await unifiedAI({ prompt: "اشرح المحاضرة كاملة", language: "ar" });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.hasMore).toBe(true);
  });
});

describe("صمود الـ rate limit — retry ثم fallback من السجل", () => {
  it("✅ 429 مرتين على الأساسي → fallback لموديل تاني ويرجّع نجاح", async () => {
    responder = (callNo) => {
      if (callNo <= 2) return rateLimitedResponse("0");
      return okResponse("الرد من الموديل البديل.");
    };
    installFetch();

    const res = await unifiedAI({ prompt: "اشرح لي جزء كبير", language: "ar" });

    expect(res.ok).toBe(true);
    // محاولتا الأساسي (20b — CURRENT_AI_MODEL) ثم محاولة البديل (120b) — كلهم على نقطة Groq.
    expect(captured.length).toBe(3);
    expect(captured[0].model).toBe("openai/gpt-oss-20b");
    expect(captured[2].model).toBe("openai/gpt-oss-120b");
    if (res.ok) expect(res.answer).toContain("البديل");
  });

  it("✅ بعد فشل كل محاولات Groq → عبور المزوّدين NVIDIA (لو المفتاح موجود)", async () => {
    process.env.NVIDIA_API_KEY = "nvidia-test";
    responder = (callNo, url) => {
      if (callNo <= 2) return rateLimitedResponse("0");
      if (url.includes("groq.com")) return rateLimitedResponse("0");
      return okResponse("الرد من NVIDIA.");
    };
    installFetch();

    const res = await unifiedAI({ prompt: "اشرح لي جزء كبير", language: "ar" });

    expect(res.ok).toBe(true);
    const last = captured[captured.length - 1];
    expect(last.url).toContain("integrate.api.nvidia.com");
    expect(last.model).toBe("nvidia/nemotron-3.5-lightning-30b-a3b");
  });
});

describe("ميزانية سجل المحادثة", () => {
  it("✅ مجموع أدوار السجل المرسلة لا يتجاوز الميزانية الإجمالية", async () => {
    responder = () => okResponse("تمام.");
    installFetch();

    const longTurn = "خ".repeat(2000);
    await unifiedAI({
      prompt: "كم slide؟",
      language: "ar",
      history: Array.from({ length: 8 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `دور ${i}: ${longTurn}`,
      })),
    });

    const body = captured[0];
    const historyTurns = body.messages!.slice(1, -1);
    const totalChars = historyTurns.reduce((sum, t) => sum + t.content.length, 0);
    // 8 أدوار × 2000 = 16000 حرف لو مفيش ميزانية — العقد: سقف 9000 (+3000 لدور أخير قصير).
    expect(totalChars).toBeLessThanOrEqual(12000);
    // الأحدث يفضل موجود — آخر دور محفوظ قبل رسالة الطالب الحالية.
    expect(historyTurns[historyTurns.length - 1].content).toContain("دور 7");
  });
});
