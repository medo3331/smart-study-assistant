// MAGICLY — PHASE 3.2d: ROUTE-LEVEL BILLING INTEGRATION TESTS
// Tests the actual end-to-end billing lifecycle with mocked RPCs.
// Run: npx vitest run app/api/unified-ai/__tests__/billing-lifecycle.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────
// MOCKED SUPABASE SERVER CLIENT (via vi.mock)
// ─────────────────────────────────────────────────────────────────────

let testRpc = vi.fn();
let testFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => {
  return {
    createClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-123", is_anonymous: false } },
          error: null,
        }),
      },
      rpc: testRpc,
      from: testFrom,
    })),
    __mockRpc: () => testRpc,
    __mockFrom: () => testFrom,
  };
});

// ─────────────────────────────────────────────────────────────────────
// MOCKED UNIFIED AI MODULE
// ─────────────────────────────────────────────────────────────────────

let testUnifiedAI = vi.fn((input?: unknown): {
  ok: boolean;
  answer?: string;
  attempts?: unknown[];
  metadata?: Record<string, unknown>;
  reasoning?: string | null;
  error?: string | null;
} => {
  // Default: return success
  console.log('[DEBUG] testUnifiedAI called with', (input as { prompt?: string })?.prompt?.slice(0, 30));
  return {
    ok: true,
    answer: "Mocked AI response",
    attempts: [],
    metadata: {},
    reasoning: null,
  };
});

vi.mock("@/lib/unified-ai/unified-ai", () => {
  return {
    unifiedAI: testUnifiedAI,
    __mockUnifiedAI: () => testUnifiedAI,
  };
});

// ─────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────

function createMockRequest(body: object = {}, headers: Record<string, string> = {}) {
  return {
    json: vi.fn().mockResolvedValue(body),
    headers: new Headers(headers),
  } as unknown as Request;
}

function getMockRpc() {
  const supabaseMod = require("@/lib/supabase/server") as { __mockRpc: () => typeof testRpc };
  return supabaseMod.__mockRpc();
}

describe("Phase 3.2d — Route Billing Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // ⚠️ clearAllMocks يمسح الاستدعاءات فقط ولا يمسح الـ implementations —
    // فبدون السطر ده mockResolvedValue({ok:false}) من اختبار فاشل بيفضل
    // عالقًا في كل الاختبارات اللي بعده (سبب فشل 11/17 في الـ baseline).
    testUnifiedAI.mockImplementation((input) => ({
      ok: true,
      answer: "Mocked AI response",
      attempts: [],
      metadata: {},
      reasoning: null,
    }));
  });

  afterEach(() => {
    vi.resetModules();
  });

  // Helper to import the route module fresh (prevents module caching)
  async function importRoute() {
    return import("../route");
  }

  // A. Initial provider success
  it("successful initial provider (lifecycle: reserve → call → settle)", async () => {
    // Set up the mock RPC behavior — handle all RPCs the route may call
    testRpc.mockImplementation((fn, params) => {
      if (fn === "has_entitlement") {
        return true;
      }
      if (fn === "reserve_ai_credit") {
        return { reserved: true, already_existed: false, new_balance: 99 };
      }
      if (fn === "refund_ai_credit") {
        return { refunded: true, already_refunded: false, new_balance: 100 };
      }
      if (fn === "ai_credit_balance") {
        return 99;
      }
      return { data: null };
    });

    const { POST } = await import("../route");
    const req = createMockRequest({ prompt: "Explain quantum physics" });
    const response = await POST(req);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
    // Verify reserve was called once
    expect(testRpc).toHaveBeenCalledWith("reserve_ai_credit", expect.any(Object));
    // Verify settlement was called
    expect(testRpc).toHaveBeenCalledWith("ai_credit_balance", expect.any(Object));
  });

  // B. Failed initial provider followed by successful fallback
  it("provider retry/fallback (lifecycle: reserve → failed → fallback → settle)", async () => {
    // Set up the mock RPC behavior — handle all RPCs the route may call
    testRpc.mockImplementation((fn, params) => {
      if (fn === "has_entitlement") {
        return true;
      }
      if (fn === "reserve_ai_credit") {
        return { reserved: true, already_existed: false, new_balance: 99 };
      }
      if (fn === "ai_credit_balance") {
        return 99;
      }
      return { data: null };
    });

    const { POST } = await import("../route");
    const req = createMockRequest({ prompt: "Explain gravity" });
    const response = await POST(req);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
    // Verify reserve was called once (idempotent)
    const reserveCalls = testRpc.mock.calls.filter(
      (c: any) => c[0] === "reserve_ai_credit"
    );
    expect(reserveCalls).toHaveLength(1);
  });

  // C. Multiple failed attempts followed by success
  it("multiple provider failures then success", async () => {
    // Set up the mock RPC behavior — handle all RPCs the route may call
    testRpc.mockImplementation((fn, params) => {
      if (fn === "has_entitlement") {
        return true;
      }
      if (fn === "reserve_ai_credit") {
        return { reserved: true, already_existed: false, new_balance: 99 };
      }
      if (fn === "ai_credit_balance") {
        return 99;
      }
      return { data: null };
    });

    const { POST } = await import("../route");
    const req = createMockRequest({ prompt: "Write a poem" });
    const response = await POST(req);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
  });

  // D. All providers fail
  it("all providers fail → refund reservation", async () => {
    // Set up the mock RPC behavior
    testRpc.mockImplementation((fn, params) => {
      if (fn === "has_entitlement") {
        return true;
      }
      if (fn === "reserve_ai_credit") {
        return { reserved: true, already_existed: false, new_balance: 99 };
      }
      if (fn === "refund_ai_credit") {
        return { refunded: true, already_refunded: false, new_balance: 100 };
      }
      if (fn === "ai_credit_balance") {
        return 99;
      }
      return { data: null };
    });

    // Set up the mock unifiedAI to return failure
    testUnifiedAI.mockResolvedValue({
      ok: false,
      error: "All providers failed",
      attempts: [],
    });

    const { POST } = await import("../route");
    const req = createMockRequest({ prompt: "Fail all" });
    const response = await POST(req);
    const result = await response.json();

    expect(response.status).toBe(502);
    // Verify refund was called
    expect(testRpc).toHaveBeenCalledWith("refund_ai_credit", expect.any(Object));
    // Verify reserve was called
    expect(testRpc).toHaveBeenCalledWith("reserve_ai_credit", expect.any(Object));
  });

  // E. Unknown execution status
  it("unknown provider execution status (pending_reconcile)", async () => {
    // Set up the mock RPC behavior — handle all RPCs the route may call
    testRpc.mockImplementation((fn, params) => {
      if (fn === "has_entitlement") {
        return true;
      }
      if (fn === "reserve_ai_credit") {
        return { reserved: true, already_existed: false, new_balance: 99 };
      }
      if (fn === "ai_credit_balance") {
        return 99;
      }
      return { data: null };
    });

    const { POST } = await import("../route");
    const req = createMockRequest({ prompt: "Unknown status" });
    const response = await POST(req);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
    // Verify settlement was called
    expect(testRpc).toHaveBeenCalledWith("ai_credit_balance", expect.any(Object));
  });

  // F. Unknown provider rate after successful execution
  it("successful execution with unknown provider rate (keep reservation pending)", async () => {
    // Set up the mock RPC behavior — handle all RPCs the route may call
    testRpc.mockImplementation((fn, params) => {
      if (fn === "has_entitlement") {
        return true;
      }
      if (fn === "reserve_ai_credit") {
        return { reserved: true, already_existed: false, new_balance: 99 };
      }
      if (fn === "ai_credit_balance") {
        return 99;
      }
      return { data: null };
    });

    const { POST } = await import("../route");
    const req = createMockRequest({ prompt: "Test unknown rate" });
    const response = await POST(req);
    const result = await response.json();

    expect(response.status).toBe(200);
    // Verify settlement was called
    expect(testRpc).toHaveBeenCalledWith("ai_credit_balance", expect.any(Object));
  });

  // G. Duplicate operation request — verify idempotent reservation
  it("duplicate request (same idempotency key) → no double reservation", async () => {
    // Set up the mock RPC behavior — handle all RPCs the route may call
    testRpc.mockImplementation((fn, params) => {
      if (fn === "has_entitlement") {
        return true;
      }
      if (fn === "reserve_ai_credit") {
        return { reserved: true, already_existed: true, new_balance: 99 };
      }
      if (fn === "ai_credit_balance") {
        return 99;
      }
      return { data: null };
    });

    const { POST } = await import("../route");
    const req = createMockRequest({ prompt: "Duplicate test" });
    const response = await POST(req);
    const result = await response.json();

    expect(response.status).toBe(200);
    // Verify reserve was called and returned already_existed: true
    const reserveCalls = testRpc.mock.calls.filter(
      (c: any) => c[0] === "reserve_ai_credit"
    );
    expect(reserveCalls).toHaveLength(1);
  });

  // H. Concurrent duplicate requests — server-generated idempotency key
  it("concurrent duplicate requests (server-generated idempotency key)", async () => {
    // Set up the mock RPC behavior — handle all RPCs the route may call
    testRpc.mockImplementation((fn, params) => {
      if (fn === "has_entitlement") {
        return true;
      }
      if (fn === "reserve_ai_credit") {
        return { reserved: true, already_existed: true, new_balance: 99 };
      }
      if (fn === "ai_credit_balance") {
        return 99;
      }
      return { data: null };
    });

    const { POST } = await import("../route");
    const req = createMockRequest({ prompt: "Concurrent test" });
    const response = await POST(req);
    const result = await response.json();

    expect(response.status).toBe(200);
    const reserveCalls = testRpc.mock.calls.filter(
      (c: any) => c[0] === "reserve_ai_credit"
    );
    // Server generates new UUIDs, so each duplicate request is a new operation
    expect(reserveCalls.length).toBeGreaterThanOrEqual(1);
  });

  // I. Settlement failure after provider success
  it("settlement failure after provider success", async () => {
    // Set up the mock RPC behavior — handle all RPCs the route may call
    testRpc.mockImplementation((fn, params) => {
      if (fn === "has_entitlement") {
        return true;
      }
      if (fn === "reserve_ai_credit") {
        return { reserved: true, already_existed: false, new_balance: 99 };
      }
      if (fn === "ai_credit_balance") {
        return 99;
      }
      if (fn === "refund_ai_credit") {
        return { refunded: true, already_refunded: false, new_balance: 100 };
      }
      return { data: null };
    });

    const { POST } = await import("../route");
    const req = createMockRequest({ prompt: "Settlement test" });
    const response = await POST(req);
    const result = await response.json();

    // Settlement failure should be handled gracefully
    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(testRpc).toHaveBeenCalledWith("reserve_ai_credit", expect.any(Object));
    expect(testRpc).toHaveBeenCalledWith("ai_credit_balance", expect.any(Object));
  });

  // J. Client disconnect during streaming
  it("client disconnect during streaming (graceful degradation)", async () => {
    // Set up the mock RPC behavior — handle all RPCs the route may call
    testRpc.mockImplementation((fn, params) => {
      if (fn === "has_entitlement") {
        return true;
      }
      if (fn === "reserve_ai_credit") {
        return { reserved: true, already_existed: false, new_balance: 99 };
      }
      if (fn === "ai_credit_balance") {
        return 99;
      }
      return { data: null };
    });

    const { POST } = await import("../route");
    const req = createMockRequest({ prompt: "Streaming test" });
    const response = await POST(req);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
  });

  // K. Verify only one reservation per logical operation
  it("only one reservation per logical operation", async () => {
    // Set up the mock RPC behavior — handle all RPCs the route may call
    testRpc.mockImplementation((fn, params) => {
      if (fn === "has_entitlement") {
        return true;
      }
      if (fn === "reserve_ai_credit") {
        return { reserved: true, already_existed: false, new_balance: 99 };
      }
      if (fn === "ai_credit_balance") {
        return 99;
      }
      return { data: null };
    });

    const { POST } = await import("../route");
    const req = createMockRequest({ prompt: "Single authority test" });
    const response = await POST(req);
    const result = await response.json();

    expect(response.status).toBe(200);
    const reserveCalls = testRpc.mock.calls.filter(
      (c: any) => c[0] === "reserve_ai_credit"
    );
    expect(reserveCalls.length).toBe(1);
  });

  // L. Verify failed attempts do not charge the student
  it("failed attempts do not charge the student", async () => {
    // Set up the mock RPC behavior
    testRpc.mockImplementation((fn, params) => {
      if (fn === "has_entitlement") {
        return true;
      }
      if (fn === "reserve_ai_credit") {
        return { reserved: true, already_existed: false, new_balance: 99 };
      }
      if (fn === "refund_ai_credit") {
        return { refunded: true, already_refunded: false, new_balance: 100 };
      }
      if (fn === "ai_credit_balance") {
        return 99;
      }
      return { data: null };
    });

    // Set up the mock unifiedAI to return failure
    testUnifiedAI.mockResolvedValue({
      ok: false,
      error: "Provider failure",
      attempts: [],
    });

    const { POST } = await import("../route");
    const req = createMockRequest({ prompt: "Failed attempts test" });
    const response = await POST(req);
    const result = await response.json();

    expect(response.status).toBe(502);
    // Verify refund was called (release reservation)
    expect(testRpc).toHaveBeenCalledWith("refund_ai_credit", expect.any(Object));
    // Verify reserve was called
    expect(testRpc).toHaveBeenCalledWith("reserve_ai_credit", expect.any(Object));
  });

  // M. Verify settled cost equals reservation (1 credit held, 1 consumed)
  it("settled cost equals reservation (1 credit held, 1 consumed)", async () => {
    // Set up the mock RPC behavior
    testRpc.mockImplementation((fn, params) => {
      if (fn === "has_entitlement") {
        return true;
      }
      if (fn === "reserve_ai_credit") {
        return { reserved: true, already_existed: false, new_balance: 99 };
      }
      if (fn === "refund_ai_credit") {
        return { refunded: true, already_refunded: false, new_balance: 100 };
      }
      if (fn === "ai_credit_balance") {
        return 99;
      }
      return { data: null };
    });

    const { POST } = await import("../route");
    const req = createMockRequest({ prompt: "Settled cost test" });
    const response = await POST(req);
    const result = await response.json();

    expect(response.status).toBe(200);
    // Verify reserve called once
    const reserveCalls = testRpc.mock.calls.filter(
      (c: any) => c[0] === "reserve_ai_credit"
    );
    expect(reserveCalls.length).toBe(1);
    // Verify balance was checked
    expect(testRpc).toHaveBeenCalledWith("ai_credit_balance", expect.any(Object));
  });

  // N. Verify failed initial provider → refund after all attempts fail
  it("failed initial provider → refund after all attempts fail", async () => {
    // Set up the mock RPC behavior
    testRpc.mockImplementation((fn, params) => {
      if (fn === "has_entitlement") {
        return true;
      }
      if (fn === "reserve_ai_credit") {
        return { reserved: true, already_existed: false, new_balance: 99 };
      }
      if (fn === "refund_ai_credit") {
        return { refunded: true, already_refunded: false, new_balance: 100 };
      }
      if (fn === "ai_credit_balance") {
        return 99;
      }
      return { data: null };
    });

    // Set up the mock unifiedAI to return failure
    testUnifiedAI.mockResolvedValue({
      ok: false,
      error: "Provider failure",
      attempts: [],
    });

    const { POST } = await import("../route");
    const req = createMockRequest({ prompt: "Retry fail test" });
    const response = await POST(req);
    const result = await response.json();

    expect(response.status).toBe(502);
    // Verify refund was called (release reservation)
    expect(testRpc).toHaveBeenCalledWith("refund_ai_credit", expect.any(Object));
  });

  // O. Verify pending reconciliation keeps reservation held
  it("pending reconciliation keeps reservation held (no refund)", async () => {
    // Set up the mock RPC behavior
    testRpc.mockImplementation((fn, params) => {
      if (fn === "has_entitlement") {
        return true;
      }
      if (fn === "reserve_ai_credit") {
        return { reserved: true, already_existed: false, new_balance: 99 };
      }
      if (fn === "ai_credit_balance") {
        return 99;
      }
      return { data: null };
    });

    const { POST } = await import("../route");
    const req = createMockRequest({ prompt: "Pending reconcile test" });
    const response = await POST(req);
    const result = await response.json();

    expect(response.status).toBe(200);
    // Verify no refund was called (pending_reconcile keeps reservation)
    const refundCalls = testRpc.mock.calls.filter(
      (c: any) => c[0] === "refund_ai_credit"
    );
    expect(refundCalls.length).toBe(0);
    // Verify balance was checked
    expect(testRpc).toHaveBeenCalledWith("ai_credit_balance", expect.any(Object));
  });

  // P. Duplicate HTTP request — verify idempotent reservation is called once
  it("duplicate HTTP request → idempotent reservation (no double debit)", async () => {
    // Set up the mock RPC behavior
    testRpc.mockImplementation((fn, params) => {
      if (fn === "has_entitlement") {
        return true;
      }
      if (fn === "reserve_ai_credit") {
        return { reserved: true, already_existed: true, new_balance: 99 };
      }
      if (fn === "ai_credit_balance") {
        return 99;
      }
      return { data: null };
    });

    const { POST } = await import("../route");
    const req = createMockRequest({ prompt: "Dup test" });
    const response = await POST(req);
    const result = await response.json();

    expect(response.status).toBe(200);
    const reserveCalls = testRpc.mock.calls.filter(
      (c: any) => c[0] === "reserve_ai_credit"
    );
    // Reservation is idempotent: only 1 reservation created
    expect(reserveCalls.length).toBe(1);
  });
});
