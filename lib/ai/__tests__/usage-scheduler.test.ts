/**
 * ⏱️ اختبار الجدولة الدائمة بعد الرد — Phase 5-C3.2
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 🎯 **الادعاء:** الكتابة بتتجدول بـ `after()` (بتفضل شغالة بعد ما الـ
 *   response يتبعت) بدل `void` (مش مضمون).
 *
 *   والـ AI response **مش** بيستنى الـ DB في الحالتين.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ⏱️ محاكاة `after()` الحقيقي: بيخزّن الـ callbacks بدل ما ينفّذها فورًا.
 * ده بالظبط سلوك Next — التنفيذ **بعد** ما الـ response يتبعت.
 */
const h = vi.hoisted(() => ({
  scheduled: [] as Array<() => Promise<unknown>>,
  /** لو true → `after` بيرمي (زي ما بيحصل بره request scope). */
  throwOutsideScope: false,
  recordAiUsage: vi.fn<(e: Record<string, unknown>) => Promise<void>>(async () => {}),
  healthByProvider: { groq: "OK", nvidia: "OK" } as Record<string, string>,
  models: {
    groq: { id: "m-groq", provider: "groq", capabilities: ["text"], enabled: true, freeEndpoint: true, priority: 1 },
    nvidia: { id: "m-nv", provider: "nvidia", capabilities: ["text"], enabled: true, freeEndpoint: true, priority: 2 },
  },
}));

vi.mock("next/server", () => ({
  after: (cb: () => Promise<unknown>) => {
    if (h.throwOutsideScope) throw new Error("`after` was called outside a request scope.");
    h.scheduled.push(cb);
  },
}));

vi.mock("../usage-accounting", () => ({ recordAiUsage: h.recordAiUsage }));

vi.mock("../health", () => ({
  isConfigured: () => true,
  isUsable: () => true,
  getProviderHealth: (p: string) => h.healthByProvider[p] ?? "OK",
  recordProviderResult: () => {},
}));

vi.mock("../models", () => ({
  MODEL_REGISTRY: [h.models.groq, h.models.nvidia],
  getModel: (id: string) => {
    const m = [h.models.groq, h.models.nvidia].find((x) => x.id === id);
    if (!m) throw new Error("unknown model");
    return m;
  },
  isModelSelectable: () => true,
  paidModelsAllowed: () => true,
  fallbackCandidatesFor: (p: string) => (p === "nvidia" ? [h.models.nvidia] : []),
}));

vi.mock("../model-state", () => ({
  isModelRuntimeEnabled: () => true,
  getRuntimePriority: () => 0,
}));

import { AiRouter } from "../routing";
import { AiProviderError } from "../types";
import type { AiChatRequest, AiProviderName, AiTextProvider } from "../types";

const input: AiChatRequest = { messages: [{ role: "user", content: "hi" }] };

const ctx = {
  operationId: "OP-1",
  idempotencyKey: "KEY-1",
  source: "server" as const,
  userId: "u1",
};

function provider(name: AiProviderName, impl: (r: AiChatRequest) => Promise<unknown>): AiTextProvider {
  return { name, completeChat: impl } as unknown as AiTextProvider;
}

const ok = (content: string) => async () => ({
  provider: "groq" as AiProviderName,
  model: "m-groq",
  content,
  payload: {},
});

/** ينفّذ الـ callbacks المجدولة — ده اللي بيعمله Next بعد الـ response. */
async function runScheduled() {
  const queued = [...h.scheduled];
  h.scheduled.length = 0;
  for (const cb of queued) await cb();
}

beforeEach(() => {
  vi.clearAllMocks();
  h.scheduled.length = 0;
  h.throwOutsideScope = false;
  h.healthByProvider = { groq: "OK", nvidia: "OK" };
});
/* ═══════════ الجدولة هي اللي بتتغيّر، مش البيانات ═══════════ */

describe("C3.2 — الجدولة بـ after()", () => {
  it("⏱️ محاولة ناجحة → بتجدول واحدة، ومش بتكتب فورًا", async () => {
    const router = new AiRouter([provider("groq", vi.fn(ok("مرحبا")))]);

    await router.completeChat("chat", { ...input, usage: ctx });

    // ⬇️ اتجدولت... بس مافيش كتابة لسه. الـ DB ماتمسّش قبل الـ response.
    expect(h.scheduled).toHaveLength(1);
    expect(h.recordAiUsage).not.toHaveBeenCalled();

    await runScheduled();
    expect(h.recordAiUsage).toHaveBeenCalledTimes(1);
  });

  it("⭐ fallback → جدولة واحدة لكل محاولة فعلية", async () => {
    const router = new AiRouter([
      provider("groq", vi.fn(async () => { throw new AiProviderError("rate", 429, "groq"); })),
      provider("nvidia", vi.fn(ok("ok"))),
    ]);

    await router.completeChat("chat", { ...input, usage: ctx });
    expect(h.scheduled).toHaveLength(2);

    await runScheduled();
    expect(h.recordAiUsage).toHaveBeenCalledTimes(2);
  });

  it("⛓️ operationId واحد عبر كل المحاولات", async () => {
    const router = new AiRouter([
      provider("groq", vi.fn(async () => { throw new AiProviderError("rate", 429, "groq"); })),
      provider("nvidia", vi.fn(ok("ok"))),
    ]);

    await router.completeChat("chat", { ...input, usage: ctx });
    await runScheduled();

    const ops = h.recordAiUsage.mock.calls.map((c) => (c[0] as { operationId: string }).operationId);
    expect(ops).toEqual(["OP-1", "OP-1"]);
  });

  it("⛓️ idempotencyKey واحد عبر كل المحاولات", async () => {
    const router = new AiRouter([
      provider("groq", vi.fn(async () => { throw new AiProviderError("rate", 429, "groq"); })),
      provider("nvidia", vi.fn(ok("ok"))),
    ]);

    await router.completeChat("chat", { ...input, usage: ctx });
    await runScheduled();

    const keys = h.recordAiUsage.mock.calls.map((c) => (c[0] as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toEqual(["KEY-1", "KEY-1"]);
  });

  it("⛓️ attemptNo بيفضل 0 ثم 1", async () => {
    const router = new AiRouter([
      provider("groq", vi.fn(async () => { throw new AiProviderError("rate", 429, "groq"); })),
      provider("nvidia", vi.fn(ok("ok"))),
    ]);

    await router.completeChat("chat", { ...input, usage: ctx });
    await runScheduled();

    const nos = h.recordAiUsage.mock.calls.map((c) => (c[0] as { attemptNo: number }).attemptNo);
    expect(nos).toEqual([0, 1]);
  });

  it("⛓️ مافيش payload fields اتغيرت عن C3", async () => {
    const router = new AiRouter([provider("groq", vi.fn(ok("ok")))]);
    await router.completeChat("chat", { ...input, usage: ctx });
    await runScheduled();

    // ⬇️ نفس الشكل بالظبط — C3.2 غيّر الجدولة بس.
    expect(h.recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1", feature: "chat",
        operationId: "OP-1", idempotencyKey: "KEY-1", attemptNo: 0,
        provider: "groq", status: "completed", units: 1,
      }),
    );
  });

  it("⛔ pre-flight skip مابيتجدولش", async () => {
    h.healthByProvider = { groq: "RATE_LIMITED", nvidia: "OK" };
    const router = new AiRouter([provider("groq", vi.fn(ok("x"))), provider("nvidia", vi.fn(ok("ok")))]);

    await router.completeChat("chat", { ...input, usage: ctx });

    // ⬇️ المزوّد الميت ماتنادىش → مافيش جدولة ليه، واللي فاضل رقمه 0.
    expect(h.scheduled).toHaveLength(1);
    await runScheduled();
    const e = h.recordAiUsage.mock.calls[0][0] as { attemptNo: number; provider: string };
    expect(e.attemptNo).toBe(0);
    expect(e.provider).toBe("nvidia");
  });

  it("🚫 مافيش duplicate scheduling", async () => {
    const router = new AiRouter([provider("groq", vi.fn(ok("ok")))]);

    await router.completeChat("chat", { ...input, usage: ctx });
    await runScheduled();
    await runScheduled();

    // ⬇️ تشغيل الـ queue مرتين مابيسبّش تكرار في الكتابة.
    expect(h.recordAiUsage).toHaveBeenCalledTimes(1);
  });

  it("🚫 مافيش scheduling من غير usage", async () => {
    const router = new AiRouter([provider("groq", vi.fn(ok("ok")))]);
    const res = await router.completeChat("chat", input);

    expect(res.content).toBe("ok");
    expect(h.scheduled).toHaveLength(0);
  });
});

/* ═══════════ الضمانة الحاسمة: الـ AI ماينكسرش ═══════════ */

describe("C3.2 — الـ AI ماينكسرش بسبب الجدولة", () => {
  it("🛡️ فشل `after()` (بره request scope) → تشغيل مباشر", async () => {
    // ⚠️ ده اللي بيحصل في unit tests وفي أي تشغيل خلفي.
    h.throwOutsideScope = true;
    const router = new AiRouter([provider("groq", vi.fn(ok("الرد")))]);

    const res = await router.completeChat("chat", { ...input, usage: ctx });

    // ⬇️ الرد وصل، والكتابة اتعملت على طول من غير ما نرمي.
    expect(res.content).toBe("الرد");
    expect(h.recordAiUsage).toHaveBeenCalledTimes(1);
  });

  it("🛡️ الـ response بيرجع قبل الكتابة (مافيش latency)", async () => {
    const router = new AiRouter([provider("groq", vi.fn(ok("الرد")))]);

    // ⬇️ النداء نفسه بيرجع، والـ queue لسه مليانة — يعني مافيش انتظار.
    await router.completeChat("chat", { ...input, usage: ctx });

    expect(h.scheduled).toHaveLength(1);
    expect(h.recordAiUsage).not.toHaveBeenCalled();
  });

  it("🛡️ فشل الكتابة بعد الجدولة مابيرجعش لـ AI", async () => {
    h.recordAiUsage.mockRejectedValueOnce(new Error("db down") as never);
    const router = new AiRouter([provider("groq", vi.fn(ok("الرد")))]);

    const res = await router.completeChat("chat", { ...input, usage: ctx });

    // ⬇️ الـ AI رجّع **قبل** ما الكتابة تتنفّذ أصلاً — ففشلها مش قادر يمسّه.
    expect(res.content).toBe("الرد");

    // ⬇️ وNext بيتعامل مع خطأ الـ callback بعد الـ response (بيسجّله بس).
    //   فالمشكلة لو الكتابة فشلت، مش لو الـ runtime شال الـ request.
    const queued = [...h.scheduled];
    const settled = await Promise.allSettled(queued.map((cb) => cb()));
    expect(settled[0].status).toBe("rejected");
  });
});