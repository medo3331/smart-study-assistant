import { describe, expect, it } from "vitest";

import {
  buildCreditsSummary,
  dayKeyUtc,
  kindLabel,
  monthStartUtc,
  reasonLabel,
  toNumber,
  usageBucket,
  type LedgerRow,
} from "../credits-summary";

const NOW = "2026-06-15T12:00:00.000Z";
const MONTH_START = "2026-06-01T00:00:00.000Z";

function row(
  delta: number,
  reason: string,
  at: string,
  metadata: Record<string, unknown> | null = null,
  refId: string | null = null
): LedgerRow {
  return { delta, reason, ref_id: refId, metadata, created_at: at };
}

describe("helpers", () => {
  it("toNumber handles string/null/NaN", () => {
    expect(toNumber("5")).toBe(5);
    expect(toNumber(null)).toBe(0);
    expect(toNumber("abc")).toBe(0);
  });

  it("monthStartUtc returns UTC month start", () => {
    expect(monthStartUtc(new Date(NOW)).toISOString()).toBe(MONTH_START);
  });

  it("dayKeyUtc formats ISO date", () => {
    expect(dayKeyUtc("2026-06-03T23:59:59Z")).toBe("2026-06-03");
    expect(dayKeyUtc("not-a-date")).toBe("");
  });

  it("labels", () => {
    expect(reasonLabel("ai_reserve")).toBe("استخدام الذكاء الاصطناعي");
    expect(reasonLabel("unknown_reason")).toBe("unknown_reason");
    expect(kindLabel("vision")).toBe("صور وملفات");
    expect(kindLabel("custom_agent")).toBe("custom_agent");
  });

  it("usageBucket prefers kind, then agent, then reason label", () => {
    expect(usageBucket(row(-2, "ai_reserve", NOW, { kind: "vision" }))).toBe("صور وملفات");
    expect(usageBucket(row(-2, "ai_reserve", NOW, { agent: "exam_agent" }))).toBe("exam_agent");
    expect(usageBucket(row(-2, "ai_reserve", NOW, null))).toBe("استخدام الذكاء الاصطناعي");
  });
});

describe("buildCreditsSummary", () => {
  it("computes balance from full ledger", () => {
    const summary = buildCreditsSummary({
      ledger: [
        row(100, "grant", "2026-05-01T00:00:00Z"),
        row(-4, "ai_reserve", "2026-06-02T10:00:00Z"),
        row(+2, "ai_refund", "2026-06-03T10:00:00Z"),
        row(-10, "ai_reserve", "2026-06-05T10:00:00Z"),
      ],
      entitlement: null,
      plan: null,
      now: NOW,
    });
    expect(summary.balance).toBe(88);
  });

  it("counts only this month usage and grants", () => {
    const summary = buildCreditsSummary({
      ledger: [
        row(-5, "ai_reserve", "2026-05-31T23:59:59Z"),
        row(-4, "ai_reserve", "2026-06-02T10:00:00Z"),
        row(+50, "grant", "2026-06-03T10:00:00Z"),
        row(-1, "ai_reserve", "2026-07-01T00:00:00Z"),
      ],
      entitlement: null,
      plan: null,
      now: NOW,
    });
    expect(summary.month.used).toBe(4);
    expect(summary.month.granted).toBe(50);
  });

  it("groups month usage by kind/agent and per day", () => {
    const summary = buildCreditsSummary({
      ledger: [
        row(-3, "ai_reserve", "2026-06-02T10:00:00Z", { kind: "vision" }),
        row(-2, "ai_reserve", "2026-06-02T11:00:00Z", { agent: "exam_agent" }),
        row(-1, "ai_reserve", "2026-06-02T12:00:00Z"),
        row(-2, "ai_reserve", "2026-06-03T12:00:00Z", { kind: "vision" }),
      ],
      entitlement: null,
      plan: null,
      now: NOW,
    });
    const kinds = Object.fromEntries(summary.month.byKind.map((k) => [k.label, k.used]));
    expect(kinds["صور وملفات"]).toBe(5);
    expect(kinds["exam_agent"]).toBe(2);
    expect(kinds["استخدام الذكاء الاصطناعي"]).toBe(1);

    const day2 = summary.month.daily.find((d) => d.date === "2026-06-02");
    const day3 = summary.month.daily.find((d) => d.date === "2026-06-03");
    expect(day2?.used).toBe(6);
    expect(day3?.used).toBe(2);
    expect(summary.month.daily).toHaveLength(15); // 1..15 يونيو
  });

  it("subscription expiry: days remaining and expired state", () => {
    const summary = buildCreditsSummary({
      ledger: [],
      entitlement: { value: "pro", expires_at: "2026-06-20T00:00:00Z" },
      plan: { plan_key: "pro", display_name_ar: "احترافي", credits_monthly: 100 },
      now: NOW,
    });
    expect(summary.subscription.daysRemaining).toBe(5);
    expect(summary.subscription.expired).toBe(false);
    expect(summary.subscription.planName).toBe("احترافي");
    expect(summary.subscription.usedPercent).toBe(0);
  });

  it("expired entitlement and usedPercent capping", () => {
    const summary = buildCreditsSummary({
      ledger: [row(-120, "ai_reserve", "2026-06-02T10:00:00Z", { kind: "text" })],
      entitlement: { value: "pro", expires_at: "2026-06-10T00:00:00Z" },
      plan: { plan_key: "pro", credits_monthly: 100 },
      now: NOW,
    });
    expect(summary.subscription.expired).toBe(true);
    expect(summary.subscription.daysRemaining).toBe(0);
    expect(summary.subscription.usedPercent).toBe(100);
  });

  it("free tier without entitlement and empty ledger", () => {
    const summary = buildCreditsSummary({ ledger: [], entitlement: null, plan: null, now: NOW });
    expect(summary.balance).toBe(0);
    expect(summary.subscription.tier).toBe("free");
    expect(summary.subscription.expiresAt).toBeNull();
    expect(summary.month.used).toBe(0);
    expect(summary.recent).toHaveLength(0);
  });

  it("recent is sorted newest first with labels", () => {
    const summary = buildCreditsSummary({
      ledger: [
        row(-1, "ai_reserve", "2026-06-01T10:00:00Z", { kind: "text" }, "ref-1"),
        row(+1, "ai_refund", "2026-06-02T10:00:00Z", null, "ref-1"),
        row(-2, "ai_reserve", "2026-06-03T10:00:00Z", { kind: "vision" }, "ref-2"),
      ],
      entitlement: null,
      plan: null,
      now: NOW,
    });
    expect(summary.recent[0].refId).toBe("ref-2");
    expect(summary.recent[0].delta).toBe(-2);
    expect(summary.recent[1].delta).toBe(1);
    expect(summary.recent[2].label).toBe("محادثة ونصوص");
  });
});
