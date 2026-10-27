/**
 * 🎯 C5 — recording coverage for `/api/unified-ai` at the provider boundary
 * ═════════════════════════════════════════════════════════════════════════
 *
 * 🚨 **The root-cause bug this file locks shut:**
 *
 *   Chat UI → POST `/api/unified-ai` → `lib/unified-ai/unified-ai.ts`
 *   → `callGroqWithModel` **directly**.
 *
 *   That path never touches `lib/ai/routing.ts` — and routing was the ONLY
 *   place that measured. Production symptom: the AI answers fine,
 *   `Error = 0`, and `ai_usage_events` gets **zero rows** for any chat.
 *
 * ⚠️ **Why these assertions exist at all:** the boundary itself is not
 *   interesting — the *identity* contract is. If someone re-routes this path
 *   through `routing.ts`, or forgets to pass `usage` down, these fail loudly
 *   instead of silently returning to zero coverage.
 *
 * ═══ Why we assert on `await`, not just "was called" ═══
 *   `scheduleUsageRecording` is `await`-based (C4.1) precisely so the write
 *   *completes*. An un-awaited call is a floating promise that gets dropped
 *   on a frozen server. So `settled` proves the insert finished before
 *   `unifiedAI` returned — not merely that it was invoked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  /**
   * ⚠️ Deliberately gated. The insert resolves ONLY when the test calls
   * `release()`. If the production code floats the promise (no `await`),
   * the row cannot possibly be written by the time we assert — which is
   * exactly the C4.1 production failure we are guarding against.
   *
   * A plain `async () => {}` mock is NOT enough here: a floating promise
   * still drains during the microtask checkpoint, so `settled` would read 1
   * either way and the test would pass against buggy code. Verified by
   * mutating the `await` away and watching this assertion still pass.
   */
  recordAiUsage: vi.fn<(e: Record<string, unknown>) => Promise<void>>(),
  settled: 0,
  release: (): void => {},
  /** The promise the mocked insert returns — closed until `release()`. */
  gate: undefined as Promise<void> | undefined,
}));

function deferredGate() {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => { open = resolve; });
  return { gate, open: () => open() };
}

vi.mock("@/lib/ai/usage-accounting", () => ({
  recordAiUsage: (e: Record<string, unknown>) => {
    h.recordAiUsage(e);
    return h.gate;
  },
}));
vi.mock("@/lib/ai/usage-scheduler", () => ({
  // Mirrors the real scheduler: awaits inside, never throws.
  scheduleUsageRecording: async (run: () => Promise<unknown>) => {
    try {
      await run();
      h.settled += 1;
    } catch {
      /* The real scheduler swallows this — the caller request must survive. */
    }
  },
}));

import { unifiedAI } from "../../unified-ai/unified-ai";
import type { AiUsageContext } from "../usage-context";

const usage: AiUsageContext = {
  operationId: "OP-C5",
  idempotencyKey: "KEY-C5",
  source: "server",
  userId: "u1",
  feature: "chat",
};

/** A realistic Groq response shape, including the usage block. */
const okBody = (text = "answer") => ({
  choices: [{ message: { content: text } }],
  usage: { prompt_tokens: 11, completion_tokens: 7 },
});

function jsonFetch(body: () => unknown) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body(),
    text: async () => "",
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.settled = 0;
  process.env.GROQ_API_KEY = "test-key";
  const { gate, open } = deferredGate();
  h.gate = gate;
  h.release = open;
});

/**
 * 🔑 Confirms the write actually COMPLETED, not merely that it was reached.
 *
 * `runBlocked` already proved the call could not resolve while the gate was
 * closed — i.e. the recording is genuinely `await`ed. This is the other half:
 * once released, exactly one row must land.
 */
function expectWriteWasAwaited() {
  expect(h.settled).toBe(1);
}

describe("C5 — /api/unified-ai usage coverage", () => {
  /**
   * Runs `unifiedAI` while the insert gate is CLOSED.
   *
   * Returns WITHOUT releasing the gate, plus a snapshot of `settled` taken
   * while the gate was still closed. Correct code is blocked on the insert at
   * that moment (`settled === 0`); a floating call would have sailed past it
   * (`settled === 1`). Callers release the gate via `h.release()` afterwards.
   */
  async function runBlocked(input: Parameters<typeof unifiedAI>[0]) {
    const pending = unifiedAI(input);
    // Let the provider + recording reach the still-closed gate.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // 🔬 THE DISCRIMINATING SNAPSHOT — taken while the gate is still closed.
    //   correct code → still blocked inside the provider call (false)
    //   floating bug → already resolved (true)
    let resolved = false;
    void pending.then(() => { resolved = true; }, () => { resolved = true; });
    await new Promise((r) => setTimeout(r, 0));
    const wasResolvedWhileBlocked = resolved;

    // Now unblock so `await pending` can actually complete.
    h.release();
    return { pending, wasResolvedWhileBlocked };
  }

  it("✅ success → exactly one row, feature=chat, and the write was AWAITED", async () => {
    globalThis.fetch = jsonFetch(() => okBody());

    const { pending, wasResolvedWhileBlocked } = await runBlocked({ prompt: "explain this", usage });
    // 🔑 The call must still be blocked on the insert — this is the C4.1 contract.
    expect(wasResolvedWhileBlocked).toBe(false);

    const res = await pending;

    expect(res.ok).toBe(true);
    expect(h.recordAiUsage).toHaveBeenCalledTimes(1);

    const e = h.recordAiUsage.mock.calls[0][0];
    expect(e.feature).toBe("chat");
    expect(e.provider).toBe("groq");
    expect(e.status).toBe("completed");
    expect(e.attemptNo).toBe(0);
    // 🔑 The request identity travels down — never re-generated downstream.
    expect(e.operationId).toBe("OP-C5");
    expect(e.idempotencyKey).toBe("KEY-C5");
    // Token counts come from the provider verbatim, never estimated.
    expect(e.promptTokens).toBe(11);
    expect(e.completionTokens).toBe(7);
    expectWriteWasAwaited();
  });

  it("✅ provider HTTP error → failed_no_response, still recorded and awaited", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => "rate limited",
      json: async () => null,
    })) as unknown as typeof fetch;

    const { pending, wasResolvedWhileBlocked } = await runBlocked({ prompt: "explain this", usage });
    expect(wasResolvedWhileBlocked).toBe(false);

    const res = await pending;

    expect(res.ok).toBe(false);
    expect(h.recordAiUsage).toHaveBeenCalledTimes(1);
    expect(h.recordAiUsage.mock.calls[0][0].status).toBe("failed_no_response");
    expectWriteWasAwaited();
  });

  it("✅ empty content → failed_after_response (NOT completed), still awaited", async () => {
    globalThis.fetch = jsonFetch(() => ({ choices: [{ message: { content: "   " } }] }));

    const { pending, wasResolvedWhileBlocked } = await runBlocked({ prompt: "explain this", usage });
    expect(wasResolvedWhileBlocked).toBe(false);

    const res = await pending;

    expect(res.ok).toBe(false);
    expect(h.recordAiUsage.mock.calls[0][0].status).toBe("failed_after_response");
    expectWriteWasAwaited();
  });

  it("✅ network throw → failed_no_response, awaited, and the caller's contract is unchanged", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;

    const { pending, wasResolvedWhileBlocked } = await runBlocked({ prompt: "explain this", usage });
    expect(wasResolvedWhileBlocked).toBe(false);

    const res = await pending;

    expect(res.ok).toBe(false);
    expect(h.recordAiUsage.mock.calls[0][0].status).toBe("failed_no_response");
    expectWriteWasAwaited();
  });

  it("✅ no usage context → no row (back-compat for other callers)", async () => {
    globalThis.fetch = jsonFetch(() => okBody());

    const res = await unifiedAI({ prompt: "explain this" });

    expect(res.ok).toBe(true);
    expect(h.recordAiUsage).not.toHaveBeenCalled();
  });

  it("✅ a DB failure never breaks the request — the golden rule", async () => {
    // Reject immediately (no gate involved): the scheduler must swallow it.
    h.gate = Promise.reject(new Error("db down"));
    globalThis.fetch = jsonFetch(() => okBody());

    const res = await unifiedAI({ prompt: "explain this", usage });

    expect(res.ok).toBe(true);
    expect(res.answer).toBeTruthy();
  });
});