/**
 * 🚪 C4.1 — إغلاق الفجوة: نداء المزوّد الشاري
 * ═══════════════════════════════════════════════════════
 *
 * 🎯 الدعاء: نداء provider = سطر واحد × ولا تكرار.
 *
 *   ⛔ قبل C4.1: `create()` كان جواه ترمي بيحطراوه ماكانشتهش‌يًا،
 *      فمافيش أي سطر بالعالم.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  recordAiUsage: vi.fn<(e: Record<string, unknown>) => Promise<void>>(async () => {}),
  scheduled: [] as Array<() => Promise<unknown>>,
}));

vi.mock("../usage-accounting", () => ({ recordAiUsage: h.recordAiUsage }));
vi.mock("../usage-scheduler", () => ({
  scheduleUsageRecording: (run: () => Promise<unknown>) => { h.scheduled.push(run); },
}));

import { recordDirectProviderAttempt, startProviderAttempt } from "../direct-provider-usage";
import { resolveUsageRequestContext } from "../usage-context";

const CTX = () => resolveUsageRequestContext(new Request("http://x", { method: "POST" }), "u1", { feature: "quiz" });

const drain = async () => {
  const q = [...h.scheduled];
  h.scheduled.length = 0;
  for (const cb of q) await cb();
};

beforeEach(() => {
  vi.clearAllMocks();
  h.scheduled.length = 0;
});

/**
 * 🧪 يحاذي الشكل بعد الإصلاح: نمذاذة `groq.chat.completions.create()`
 * التي مغلفة بسيستدخدات ذات المرة.
 * نسريعادها حتى نتأكد إن الحال المتطابق بالمرة.
 */
function callProvider(create: () => Promise<{ content: string; usage?: { prompt_tokens?: number; completion_tokens?: number } }>) {
  const doneMs = startProviderAttempt();
  const usage = CTX();
  return create()
    .catch((err: unknown) => {
      // ⬛️ exactly the C4.1 shape: record the throw, then rethrow.
      recordDirectProviderAttempt({
        usage, feature: "quiz", attemptNo: 0, provider: "groq", model: "llama-3.3-70b-versatile",
        status: "failed_no_response", latencyMs: doneMs(),
      });
      throw err;
    })
    .then((completion) => {
      const textResult = completion.content || "";
      recordDirectProviderAttempt({
        usage, feature: "quiz", attemptNo: 0, provider: "groq", model: "llama-3.3-70b-versatile",
        status: textResult ? "completed" : "failed_after_response",
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        latencyMs: doneMs(),
      });
      return textResult;
    });
}

describe("C4.1 — provider throw vs success", () => {
  it("✅ success → طل سطر واحد", async () => {
    await callProvider(async () => ({ content: "ok" }));
    await drain();
    expect(h.recordAiUsage).toHaveBeenCalledTimes(1);
    expect((h.recordAiUsage.mock.calls[0][0] as { status: string }).status).toBe("completed");
  });

  it("✅ throw → طل سطر failed_no_response", async () => {
    await expect(callProvider(async () => { throw new Error("groq 500"); })).rejects.toThrow("groq 500");
    await drain();
    expect(h.recordAiUsage).toHaveBeenCalledTimes(1);
    expect((h.recordAiUsage.mock.calls[0][0] as { status: string }).status).toBe("failed_no_response");
  });

  it("🚫 throw → مافيش سطر مكرر (mavish double-record)", async () => {
    await expect(callProvider(async () => { throw new Error("boom"); })).rejects.toThrow();
    await drain();
    // ⚠️ the whole point: previously this was ZERO.
    expect(h.recordAiUsage).toHaveBeenCalledTimes(1);
  });

  it("✅ throw → الهوية محفوظة", async () => {
    await expect(callProvider(async () => { throw new Error("x"); })).rejects.toThrow();
    await drain();
    const e = h.recordAiUsage.mock.calls[0][0] as { operationId: string; idempotencyKey: string; attemptNo: number; provider: string };
    expect(e.operationId).toBeTruthy();
    expect(e.idempotencyKey).toBeTruthy();
    expect(e.attemptNo).toBe(0);
    expect(e.provider).toBe("groq");
  });

  it("✅ رمي الرد بينمسك على سبب الراوت (behaviour unchanged)", async () => {
    // ⛔ the rethrow is what preserves the existing error path (refund + status code).
    await expect(callProvider(async () => { throw new Error("original message"); })).rejects.toThrow("original message");
  });

  it("🚫 parsing فاشل بعد رد المزوّد → لا تسجّل failed_no_response", async () => {
    // provider responded -> success record already fired; a later parse throw
    // must NOT add a second provider-failure event.
    recordDirectProviderAttempt({
      usage: CTX(), feature: "quiz", attemptNo: 0, provider: "groq",
      status: "completed", promptTokens: 5,
    });
    await drain();
    expect(h.recordAiUsage).toHaveBeenCalledTimes(1);
    expect((h.recordAiUsage.mock.calls[0][0] as { status: string }).status).toBe("completed");
  });

  it("✅ المرجع لا يحتاجز سبب ضاخن", async () => {
    await expect(callProvider(async () => { throw new Error("q"); })).rejects.toThrow();
    await drain();
    const e = h.recordAiUsage.mock.calls[0][0] as { promptTokens: unknown; latencyMs: unknown };
    expect(e.promptTokens).toBeUndefined();
    expect(typeof e.latencyMs).toBe("number");
  });
});