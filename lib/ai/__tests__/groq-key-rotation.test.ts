import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * تدوير مفاتيح Groq — نفس خدعة `/api/generate-slides`:
 * GROQ_API_KEY_1 → _2 → _3 → GROQ_API_KEY، ومفتاح بيرجع 429/401/403
 * بيتخطّى جوه نفس الطلب (مش بنفشل الطلب كله).
 *
 * ده اللي بيمنع الـ 503: مفتاح واحد اتعيّط ⇒ التاني بيشتغل.
 */
describe("GroqProvider — تدوير المفاتيح", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.resetModules();
    delete process.env.GROQ_API_KEY_1;
    delete process.env.GROQ_API_KEY_2;
    delete process.env.GROQ_API_KEY_3;
    delete process.env.GROQ_API_KEY;
  });

  function okResponse(content: string) {
    return new Response(
      JSON.stringify({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  it("مفتاح 429 ⇒ بيكمّل بالمفتاح اللي بعده", async () => {
    process.env.GROQ_API_KEY_1 = "key-one";
    process.env.GROQ_API_KEY_2 = "key-two";
    process.env.GROQ_API_KEY_3 = "key-three";

    const usedKeys: string[] = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init: { headers?: Record<string, string> }) => {
      const auth = init.headers?.Authorization ?? "";
      const key = auth.replace("Bearer ", "");
      usedKeys.push(key);
      if (key === "key-one") {
        return new Response("rate limited", { status: 429 });
      }
      return okResponse("ال-answer");
    }) as unknown as typeof fetch;

    vi.resetModules();
    const { GroqProvider } = await import("../groq");
    const provider = new GroqProvider();
    const response = await provider.completeChat({
      messages: [{ role: "user", content: "امتحان" }],
      model: "openai/gpt-oss-20b",
    });

    expect(response.content).toBe("ال-answer");
    expect(usedKeys[0]).toBe("key-one");
    // الطلب اتكمّل بالمفتاح التاني — مافيش 503.
    expect(usedKeys).toContain("key-two");
    expect(usedKeys.length).toBeGreaterThanOrEqual(2);
  });

  it("كل المفاتيح اتعيّطت ⇒ خطأ 429 واضح (مش 503 غامض)", async () => {
    process.env.GROQ_API_KEY_1 = "key-one";
    process.env.GROQ_API_KEY_2 = "key-two";

    globalThis.fetch = vi.fn(
      async () => new Response("rate limited", { status: 429 })
    ) as unknown as typeof fetch;

    vi.resetModules();
    const { GroqProvider } = await import("../groq");
    const provider = new GroqProvider();

    // ⚠️ بنمسك الخطأ من نفس نسخة الـmodules (بعد resetModules) عشان
    //    `instanceof` يبقى متسق.
    const { AiProviderError: ProviderError } = await import("../types");

    let thrown: unknown = null;
    try {
      await provider.completeChat({ messages: [{ role: "user", content: "امتحان" }] });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as InstanceType<typeof ProviderError>).status).toBe(429);
    expect((thrown as InstanceType<typeof ProviderError>).message).toContain("rate limited");
  });

  it("المهلة الافتراضية 20s، والمطلوبة بتتقفل بسقف 120s", async () => {
    vi.resetModules();
    const { resolveGroqTimeoutMs, GROQ_TIMEOUT_MS, GROQ_MAX_TIMEOUT_MS } = await import("../groq");
    expect(resolveGroqTimeoutMs(undefined)).toBe(GROQ_TIMEOUT_MS);
    expect(resolveGroqTimeoutMs(60_000)).toBe(60_000);
    expect(resolveGroqTimeoutMs(999_999)).toBe(GROQ_MAX_TIMEOUT_MS);
    expect(resolveGroqTimeoutMs(10)).toBe(5_000);
  });
});
