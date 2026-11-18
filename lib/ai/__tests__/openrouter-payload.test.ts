import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * OpenRouter — الردود غير الصالحة لازم تتحوّل **فشل مؤقت** يقبل الـfallback
 * للمزوّد اللي بعده، لا رد فاضي (200) بيوقف السلسلة.
 *
 * ⚠️ الأصل: OpenRouter بيرجّع أحياناً HTTP 200 بجسم فيه `error` (كوتة،
 *    موديل مش متاح، بلوك) أو من غير `choices` أوي. الرد ده كان بيتقرا
 *    «محتوى فاضي» ⇒ خطأ 200 ⇒ الراوتر كان بيقف عند المزوّد ده.
 */
describe("OpenRouter — التحقق من جسم الرد", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("رد فيه error + كود 429 ⇒ 429 (كوتة)", async () => {
    const { validateOpenRouterPayload } = await import("../openrouter");
    const { AiProviderError } = await import("../types");

    let thrown: unknown = null;
    try {
      validateOpenRouterPayload({ error: { code: 429, message: "Rate limit exceeded" } });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AiProviderError);
    expect((thrown as InstanceType<typeof AiProviderError>).status).toBe(429);
  });

  it("رد فيه error من غير كود ⇒ 502 (فشل مؤقت)", async () => {
    const { validateOpenRouterPayload } = await import("../openrouter");
    const { AiProviderError } = await import("../types");

    let thrown: unknown = null;
    try {
      validateOpenRouterPayload({ error: { message: "upstream exploded" } });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AiProviderError);
    expect((thrown as InstanceType<typeof AiProviderError>).status).toBe(502);
  });

  it("رسالة كوتة بدون كود ⇒ 429 (متصنّفة نصاً)", async () => {
    const { validateOpenRouterPayload } = await import("../openrouter");
    const { AiProviderError } = await import("../types");

    let thrown: unknown = null;
    try {
      validateOpenRouterPayload({ error: { message: "You have exceeded your credit limit" } });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as InstanceType<typeof AiProviderError>).status).toBe(429);
  });

  it("رد من غير choices ⇒ 502", async () => {
    const { validateOpenRouterPayload } = await import("../openrouter");
    const { AiProviderError } = await import("../types");

    let thrown: unknown = null;
    try {
      validateOpenRouterPayload({ choices: [] });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AiProviderError);
    expect((thrown as InstanceType<typeof AiProviderError>).status).toBe(502);
  });

  it("رد مش object ⇒ 502", async () => {
    const { validateOpenRouterPayload } = await import("../openrouter");
    const { AiProviderError } = await import("../types");

    let thrown: unknown = null;
    try {
      validateOpenRouterPayload(null);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as InstanceType<typeof AiProviderError>).status).toBe(502);
  });

  it("رد سليم ⇒ يعدّي زي ما هو", async () => {
    const { validateOpenRouterPayload } = await import("../openrouter");
    const payload = { choices: [{ message: { content: "أهلاً" } }], model: "x/y" };
    expect(validateOpenRouterPayload(payload)).toBe(payload);
  });

  it("المزوّد بيرمي 429 مش 200-فاضي (يعني fallback ممكن)", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.OPENROUTER_API_KEY;
    // ⚠️ مفتاح وهمي — الاختبار بيتكلم مع fetch المسخّر، مش مع OpenRouter.
    process.env.OPENROUTER_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 429, message: "slow down" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    ) as unknown as typeof fetch;

    const { OpenRouterProvider } = await import("../openrouter");
    const { AiProviderError } = await import("../types");
    const provider = new OpenRouterProvider();

    let thrown: unknown = null;
    try {
      await provider.completeChat({ messages: [{ role: "user", content: "امتحان" }] });
    } catch (error) {
      thrown = error;
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = originalKey;
    }

    expect(thrown).toBeInstanceOf(AiProviderError);
    // 429/502 = فشل مؤقت ⇒ الراوتر هيكمّل على مزوّد تاني.
    expect([429, 502]).toContain((thrown as InstanceType<typeof AiProviderError>).status);
  });
});
