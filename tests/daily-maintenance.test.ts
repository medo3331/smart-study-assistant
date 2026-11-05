import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

import {
  isAuthorizedCronRequest,
  isMonthlyGraceWindow,
  nextPageRange,
} from "@/lib/cron/daily-maintenance";

const rpcMock = vi.fn();
const rangeMock = vi.fn();
const insertMock = vi.fn();
const orderMock = vi.fn(() => ({ range: rangeMock }));
const selectMock = vi.fn(() => ({ order: orderMock }));
const fromMock = vi.fn((table: string) =>
  table === "profiles" ? { select: selectMock } : { insert: insertMock }
);

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({ rpc: rpcMock, from: fromMock }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  rpcMock.mockImplementation(async (name: string) =>
    name === "expire_old_grants"
      ? { data: [{ expired_count: 2 }], error: null }
      : { data: [{ granted: true }], error: null }
  );
  rangeMock.mockResolvedValue({ data: [{ id: "u1" }, { id: "u2" }], error: null });
  insertMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.CRON_SECRET;
});

describe("isAuthorizedCronRequest", () => {
  it("يرفض عندما لا يكون السر مضبوطًا (fail-closed)", () => {
    expect(isAuthorizedCronRequest("Bearer anything", undefined)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer x", "   ")).toBe(false);
  });

  it("يرفض الترويسة الغائبة", () => {
    expect(isAuthorizedCronRequest(null, "s")).toBe(false);
    expect(isAuthorizedCronRequest("", "s")).toBe(false);
  });

  it("يقبل Bearer الصحيح", () => {
    expect(isAuthorizedCronRequest("Bearer test-secret", "test-secret")).toBe(true);
    expect(isAuthorizedCronRequest("  Bearer test-secret  ", "test-secret")).toBe(true);
  });

  it("يرفض سرًا مختلفًا أو بادئة خاطئة", () => {
    expect(isAuthorizedCronRequest("Bearer wrong", "test-secret")).toBe(false);
    expect(isAuthorizedCronRequest("test-secret", "test-secret")).toBe(false);
    expect(isAuthorizedCronRequest("Basic test-secret", "test-secret")).toBe(false);
  });

  it("لا يرمي عند اختلاف الطول", () => {
    expect(() => isAuthorizedCronRequest("Bearer s", "much-longer-secret")).not.toThrow();
    expect(isAuthorizedCronRequest("Bearer s", "much-longer-secret")).toBe(false);
  });
});

describe("isMonthlyGraceWindow", () => {
  it("يقبل الأيام 1 و3", () => {
    expect(isMonthlyGraceWindow(new Date(2026, 10, 1))).toBe(true);
    expect(isMonthlyGraceWindow(new Date(2026, 10, 3))).toBe(true);
  });

  it("يرفض اليوم 4 وما بعده", () => {
    expect(isMonthlyGraceWindow(new Date(2026, 10, 4))).toBe(false);
    expect(isMonthlyGraceWindow(new Date(2026, 10, 28))).toBe(false);
  });

  it("يرفض تاريخًا غير صالح", () => {
    expect(isMonthlyGraceWindow(new Date("nope"))).toBe(false);
  });
});

describe("nextPageRange", () => {
  it("يحسب النطاقات", () => {
    expect(nextPageRange(0, 500)).toEqual([0, 499]);
    expect(nextPageRange(1, 500)).toEqual([500, 999]);
  });

  it("يحمي من المدخلات السالبة", () => {
    expect(nextPageRange(-3, 500)).toEqual([0, 499]);
    expect(nextPageRange(0, 0)).toEqual([0, 0]);
  });
});

describe("GET /api/cron/daily-maintenance", () => {
  it("يرفض الطلب بلا ترويسة صحيحة (401) دون أي نداء قاعدة", async () => {
    const { GET } = await import("@/app/api/cron/daily-maintenance/route");
    const res = await GET(
      new Request("http://localhost/api/cron/daily-maintenance") as never
    );
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("يعمل في نافذة المنح: ينتهي القديم ثم يمنح الشهري ويسجّل التشغيل", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 2, 3, 0, 0)); // 2 نوفمبر

    const { GET } = await import("@/app/api/cron/daily-maintenance/route");
    const res = await GET(
      new Request("http://localhost/api/cron/daily-maintenance", {
        headers: { authorization: "Bearer test-secret" },
      }) as never
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("success");
    expect(body.expired).toEqual([{ expired_count: 2 }]);
    expect(body.monthly_grants.granted_count).toBe(2);
    expect(body.monthly_grants.scanned).toBe(2);
    expect(rpcMock).toHaveBeenCalledWith("expire_old_grants");
    expect(rpcMock).toHaveBeenCalledWith("grant_monthly_credits", { p_user_id: "u1" });
    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0][0];
    expect(payload.job_name).toBe("daily-maintenance");
    expect(payload.status).toBe("success");
    expect(typeof payload.duration_ms).toBe("number");
  });

  it("يتخطى المنح الشهري خارج النافذة", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 15, 3, 0, 0)); // 15 نوفمبر

    const { GET } = await import("@/app/api/cron/daily-maintenance/route");
    const res = await GET(
      new Request("http://localhost/api/cron/daily-maintenance", {
        headers: { authorization: "Bearer test-secret" },
      }) as never
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.monthly_grants.skipped).toContain("outside grace window");
    expect(rpcMock).not.toHaveBeenCalledWith("grant_monthly_credits", expect.anything());
  });

  it("يعيد partial عند فشل expire مع نجاح باقي الخطوات", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 15, 3, 0, 0));
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    const { GET } = await import("@/app/api/cron/daily-maintenance/route");
    const res = await GET(
      new Request("http://localhost/api/cron/daily-maintenance", {
        headers: { authorization: "Bearer test-secret" },
      }) as never
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("partial");
    expect(body.errors[0]).toContain("expire_old_grants");
  });

  it("يعيد 500 عند انفجار غير متوقع", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 15, 3, 0, 0));
    rpcMock.mockRejectedValueOnce(new Error("network down"));

    const { GET } = await import("@/app/api/cron/daily-maintenance/route");
    const res = await GET(
      new Request("http://localhost/api/cron/daily-maintenance", {
        headers: { authorization: "Bearer test-secret" },
      }) as never
    );

    expect(res.status).toBe(500);
  });
});
