import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * `withRetry` — إعادة المحاولة مع التباعد الأسي + `retry-after` + تدوير
 * المفاتيح جوه **نفس الطلب**.
 *
 * ⚠️ ده اللي بيمنع 503 «كل المزوّدات فشلوا» في التوليد:
 *    429 على مفتاح ⇒ المفتاح اللي بعده في نفس الطلب؛ لو كلهم اتعيطوا
 *    ⇒ استنى (retry-after أو 1s/2s/4s …حد 30s) وارجع تاني.
 */
describe("withRetry — التباعد الأسي", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("المحاولات بتتضاعف: 1s ثم 2s (السقف 30s)", async () => {
    const delays: number[] = [];
    let calls = 0;

    const { withRetry, backoffDelayMs } = await import("../groq");

    expect(backoffDelayMs(1)).toBe(1_000);
    expect(backoffDelayMs(2)).toBe(2_000);
    expect(backoffDelayMs(3)).toBe(4_000);
    // السقف: 1s × 2^9 = 512s ⇒ محدود بـ30s.
    expect(backoffDelayMs(10)).toBe(30_000);

    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) {
          const error = new Error("rate limited") as Error & { status: number };
          error.status = 429;
          throw error;
        }
        return "ok";
      },
      { sleep: async (ms) => { delays.push(ms); } }
    );

    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(delays).toEqual([1_000, 2_000]);
  });

  it("hdr retry-after بيتقدّم على الحساب اليدوي", async () => {
    const delays: number[] = [];
    let calls = 0;

    const { withRetry } = await import("../groq");
    await withRetry(
      async () => {
        calls += 1;
        if (calls < 2) {
          const error = new Error("rate limited") as Error & { status: number; retryAfterMs: number };
          error.status = 429;
          error.retryAfterMs = 7_000;
          throw error;
        }
        return "ok";
      },
      { sleep: async (ms) => { delays.push(ms); } }
    );

    expect(delays).toEqual([7_000]);
  });

  it("خطأ غير مؤقت (400) مش بيتعاد", async () => {
    const { withRetry } = await import("../groq");
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          const error = new Error("bad request") as Error & { status: number };
          error.status = 400;
          throw error;
        },
        { sleep: async () => {} }
      )
    ).rejects.toThrow("bad request");
    expect(calls).toBe(1);
  });

  it("محاولات محدودة — مافيش إعادة محاولة لا نهائية", async () => {
    const { withRetry } = await import("../groq");
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          const error = new Error("rate limited") as Error & { status: number };
          error.status = 429;
          throw error;
        },
        { maxAttempts: 3, sleep: async () => {} }
      )
    ).rejects.toThrow("rate limited");
    expect(calls).toBe(3);
  });
});

describe("parseRetryAfterMs — قراءة الهيدر", () => {
  it("أرقام (ثواني)", async () => {
    const { parseRetryAfterMs } = await import("../groq");
    expect(parseRetryAfterMs("5")).toBe(5_000);
    expect(parseRetryAfterMs("0")).toBe(0);
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs("")).toBeNull();
  });

  it("تاريخ HTTP", async () => {
    const { parseRetryAfterMs } = await import("../groq");
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:10 GMT", now)).toBe(10_000);
    // تاريخ في الماضي ⇒ صفر (مش سالب).
    expect(parseRetryAfterMs("Thu, 01 Jan 2020 00:00:00 GMT", now)).toBe(0);
  });
});

describe("GroqProvider — التدوير + إعادة المحاولة جوه نفس الطلب", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.resetModules();
    delete process.env.GROQ_API_KEY_1;
    delete process.env.GROQ_API_KEY_2;
    delete process.env.GROQ_API_KEY_3;
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_RETRY_BASE_MS;
  });

  function okResponse(content: string) {
    return new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  it("429 على كل المفاتيح ⇒ إعادة محاولة-generation بعد الانتظار", async () => {
    // ⏱️ أساس بمليمتر واحد بدل ثانية (عشان الاختبار ماب.waitش ثواني).
    process.env.GROQ_RETRY_BASE_MS = "1";
    process.env.GROQ_API_KEY_1 = "key-one";
    process.env.GROQ_API_KEY_2 = "key-two";

    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      // أول جولة: كل المفاتيح اتعيطت ⇒ بعدين بن-success.
      if (calls <= 2) return new Response("rate limited", { status: 429 });
      return okResponse("ال-answer");
    }) as unknown as typeof fetch;

    vi.resetModules();
    const { GroqProvider } = await import("../groq");
    const provider = new GroqProvider();
    const response = await provider.completeChat({
      messages: [{ role: "user", content: "امتحان" }],
    });

    expect(response.content).toBe("ال-answer");
    // اتنين نداءات اتعيطوا قبلband النجاح ⇒ فيه إعادة محاولة فعلًا.
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it("429 بمفتاح واحد ⇒ المفتاح التاني في نفس الطلب (من غير انتظار)", async () => {
    process.env.GROQ_API_KEY_1 = "key-one";
    process.env.GROQ_API_KEY_2 = "key-two";

    const used: string[] = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init: { headers?: Record<string, string> }) => {
      const key = (init.headers?.Authorization ?? "").replace("Bearer ", "");
      used.push(key);
      if (key === "key-one") return new Response("rate limited", { status: 429 });
      return okResponse("ال-answer");
    }) as unknown as typeof fetch;

    vi.resetModules();
    const { GroqProvider } = await import("../groq");
    const provider = new GroqProvider();
    const response = await provider.completeChat({
      messages: [{ role: "user", content: "امتحان" }],
    });

    expect(response.content).toBe("ال-answer");
    expect(used[0]).toBe("key-one");
    expect(used).toContain("key-two");
  });

  it("كل المفاتيح 429 ⇒ خطأ 429 (مش 503 غامض)", async () => {
    process.env.GROQ_RETRY_BASE_MS = "1";
    process.env.GROQ_API_KEY_1 = "key-one";

    globalThis.fetch = vi.fn(
      async () => new Response("rate limited", { status: 429 })
    ) as unknown as typeof fetch;

    vi.resetModules();
    const { GroqProvider } = await import("../groq");
    const { AiProviderError: ProviderError } = await import("../types");
    const provider = new GroqProvider();

    let thrown: unknown = null;
    try {
      await provider.completeChat({ messages: [{ role: "user", content: "امتحان" }] });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as InstanceType<typeof ProviderError>).status).toBe(429);
  });
});
