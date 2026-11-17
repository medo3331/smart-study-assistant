import { describe, it, expect } from "vitest";

/**
 * `summarizeProviderFailure` — استخراج **سبب** فشل المزوّدات.
 *
 * ⚠️ **اللي بيحصل من غيره**: بعد استنزاف كل المرشحين، الراوتر بيرمي
 *    `AiRouteError` — وهو **مالوش** `status` (الأرقام جوه `reasons`).
 *    فالراوت اللي بيفحص `error.status` بيلاقي `undefined` ⇒ 502 عشوائي
 *    والطالب بيشوف «الخدمة رجعت خطأ» بدل «الكوتة خلصت» أو «المهلة خلصت».
 *
 * الهدف: نرجّع أرقام حقيقية ⇒ نعرض الرسالة الصح ونستانس الطالب.
 */
describe("summarizeProviderFailure — قراءة سبب فشل المزوّد", async () => {
  it("AiRouteError: كوتة على كل المرشحين ⇒ allRateLimited", async () => {
    const { summarizeProviderFailure } = await import("../errors");
    const { AiRouteError } = await import("../routing");

    const error = new AiRouteError("All AI candidates failed", "chat", [
      { provider: "groq", model: "llama", ok: false, reason: "HTTP 429" },
      { provider: "openrouter", model: "gpt", ok: false, reason: "HTTP 429" },
    ]);

    const summary = summarizeProviderFailure(error);
    expect(summary.status).toBe(429);
    expect(summary.allRateLimited).toBe(true);
    expect(summary.hasTimeout).toBe(false);
    expect(summary.hasServerError).toBe(false);
    expect(summary.attempts).toHaveLength(2);
    expect(summary.attempts[0]).toMatchObject({ provider: "groq" });
  });

  it("AiRouteError: مهلة ⇒ hasTimeout", async () => {
    const { summarizeProviderFailure } = await import("../errors");
    const { AiRouteError } = await import("../routing");

    const error = new AiRouteError("timeout", "chat", [
      { provider: "groq", ok: false, reason: "HTTP 504" },
    ]);

    const summary = summarizeProviderFailure(error);
    expect(summary.status).toBe(504);
    expect(summary.hasTimeout).toBe(true);
  });

  it("AiRouteError: خطأ خادم 500 ⇒ hasServerError (مش rate limit)", async () => {
    const { summarizeProviderFailure } = await import("../errors");
    const { AiRouteError } = await import("../routing");

    const error = new AiRouteError("server error", "chat", [
      { provider: "groq", ok: false, reason: "HTTP 500" },
    ]);

    const summary = summarizeProviderFailure(error);
    expect(summary.status).toBe(500);
    expect(summary.hasServerError).toBe(true);
    expect(summary.allRateLimited).toBe(false);
  });

  it("AiRouteError: استجابة فاضية ⇒ reasonCode = EMPTY_RESPONSE", async () => {
    const { summarizeProviderFailure } = await import("../errors");
    const { AiRouteError } = await import("../routing");

    const error = new AiRouteError("empty", "chat", [
      { provider: "groq", ok: false, reason: "EMPTY_RESPONSE" },
    ]);

    const summary = summarizeProviderFailure(error);
    expect(summary.reasonCode).toBe("EMPTY_RESPONSE");
    expect(summary.status).toBe(200);
  });

  it("AiProviderError: بناخد الـstatus والـreasonCode مباشرة", async () => {
    const { summarizeProviderFailure } = await import("../errors");
    const { AiProviderError } = await import("../types");

    const summary = summarizeProviderFailure(
      new AiProviderError("rate limited", 429, "groq")
    );
    expect(summary.status).toBe(429);
    expect(summary.allRateLimited).toBe(true);
  });

  it("شكل غير معروف ⇒ status undefined (مش بنخترع أرقام)", async () => {
    const { summarizeProviderFailure } = await import("../errors");

    const summary = summarizeProviderFailure(new Error("boom"));
    expect(summary.status).toBeUndefined();
    expect(summary.attempts).toEqual([]);
  });
});

describe("parseAttemptStatus", async () => {
  it("بيقرا الأرقام من نص المزوّد", async () => {
    const { parseAttemptStatus } = await import("../errors");
    expect(parseAttemptStatus("HTTP 429")).toBe(429);
    expect(parseAttemptStatus("HTTP 503")).toBe(503);
    expect(parseAttemptStatus("TIMEOUT")).toBe(504);
    expect(parseAttemptStatus("EMPTY_RESPONSE")).toBe(200);
    expect(parseAttemptStatus(undefined)).toBeUndefined();
  });
});
