import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  buildCreditStatusPayload,
  checkoutUrlFor,
  computeCreditStatus,
  nextPlanFor,
  normalizeTier,
} from "@/lib/upsell/credit-status";

const requireUserMock = vi.fn();
const supabaseFromMock = vi.fn();
const serviceFromMock = vi.fn();

vi.mock("@/lib/api-guard", () => ({
  requireUser: (...args: unknown[]) => requireUserMock(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({ from: serviceFromMock }),
}));

/** سلسلة استعلام وهمية: كل الميثودات ترجّع نفسها، والنتيجة عبر maybeSingle/await. */
function chain(result: { data: unknown; error?: unknown }, terminators: string[] = ["maybeSingle"]) {
  const builder: Record<string, unknown> = {};
  const methods = ["select", "eq", "or", "order", "limit", "in", "gt", "lte", "range"];
  for (const method of methods) builder[method] = () => builder;
  for (const terminator of terminators) {
    builder[terminator] = async () => ({ data: result.data, error: result.error ?? null });
  }
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: result.data, error: result.error ?? null }).then(resolve);
  return builder;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("computeCreditStatus", () => {
  it("exhausted عند صفر أو سالب", () => {
    expect(computeCreditStatus({ creditsRemaining: 0, creditsMonthly: 500 }).status).toBe("exhausted");
    expect(computeCreditStatus({ creditsRemaining: -10, creditsMonthly: 500 }).status).toBe("exhausted");
  });

  it("critical عند 10% أو أقل", () => {
    const result = computeCreditStatus({ creditsRemaining: 5, creditsMonthly: 50 });
    expect(result.status).toBe("critical");
    expect(result.credits_percent).toBe(10);
  });

  it("low بين 11% و20%", () => {
    const result = computeCreditStatus({ creditsRemaining: 20, creditsMonthly: 100 });
    expect(result.status).toBe("low");
    expect(result.credits_percent).toBe(20);
  });

  it("ok فوق 20%", () => {
    expect(computeCreditStatus({ creditsRemaining: 300, creditsMonthly: 500 }).status).toBe("ok");
  });

  it("لا يطلق إنذارًا كاذبًا عندما الحد الشهري صفر", () => {
    expect(computeCreditStatus({ creditsRemaining: 10, creditsMonthly: 0 }).status).toBe("ok");
  });

  it("يقيّد النسبة بين 0 و100", () => {
    expect(computeCreditStatus({ creditsRemaining: 900, creditsMonthly: 500 }).credits_percent).toBe(100);
  });
});

describe("nextPlanFor / normalizeTier / checkoutUrlFor", () => {
  it("free → pro", () => {
    expect(nextPlanFor("free")).toBe("pro");
    expect(nextPlanFor("")).toBe("pro");
    expect(nextPlanFor(null)).toBe("pro");
  });

  it("premium (ميراث) → pro", () => {
    expect(nextPlanFor("premium")).toBe("pro");
  });

  it("pro → ultra", () => {
    expect(nextPlanFor("pro")).toBe("ultra");
  });

  it("ultra → لا ترقية", () => {
    expect(nextPlanFor("ultra")).toBeNull();
    expect(checkoutUrlFor(null)).toBeNull();
  });

  it("يطبّع premium إلى pro وباقي القيم إلى free", () => {
    expect(normalizeTier("premium")).toBe("pro");
    expect(normalizeTier("ULTRA")).toBe("ultra");
    expect(normalizeTier("weird")).toBe("free");
    expect(normalizeTier(undefined)).toBe("free");
  });

  it("يبني روابط الدفع", () => {
    expect(checkoutUrlFor("pro")).toBe("/checkout/pro");
    expect(checkoutUrlFor("ultra")).toBe("/checkout/ultra");
  });
});

describe("buildCreditStatusPayload", () => {
  it("يبني الاستجابة الكاملة", () => {
    const payload = buildCreditStatusPayload({
      tier: "pro",
      creditsRemaining: 25,
      creditsMonthly: 500,
    });
    expect(payload).toEqual({
      tier: "pro",
      credits_remaining: 25,
      credits_monthly: 500,
      credits_percent: 5,
      status: "critical",
      next_plan: "ultra",
      checkout_url: "/checkout/ultra",
    });
  });

  it("ultra → checkout_url = null", () => {
    const payload = buildCreditStatusPayload({
      tier: "ultra",
      creditsRemaining: 900,
      creditsMonthly: 2000,
    });
    expect(payload.next_plan).toBeNull();
    expect(payload.checkout_url).toBeNull();
    expect(payload.status).toBe("ok");
  });
});

describe("GET /api/me/credit-status", () => {
  beforeEach(() => {
    supabaseFromMock.mockImplementation((table: string) => {
      if (table === "entitlements") return chain({ data: { value: "pro" } });
      if (table === "ai_credit_ledger") return chain({ data: [{ delta: 30 }, { delta: -5 }] }, []);
      return chain({ data: null });
    });
    serviceFromMock.mockImplementation(() => chain({ data: { credits_monthly: 500 } }));
  });

  it("يعيد 401 لغير المسجل", async () => {
    requireUserMock.mockResolvedValue({ user: null, supabase: { from: supabaseFromMock }, response: null });
    const { GET } = await import("@/app/api/me/credit-status/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("يعيد الحالة محسوبة للمستخدم المسجّل", async () => {
    requireUserMock.mockResolvedValue({
      user: { id: "u1", email: "u@example.com" },
      supabase: { from: supabaseFromMock },
      response: null,
    });

    const { GET } = await import("@/app/api/me/credit-status/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tier).toBe("pro");
    expect(body.credits_remaining).toBe(25);
    expect(body.credits_monthly).toBe(500);
    expect(body.status).toBe("critical");
    expect(body.checkout_url).toBe("/checkout/ultra");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("لا يكسر الطلب عند فشل قراءة الرصيد (يعاملها صفرًا)", async () => {
    requireUserMock.mockResolvedValue({
      user: { id: "u1" },
      supabase: {
        from: (table: string) => {
          if (table === "entitlements") return chain({ data: { value: "free" } });
          return chain({ data: null, error: { message: "boom" } }, []);
        },
      },
      response: null,
    });

    const { GET } = await import("@/app/api/me/credit-status/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.credits_remaining).toBe(0);
    expect(body.status).toBe("exhausted");
  });
});
