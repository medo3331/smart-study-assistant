/**
 * 🧾 اختبار قياس المحاولات على حدّ المزوّد — Phase 5-C3
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 🎯 **الادعاء اللي الملف ده بياثبته:**
 *
 *   طلب منطقي واحد = سطر واحد لكل **محاولة مزوّد فعلية**.
 *
 *   ❌ مش: `runAiTask` → سطر واحد.
 *   \u2705 : Groq attempt \u2192 \u0633\u0637\u0631\u060c NVIDIA fallback \u2192 \u0633\u0637\u0631 \u062a\u0627\u0646\u064a.
 *
 *   والفرق الوحيد بين السطرين: `attemptNo`.
 *   `operationId` و `idempotencyKey` **ثابتين**.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── سجلّ الـ accounting ──
 * بنجمع الـ events بدل ما نكتب في DB — مافيش Supabase ولا API keys. */
/**
 * ⚠️ كل الـ mocks بتاخد قيمها من `vi.hoisted` — مش من variables عادية.
 *   `vi.mock` بيترفع (hoist) فوق السطور دي، فأي متغير top-level جواها
 *   بيطلع `undefined` وقت التنفيذ ويكسر الملف كله.
 */
const h = vi.hoisted(() => ({
  recordAiUsage: vi.fn<(e: Record<string, unknown>) => Promise<void>>(async () => {}),
  healthByProvider: { groq: "OK", nvidia: "OK" } as Record<string, string>,
  models: {
    groq: { id: "m-groq", provider: "groq", capabilities: ["text"], enabled: true, freeEndpoint: true, priority: 1 },
    nvidia: { id: "m-nv", provider: "nvidia", capabilities: ["text"], enabled: true, freeEndpoint: true, priority: 2 },
  },
}));

/** سجلّ الـ accounting — بنجمع الـ events بدل ما نكتب في DB. */
const recordAiUsage = h.recordAiUsage;

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
import { resolveUsageRequestContext } from "../usage-context";

const input: AiChatRequest = { messages: [{ role: "user", content: "hi" }] };

/** ⏱️ flush للـ promises المعلّقة — التسجيل fire-and-forget عن قصد. */
const flush = () => new Promise((r) => setTimeout(r, 0));

/** مزوّد وهمي — التنفيذ الفعلي بيتبعت كـ callback ومفيش cast غامض. */
function provider(
  name: AiProviderName,
  impl: (req: AiChatRequest) => Promise<unknown>,
): AiTextProvider {
  return { name, completeChat: impl } as unknown as AiTextProvider;
}

function ok(content: string, usage?: { promptTokens?: number; completionTokens?: number }) {
  return async () => ({
    provider: "groq" as AiProviderName,
    model: "m-groq",
    content,
    payload: {},
    usage,
  });
}

/** السياق الثابت اللي بنمرّره — مفيش جيل جوّه المسار. */
const ctx = {
  operationId: "OP-123",
  idempotencyKey: "KEY-456",
  source: "server" as const,
  userId: "u1",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.healthByProvider = { groq: "OK", nvidia: "OK" };
});
/* ═══════════ ★ الأدعاء الأساسي: محاولة واحدة = سطر واحد ═══════════ */

describe("C3 — boundary على مستوى المحاولة", () => {
  it("محاولة ناجحة واحدة = سطر واحد", async () => {
    const groq = vi.fn(ok("مرحبا"));
    const router = new AiRouter([
      provider("groq", groq),
      provider("nvidia", vi.fn(ok("من nvidia"))),
    ]);

    await router.completeChat("chat", { ...input, usage: ctx });
    await flush();

    // ⬇️ لمسة واحدة للمزوّد = سطر واحد للتسجيل.
    expect(groq).toHaveBeenCalledTimes(1);
    expect(recordAiUsage).toHaveBeenCalledTimes(1);
    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: "OP-123", idempotencyKey: "KEY-456", attemptNo: 0 }),
    );
  });

  it("⭐ fallback = سطرين (Groq فشل + NVIDIA نجح)", async () => {
    const groq = vi.fn(async () => {
      throw new AiProviderError("rate", 429, "groq");
    });
    const nvidia = vi.fn(ok("من nvidia"));
    const router = new AiRouter([provider("groq", groq), provider("nvidia", nvidia)]);

    await router.completeChat("chat", { ...input, usage: ctx });
    await flush();

    // 🎯 ده الاختبار اللي بيفرّق بين معمارية C3 ومعمارية "سطر لكل request".
    expect(groq).toHaveBeenCalledTimes(1);
    expect(nvidia).toHaveBeenCalledTimes(1);
    expect(recordAiUsage).toHaveBeenCalledTimes(2);
  });

  it("⭐ نفس operationId في السطرين", async () => {
    const router = new AiRouter([
      provider("groq", vi.fn(async () => { throw new AiProviderError("rate", 429, "groq"); })),
      provider("nvidia", vi.fn(ok("ok"))),
    ]);

    await router.completeChat("chat", { ...input, usage: ctx });
    await flush();

    const ops = recordAiUsage.mock.calls.map((c) => (c[0] as { operationId: string }).operationId);
    expect(ops).toEqual(["OP-123", "OP-123"]);
  });

  it("⭐ نفس idempotencyKey في السطرين", async () => {
    const router = new AiRouter([
      provider("groq", vi.fn(async () => { throw new AiProviderError("rate", 429, "groq"); })),
      provider("nvidia", vi.fn(ok("ok"))),
    ]);

    await router.completeChat("chat", { ...input, usage: ctx });
    await flush();

    const keys = recordAiUsage.mock.calls.map((c) => (c[0] as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toEqual(["KEY-456", "KEY-456"]);
  });

  it("⭐ attemptNo مختلف: 0 ثم 1", async () => {
    const router = new AiRouter([
      provider("groq", vi.fn(async () => { throw new AiProviderError("rate", 429, "groq"); })),
      provider("nvidia", vi.fn(ok("ok"))),
    ]);

    await router.completeChat("chat", { ...input, usage: ctx });
    await flush();

    const nos = recordAiUsage.mock.calls.map((c) => (c[0] as { attemptNo: number }).attemptNo);
    expect(nos).toEqual([0, 1]);
  });

  it("provider مختلف في كل سطر", async () => {
    const router = new AiRouter([
      provider("groq", vi.fn(async () => { throw new AiProviderError("rate", 429, "groq"); })),
      provider("nvidia", vi.fn(ok("ok"))),
    ]);

    await router.completeChat("chat", { ...input, usage: ctx });
    await flush();

    const names = recordAiUsage.mock.calls.map((c) => (c[0] as { provider: string }).provider);
    expect(names).toEqual(["groq", "nvidia"]);
  });

  it("⛓️ مافيش دمج: سطرين مختلفين مش سطر واحد", async () => {
    const router = new AiRouter([
      provider("groq", vi.fn(async () => { throw new AiProviderError("rate", 429, "groq"); })),
      provider("nvidia", vi.fn(ok("ok"))),
    ]);

    await router.completeChat("chat", { ...input, usage: ctx });
    await flush();

    // ⬇️ السطرين بيختلفوا في الـ tuple (attemptNo) — فمافيش dedupe بينهم.
    const tuples = recordAiUsage.mock.calls.map(
      (c) => {
        const e = c[0] as { userId: string | null; idempotencyKey: string; attemptNo: number };
        return `${e.userId}|${e.idempotencyKey}|${e.attemptNo}`;
      },
    );
    expect(new Set(tuples).size).toBe(2);
  });
});

/* ═══════════ pre-flight skips ═══════════ */

describe("C3 — التخطّي قبل النداء مش محاولة", () => {
  it("⛔ مزوّد في cooldown ما بياخدش attemptNo", async () => {
    h.healthByProvider = { groq: "RATE_LIMITED", nvidia: "OK" };
    const groq = vi.fn(ok("ماينفعش"));
    const nvidia = vi.fn(ok("ok"));

    const router = new AiRouter([provider("groq", groq), provider("nvidia", nvidia)]);
    await router.completeChat("chat", { ...input, usage: ctx });
    await flush();

    // ⚠️ المزوّد المتخطّى **مااتنادىش** — فمافيش سطر ليه...
    expect(groq).not.toHaveBeenCalled();
    expect(recordAiUsage).toHaveBeenCalledTimes(1);
    // ...وattemptNo بيبدأ من 0، مش 1.
    expect((recordAiUsage.mock.calls[0][0] as { attemptNo: number }).attemptNo).toBe(0);
    expect((recordAiUsage.mock.calls[0][0] as { provider: string }).provider).toBe("nvidia");
  });

  it("⛔ تخطّي متتالٍ: المزوّد التاني بيبقى 0 كمان", async () => {
    h.healthByProvider = { groq: "AUTH_ERROR", nvidia: "OK" };
    const router = new AiRouter([
      provider("groq", vi.fn(ok("x"))),
      provider("nvidia", vi.fn(ok("ok"))),
    ]);

    await router.completeChat("chat", { ...input, usage: ctx });
    await flush();

    expect(recordAiUsage).toHaveBeenCalledTimes(1);
    expect((recordAiUsage.mock.calls[0][0] as { attemptNo: number }).attemptNo).toBe(0);
  });

  it("⛔ مزوّد مش مُهيّأ ما بياخدش رقم", async () => {
    // ⬇️ router من غير مزوّد nvidia خالص.
    const router = new AiRouter([
      provider("groq", vi.fn(async () => { throw new AiProviderError("rate", 429, "groq"); })),
    ]);

    await expect(router.completeChat("chat", { ...input, usage: ctx })).rejects.toThrow();
    await flush();

    // ⬇️ سطر واحد بس (Groq)، ورقمه 0 — المزوّد الناقص مااخدش 1.
    expect(recordAiUsage).toHaveBeenCalledTimes(1);
    expect((recordAiUsage.mock.calls[0][0] as { attemptNo: number }).attemptNo).toBe(0);
  });
});
/* ═══════════ الحالات والتوكنات ═══════════ */

describe("C3 — mapping الحالة والبيانات", () => {
  it("نجاح = completed مع units=1", async () => {
    const router = new AiRouter([provider("groq", vi.fn(ok("ok")))]);
    await router.completeChat("chat", { ...input, usage: ctx });
    await flush();

    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", units: 1, provider: "groq" }),
    );
  });

  it("فشل 429 قبل الردّ = failed_no_response", async () => {
    const router = new AiRouter([provider("groq", vi.fn(async () => { throw new AiProviderError("rate", 429, "groq"); }))]);
    await expect(router.completeChat("chat", { ...input, usage: ctx })).rejects.toThrow();
    await flush();

    const e = recordAiUsage.mock.calls[0][0] as { status: string; units: number };
    expect(e.status).toBe("failed_no_response");
    // ⚠️ units = 1 للأدلة — مش قرار تسعير (ده شغل C5).
    expect(e.units).toBe(1);
  });

  it("ردّ فاشل (EMPTY_RESPONSE) = failed_after_response", async () => {
    const router = new AiRouter([
      provider("groq", vi.fn(async () => {
        throw new AiProviderError("empty", 200, "groq", "EMPTY_RESPONSE");
      })),
    ]);
    await expect(router.completeChat("chat", { ...input, usage: ctx })).rejects.toThrow();
    await flush();

    expect((recordAiUsage.mock.calls[0][0] as { status: string }).status).toBe("failed_after_response");
  });

  it("استثناء تاني = error", async () => {
    const router = new AiRouter([
      provider("groq", vi.fn(async () => { throw new Error("boom"); })),
    ]);
    await expect(router.completeChat("chat", { ...input, usage: ctx })).rejects.toThrow("boom");
    await flush();

    expect((recordAiUsage.mock.calls[0][0] as { status: string }).status).toBe("error");
  });

  it("⛓️ التوكنات بتتحفظ زي ما المزوّد رجّعها", async () => {
    const router = new AiRouter([
      provider("groq", vi.fn(ok("ok", { promptTokens: 120, completionTokens: 45 }))),
    ]);
    await router.completeChat("chat", { ...input, usage: ctx });
    await flush();

    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ promptTokens: 120, completionTokens: 45 }),
    );
  });

  it("⛓️ مافيش توكنات → null (مافيش تقدير!)", async () => {
    const router = new AiRouter([provider("groq", vi.fn(ok("ok")))]);
    await router.completeChat("chat", { ...input, usage: ctx });
    await flush();

    const e = recordAiUsage.mock.calls[0][0] as { promptTokens: unknown; completionTokens: unknown };
// ⬇️ undefined هنا = الـ helper هيحوّله null. المهم إننا **مافيش تقدير**.
    expect(e.promptTokens).toBeUndefined();
    expect(e.completionTokens).toBeUndefined();
  });

  it("⛓️ latency_ms بيتقاس لكل محاولة", async () => {
    const router = new AiRouter([provider("groq", vi.fn(ok("ok")))]);
    await router.completeChat("chat", { ...input, usage: ctx });
    await flush();

    const e = recordAiUsage.mock.calls[0][0] as { latencyMs: unknown };
    expect(typeof e.latencyMs).toBe("number");
  });

  it("feature بيجيب من AiTaskType (مش اسم route متخيّع)", async () => {
    const router = new AiRouter([provider("groq", vi.fn(ok("ok")))]);
    await router.completeChat("chat", { ...input, usage: ctx });
    await flush();

    // ⬇️ "chat" من الـ taxonomy الموجودة — مش "chat-route" ولا "api-chat".
    expect((recordAiUsage.mock.calls[0][0] as { feature: string }).feature).toBe("chat");
  });

  it("⛓️ user_id بينزل مع الحدث (والزائر = null)", async () => {
    const router = new AiRouter([provider("groq", vi.fn(ok("ok")))]);
    await router.completeChat("chat", { ...input, usage: { ...ctx, userId: null } });
    await flush();

    expect((recordAiUsage.mock.calls[0][0] as { userId: string | null }).userId).toBeNull();
  });

  it("⛓️ مافيش IP ولا cookie في الـ metadata", async () => {
    const router = new AiRouter([provider("groq", vi.fn(ok("ok")))]);
    await router.completeChat("chat", { ...input, usage: ctx });
    await flush();

    const e = recordAiUsage.mock.calls[0][0] as { metadata: Record<string, unknown> };
    expect(Object.keys(e.metadata)).not.toContain("ip");
    expect(Object.keys(e.metadata)).not.toContain("sessionId");
    // ⬇️ source ثابت لكل محاولات الطلب الواحد — مش بيتغيّر مع الـ attempt.
    expect(e.metadata.source).toBe("server");
  });
});

/* ═══════════ ★ ممنوع: تغيير سلوك ═══════════ */

describe("C3 — ممنوع يمسّCredits أو حدود", () => {
  it("⛔ فشل التسجيل مايكسرش رد الـ AI", async () => {
    // 🛡️ أهم ضمان: لو الـ DB واقع، المستخدم يفضل بياخد ردّه عادي.
    recordAiUsage.mockRejectedValueOnce(new Error("db down") as never);
    const router = new AiRouter([provider("groq", vi.fn(ok("الرد")))]);

    const res = await router.completeChat("chat", { ...input, usage: ctx });
    await flush();

    // ⬇️ الرد وصل عادي.
    expect(res.content).toBe("الرد");
  });

  it("⛔ مافيش أي context من غير usage (سلوك قديم زي ما هو)", async () => {
    const router = new AiRouter([provider("groq", vi.fn(ok("ok")))]);
    const res = await router.completeChat("chat", input);
    await flush();

    expect(res.content).toBe("ok");
    // ⚠️ المسارات غير المربوطة (الـ12 في C4) بتفضل شغالة **بلا تسجيل**.
    expect(recordAiUsage).not.toHaveBeenCalled();
  });

  it("⛔ الـ fallback لسه بيرجّع نفس الشكل", async () => {
    const router = new AiRouter([
      provider("groq", vi.fn(async () => { throw new AiProviderError("rate", 429, "groq"); })),
      provider("nvidia", vi.fn(ok("ok-from-nvidia"))),
    ]);

    const res = await router.completeChat("chat", { ...input, usage: ctx });
    await flush();

    expect(res.content).toBe("ok-from-nvidia");
    // ⚠️ عداد المحاولات في الرد لسه زي ما هو — التسجيل ما لمسوش.
    expect(res.fallback?.attempts).toHaveLength(2);
  });
});

/* ═══════════ حلّ السياق عند حدّ الطلب ═══════════ */

describe("C3 — resolveUsageRequestContext", () => {
  const mkReq = (headers?: Record<string, string>) =>
    new Request("http://localhost/api/chat", { method: "POST", headers });

  it("✅ header موجود → بيتستخدم زي ما هو", () => {
    const ctx1 = resolveUsageRequestContext(mkReq({ "Idempotency-Key": "abc-123" }), "u1");
    expect(ctx1.idempotencyKey).toBe("abc-123");
    expect(ctx1.source).toBe("client");
  });

  it("✅ مافيش header → UUID واحد من السيرفر", () => {
    const ctx1 = resolveUsageRequestContext(mkReq(), "u1");
    expect(ctx1.source).toBe("server");
    expect(ctx1.idempotencyKey).toBeTruthy();
    expect(ctx1.operationId).toBeTruthy();
  });

  it("⭐ نفس الـ context بيتنقّل عبر كل المحاولات", async () => {
    const ctx1 = resolveUsageRequestContext(mkReq({ "Idempotency-Key": "KEY-789" }), "u1");
    const router = new AiRouter([
      provider("groq", vi.fn(async () => { throw new AiProviderError("rate", 429, "groq"); })),
      provider("nvidia", vi.fn(ok("ok"))),
    ]);

    await router.completeChat("chat", { ...input, usage: ctx1 });
    await flush();

    const keys = recordAiUsage.mock.calls.map((c) => (c[0] as { idempotencyKey: string }).idempotencyKey);
    const ops = recordAiUsage.mock.calls.map((c) => (c[0] as { operationId: string }).operationId);

    // ⬇️ نفس الـ key بتاع الـ header في السطرين.
    expect(keys).toEqual(["KEY-789", "KEY-789"]);
    // ⬇️ ونفس الـ operationId في السطرين.
    expect(ops[0]).toBe(ops[1]);
  });

  it("header فاضي/مسافات → بيتولّد من السيرفر", () => {
    const ctx1 = resolveUsageRequestContext(mkReq({ "Idempotency-Key": "   " }), "u1");
    expect(ctx1.source).toBe("server");
    expect(ctx1.idempotencyKey).not.toBe("");
  });

  it("⛓️ طلبان مختلفان = هوية مختلفة", () => {
    const a = resolveUsageRequestContext(mkReq(), "u1");
    const b = resolveUsageRequestContext(mkReq(), "u1");
    // ⚠️ ده **صح**: طلب HTTP جديد = طلب منطقي جديد. الحماية من double-click
    //    محتاجة مفتاح من الكلاينت (phase لاحقة).
    expect(a.operationId).not.toBe(b.operationId);
  });

  it("⛓️ مافيش IP ولا cookie في الـ context", () => {
    const ctx1 = resolveUsageRequestContext(mkReq(), "u1") as Record<string, unknown>;
    expect(Object.keys(ctx1)).toEqual(["operationId", "idempotencyKey", "source", "userId"]);
  });
});
