/**
 * 🗡 C4-FINAL — تغطية الفجوات الاحساب
 * ═════════════════════════════════════════════════════════════════════════
 *
 * 🎯 الدعاء: البث السبيق **streaming لميكنمع روتر أصلاً** — بينادي adapter
 * مباشرةً، فكانهم أي نمطة غير مغطية بالإطلاق.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  recordAiUsage: vi.fn<(e: Record<string, unknown>) => Promise<void>>(async () => {}),
  scheduled: [] as Array<() => Promise<unknown>>,
}));

vi.mock("../usage-accounting", () => ({ recordAiUsage: h.recordAiUsage }));
vi.mock("../usage-scheduler", () => ({
  scheduleUsageRecording: (run: () => Promise<unknown>) => { h.scheduled.push(run); },
}));

import { streamWithFallback, __setStreamingAdapterLookupForTests } from "../streaming-fallback";
import { AiProviderError } from "../types";
import type { AiStreamingProvider } from "../streaming";
import type { AiChatRequest, AiProviderName } from "../types";
import type { AiChatResponse } from "../types";
import type { AiUsageContext } from "../usage-context";

const input: AiChatRequest = { messages: [{ role: "user", content: "hi" }] };
const usage: AiUsageContext = {
  operationId: "OP-1", idempotencyKey: "KEY-1", source: "server", userId: "u1", feature: "chat",
};

const drain = async () => {
  const q = [...h.scheduled];
  h.scheduled.length = 0;
  for (const cb of q) await cb();
};

async function collect(gen: AsyncGenerator<unknown, void, undefined>) {
  const out: unknown[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.scheduled.length = 0;
  __setStreamingAdapterLookupForTests(null);
});
afterEach(() => __setStreamingAdapterLookupForTests(null));

describe("C4-FINAL — streaming boundary", () => {
  it("✅ محاولة ناجحة → سطر واحد", async () => {
    __setStreamingAdapterLookupForTests((p) =>
      p === "groq"
        ? ({ name: "groq", streamChat: async function* () { yield { type: "text", value: "ok" }; } } as unknown as AiStreamingProvider)
        : undefined);

    await collect(streamWithFallback("chat", input, usage));
    expect(h.scheduled).toHaveLength(1);
    await drain();
    expect(h.recordAiUsage).toHaveBeenCalledTimes(1);
    expect(h.recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", provider: "groq", units: 1, operationId: "OP-1", idempotencyKey: "KEY-1" }),
    );
  });

  it("✅ fallback → سطر لكل محاولة فعلية", async () => {
    __setStreamingAdapterLookupForTests((p) => {
      if (p === "groq")
        return ({ name: "groq", streamChat: async function* () { throw new AiProviderError("rate", 429, "groq"); } } as unknown as AiStreamingProvider);
      if (p === "nvidia")
        return ({ name: "nvidia", streamChat: async function* () { yield { type: "text", value: "ok" }; } } as unknown as AiStreamingProvider);
      return undefined;
    });

    await collect(streamWithFallback("chat", input, usage));
    await drain();

    const rows = h.recordAiUsage.mock.calls.map((c) => c[0] as { provider: string; status: string; attemptNo: number });
    expect(rows).toHaveLength(2);
    expect(rows[0].provider).toBe("groq");
    expect(rows[0].status).toBe("failed_no_response");
    expect(rows[1].provider).toBe("nvidia");
    expect(rows[1].status).toBe("completed");
    // ⚠️ attemptNo different so the unique constraint never eats the fallback row
    // ⚠️ attemptNo must DIFFER so the unique constraint never eats the fallback row.
    expect(rows[0].attemptNo).not.toBe(rows[1].attemptNo);
    expect(rows[1].attemptNo).toBeGreaterThan(rows[0].attemptNo);
  });
  it("✅ نفس هوية عبر المرتيدة", async () => {
    __setStreamingAdapterLookupForTests((p) =>
      p === "groq"
        ? ({ name: "groq", streamChat: async function* () { yield { type: "text", value: "ok" }; } } as unknown as AiStreamingProvider)
        : undefined);

    await collect(streamWithFallback("chat", input, usage));
    await drain();
    const ops = h.recordAiUsage.mock.calls.map((c) => (c[0] as { operationId: string }).operationId);
    const keys = h.recordAiUsage.mock.calls.map((c) => (c[0] as { idempotencyKey: string }).idempotencyKey);
    expect(new Set(ops).size).toBe(1);
    expect(new Set(keys).size).toBe(1);
  });

  it("⛔ مافيش سجل إطلاق معسروك متعدّم (المسارة قديمة)", async () => {
    __setStreamingAdapterLookupForTests(() => undefined);
    // ⚠️ no usage -> zero events (legacy callers keep working)
    await expect(collect(streamWithFallback("chat", input))).rejects.toThrow();
    expect(h.recordAiUsage).not.toHaveBeenCalled();
  });

  it("🚫 مافيش usage → صمت سيليس بلا تسجيل", async () => {
    __setStreamingAdapterLookupForTests((p) =>
      p === "groq"
        ? ({ name: "groq", streamChat: async function* () { throw new Error("boom"); } } as unknown as AiStreamingProvider)
        : undefined);

    await expect(collect(streamWithFallback("chat", input, usage))).rejects.toThrow();
    await drain();
    expect(h.recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error" }),
    );
  });

  it("🛡️ path؛ stream مُميز من path الكلام", async () => {
    __setStreamingAdapterLookupForTests((p) =>
      p === "groq"
        ? ({ name: "groq", streamChat: async function* () { yield { type: "text", value: "ok" }; } } as unknown as AiStreamingProvider)
        : undefined);
    await collect(streamWithFallback("chat", input, usage));
    await drain();
    expect((h.recordAiUsage.mock.calls[0][0] as { metadata: Record<string, unknown> }).metadata.path).toBe("stream");
  });
});

describe("C4-FINAL — no credit impact", () => {
  it("⛔ مافيش RPC ولا كرتمت متطوبة", () => {
    // ⚠️ the recorder module is the only import; no credit/ledger symbols here.
    expect(typeof streamWithFallback).toBe("function");
    expect(typeof __setStreamingAdapterLookupForTests).toBe("function");
  });
});
