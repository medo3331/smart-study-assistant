import { describe, it, expect } from "vitest";

/**
 * `provider-retry` — سياسة الإعادة الموحّدة لكل المزوّدات.
 *
 * ⚠️ **اللي كان**: Groq عنده retry، وOpenRouter **مBasicاً** — يعني
 *    أي 503 لحظي من OpenRouter كان بيرمي 502/503 للطالب على طول.
 *    دلوقتي الاتنين على نفس المكتبة ⇒ نفس السلوك: 429/500/502/503/504
 *    ⟹ إعادة محاولة بتباعد أسي، و`retry-after` بيتحترم.
 */
describe("provider-retry — السياسة الموحّدة", async () => {
  it("500 مؤقتة ⇒ بتعاد المحاولة (كانوا بيطلّعوا 500 فوري)", async () => {
    const { withRetry, isRetryableProviderStatus } = await import("../provider-retry");

    expect(isRetryableProviderStatus(500)).toBe(true);
    expect(isRetryableProviderStatus(502)).toBe(true);
    expect(isRetryableProviderStatus(503)).toBe(true);
    expect(isRetryableProviderStatus(504)).toBe(true);
    expect(isRetryableProviderStatus(429)).toBe(true);
    // ⚠️ أخطاء التهيئة (400/401/403) مش قابلة لإعادة المحاولة.
    expect(isRetryableProviderStatus(400)).toBe(false);
    expect(isRetryableProviderStatus(401)).toBe(false);
    expect(isRetryableProviderStatus(403)).toBe(false);

    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 2) {
          const error = new Error("server error") as Error & { status: number };
          error.status = 500;
          throw error;
        }
        return "ok";
      },
      { sleep: async () => {} }
    );

    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("التباعد الأسي: 1s ثم 2s", async () => {
    const { withRetry, backoffDelayMs } = await import("../provider-retry");

    expect(backoffDelayMs(1)).toBe(1_000);
    expect(backoffDelayMs(2)).toBe(2_000);
    expect(backoffDelayMs(3)).toBe(4_000);
    // السقف 30s.
    expect(backoffDelayMs(10)).toBe(30_000);

    const delays: number[] = [];
    let calls = 0;
    await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) {
          const error = new Error("busy") as Error & { status: number };
          error.status = 503;
          throw error;
        }
        return "ok";
      },
      { sleep: async (ms) => { delays.push(ms); } }
    );

    expect(delays).toEqual([1_000, 2_000]);
  });

  it("`retry-after` بيكوزم على الحساب اليدوي", async () => {
    const { parseRetryAfterMs, backoffDelayMs } = await import("../provider-retry");

    expect(parseRetryAfterMs("5")).toBe(5_000);
    expect(parseRetryAfterMs("2.5")).toBe(2_500);
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs("")).toBeNull();
    // تاريخ HTTP: ماضي ⇒ 0، مستقبل ⇒ الفرق.
    const future = new Date(Date.now() + 10_000).toUTCString();
    expect(parseRetryAfterMs(future)).toBeGreaterThan(5_000);

    // السقف بيفضل 30s حتى لو المزوّد طلب 120s.
    expect(backoffDelayMs(1, 120_000)).toBe(30_000);
  });

  it("خطأ غير مؤقت (400) ⇒ بيرمي فورًا من غير إعادة", async () => {
    const { withRetry } = await import("../provider-retry");

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

  it("3 محاولات بحد أقصى", async () => {
    const { withRetry } = await import("../provider-retry");

    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          const error = new Error("always busy") as Error & { status: number };
          error.status = 503;
          throw error;
        },
        { sleep: async () => {} }
      )
    ).rejects.toThrow("always busy");

    expect(calls).toBe(3);
  });

  it("الاسم القديم `withProviderRetry` لسه شغال (توافق)", async () => {
    const { withProviderRetry } = await import("../provider-retry");

    let calls = 0;
    const result = await withProviderRetry(
      async () => {
        calls += 1;
        if (calls < 2) {
          const error = new Error("flaky") as Error & { status: number };
          error.status = 502;
          throw error;
        }
        return 7;
      },
      { baseDelayMs: 0 }
    );

    expect(result).toBe(7);
    expect(calls).toBe(2);
  });
});
