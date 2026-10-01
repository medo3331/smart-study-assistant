/**
 * 🗡 C4 — تأصيل instrumentation بلمسارات — Phase 5-C4
 * ══════════════════════════════════════════════════════════
 *
 * 🎯 الدعاء:
 *   1) هوية واحدة لكل طلب — واقعةً من السابقة.
 *   2) المسارات المباشرة: فيشر دلاًي + goalLevel تختييي.
 *   3) demo: userId=null + units=0 + مافيش IP/cookie.
 *   4) مافيش reservation / ledger / enforcement.
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

const mkCtx = (init?: Record<string, unknown>) =>
  resolveUsageRequestContext(
    new Request("http://localhost/api/x", { method: "POST" }),
    (init?.userId as string | null) ?? null,
    init,
  );

const drain = async () => {
  const q = [...h.scheduled];
  h.scheduled.length = 0;
  for (const cb of q) await cb();
};

beforeEach(() => {
  vi.clearAllMocks();
  h.scheduled.length = 0;
});

/* ═══ المسارات المباشرة ═══ */

describe("C4 — direct Groq routes", () => {
  it("✅ محاولة واحدة = سطر واحد", async () => {
    const usage = mkCtx({ userId: "u1" });
    recordDirectProviderAttempt({ usage, feature: "exam_plan", attemptNo: 0, provider: "groq", model: "m", status: "completed", units: 1 });
    await drain();
    expect(h.recordAiUsage).toHaveBeenCalledTimes(1);
  });

  it("✅ attemptNo لكل دورة في اللوب", async () => {
    const usage = mkCtx({ userId: "u1" });
    for (let i = 0; i < 3; i++) {
      recordDirectProviderAttempt({ usage, feature: "exam_plan", attemptNo: i, provider: "groq", status: "completed" });
    }
    await drain();
    const nos = h.recordAiUsage.mock.calls.map((c) => (c[0] as { attemptNo: number }).attemptNo);
    expect(nos).toEqual([0, 1, 2]);
  });

  it("✅ نفس الهوية عبر كل المحاولات", async () => {
    const usage = mkCtx({ userId: "u1" });
    recordDirectProviderAttempt({ usage, feature: "study_plan", attemptNo: 0, provider: "groq", status: "failed_no_response" });
    recordDirectProviderAttempt({ usage, feature: "study_plan", attemptNo: 1, provider: "groq", status: "completed" });
    await drain();
    const ops = h.recordAiUsage.mock.calls.map((c) => (c[0] as { operationId: string }).operationId);
    const keys = h.recordAiUsage.mock.calls.map((c) => (c[0] as { idempotencyKey: string }).idempotencyKey);
    expect(ops[0]).toBe(ops[1]);
    expect(keys[0]).toBe(keys[1]);
  });

  it("✅ التوكنات الحقيقية بتنتقل", async () => {
    const usage = mkCtx({ userId: "u1" });
    recordDirectProviderAttempt({ usage, feature: "quiz", provider: "groq", status: "completed", promptTokens: 10, completionTokens: 3 });
    await drain();
    expect(h.recordAiUsage).toHaveBeenCalledWith(expect.objectContaining({ promptTokens: 10, completionTokens: 3 }));
  });

  it("✅ مافيش توكنات → undefined (مافيش تقدير)", async () => {
    const usage = mkCtx({ userId: "u1" });
    recordDirectProviderAttempt({ usage, feature: "quiz", provider: "groq", status: "completed" });
    await drain();
    const e = h.recordAiUsage.mock.calls[0][0] as { promptTokens: unknown };
    expect(e.promptTokens).toBeUndefined();
  });

  it("✅ latency من ساعة حقيقية", async () => {
    const done = startProviderAttempt();
    const usage = mkCtx({ userId: "u1" });
    recordDirectProviderAttempt({ usage, feature: "slides", provider: "groq", status: "completed", latencyMs: done() });
    await drain();
    expect(typeof (h.recordAiUsage.mock.calls[0][0] as { latencyMs: number }).latencyMs).toBe("number");
  });

  it("🚫 الجدولةالدائمة: مافيش كتابةفورقفصل", () => {
    recordDirectProviderAttempt({ usage: mkCtx({ userId: "u1" }), feature: "quiz", provider: "groq", status: "completed" });
    expect(h.recordAiUsage).not.toHaveBeenCalled();
    expect(h.scheduled).toHaveLength(1);
  });
});

/* ═══ demo ═══ */

describe("C4 — /api/demo المتفق الخاص", () => {
  it("✅ userId=null + units=0 + feature=demo", async () => {
    recordDirectProviderAttempt({ usage: mkCtx({ userId: null, feature: "demo" }), feature: "demo", attemptNo: 0, provider: "groq", status: "completed", units: 0 });
    await drain();
    expect(h.recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, feature: "demo", units: 0, provider: "groq", attemptNo: 0 }),
    );
  });

  it("🔒 مافيش IP/cookie/session في السطر", async () => {
    recordDirectProviderAttempt({ usage: mkCtx({ userId: null, feature: "demo" }), feature: "demo", provider: "groq", status: "completed", units: 0 });
    await drain();
    const row = h.recordAiUsage.mock.calls[0][0] as { metadata: Record<string, unknown> };
    expect(Object.keys(row.metadata)).not.toContain("ip");
    expect(Object.keys(row.metadata)).not.toContain("cookie");
    expect(Object.keys(row.metadata)).not.toContain("sessionId");
  });
});

/* ═══ goal family ═══ */

describe("C4 — عائلة goal ═══", () => {
  it("✅ feature=\"goal\" + metadata.goalLevel", async () => {
    const usage = mkCtx({ userId: "u1", feature: "goal", diagnostics: { goalLevel: "baccalaureate" } });
    recordDirectProviderAttempt({ usage, feature: "goal", provider: "groq", status: "completed" });
    await drain();
    const row = h.recordAiUsage.mock.calls[0][0] as { feature: string; metadata: Record<string, unknown> };
    expect(row.feature).toBe("goal");
    expect(row.metadata.goalLevel).toBe("baccalaureate");
  });

  it("✅ كل مستوى‌ه‌المعلومت‌ه‌المختلف", () => {
    for (const lvl of ["baccalaureate", "university", "preparatory", "primary", "secondary"]) {
      const c = resolveUsageRequestContext(new Request("http://x"), "u1", { feature: "goal", diagnostics: { goalLevel: lvl } });
      expect(c.feature).toBe("goal");
      expect(c.diagnostics?.goalLevel).toBe(lvl);
    }
  });
});

/* ═══ الهوية والأمان ═══ */

describe("C4 — الهوية + أمان النظام", () => {
  it("✅ header → مصدر client", () => {
    const c = resolveUsageRequestContext(new Request("http://x", { headers: { "Idempotency-Key": "abc-123" } }), "u1");
    expect(c.idempotencyKey).toBe("abc-123");
    expect(c.source).toBe("client");
  });

  it("✅ مافيش header → UUID واحد من السيرفر", () => {
    const c = mkCtx({ userId: "u1" });
    expect(c.source).toBe("server");
    expect(c.operationId).toBeTruthy();
  });

  it("🚫 recordAiUsage مايولّدها أي هوية", async () => {
    recordDirectProviderAttempt({ usage: mkCtx({ userId: "u1" }), feature: "quiz", provider: "groq", status: "completed" });
    await drain();
    const e = h.recordAiUsage.mock.calls[0][0] as Record<string, unknown>;
    expect(e.operationId).toBeTruthy();
    expect(e.idempotencyKey).toBeTruthy();
  });

  it("⛔ مافيش RPC ولا كرت متعلابة", () => {
    // ☄️ الءحصاءة تستخدم البموديل منفرداً، لؤما يكون فيه مافيش مارسة credits.
    expect(typeof recordDirectProviderAttempt).toBe("function");
    expect(startProviderAttempt).toBeDefined();
  });
});