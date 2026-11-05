import { describe, it, expect } from "vitest";

import {
  DEFAULT_EXPIRY_DAYS,
  MAX_EXPIRY_DAYS,
  MAX_MANUAL_GRANT,
  MIN_EXPIRY_DAYS,
  expiryFromDays,
  grantStatus,
  isExpiringSoon,
  isUuid,
  validateManualGrant,
} from "@/lib/credits/grants";

const NOW = new Date("2026-11-05T12:00:00.000Z");
const inDays = (days: number) =>
  new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

const VALID_USER = "3cdaf73b-d4ff-45d3-8087-b5ff04df5b46";

describe("grantStatus", () => {
  it("نشطة عندما يوجد رصيد ولم تنتهِ", () => {
    expect(grantStatus({ remaining: 10, expires_at: inDays(5) }, NOW)).toBe("active");
  });

  it("منتهية عندما مرّ تاريخ الانتهاء حتى لو بقي رصيد", () => {
    expect(grantStatus({ remaining: 10, expires_at: inDays(-1) }, NOW)).toBe("expired");
  });

  it("مستنفدة عندما يكون المتبقي صفرًا ولم تنتهِ", () => {
    expect(grantStatus({ remaining: 0, expires_at: inDays(5) }, NOW)).toBe("exhausted");
  });

  it("الانتهاء يسبق الاستنفاد في التصنيف", () => {
    expect(grantStatus({ remaining: 0, expires_at: inDays(-1) }, NOW)).toBe("expired");
  });

  it("يتعامل مع تاريخ غير صالح أو null بلا انفجار", () => {
    expect(grantStatus({ remaining: 5, expires_at: null }, NOW)).toBe("active");
    expect(grantStatus({ remaining: null, expires_at: inDays(1) }, NOW)).toBe("exhausted");
  });
});

describe("isExpiringSoon", () => {
  it("صحيح داخل 7 أيام", () => {
    expect(isExpiringSoon({ remaining: 5, expires_at: inDays(3) }, 7, NOW)).toBe(true);
    expect(isExpiringSoon({ remaining: 5, expires_at: inDays(7) }, 7, NOW)).toBe(true);
  });

  it("خاطئ خارج النافذة", () => {
    expect(isExpiringSoon({ remaining: 5, expires_at: inDays(8) }, 7, NOW)).toBe(false);
  });

  it("خاطئ للمنتهية والمستنفدة", () => {
    expect(isExpiringSoon({ remaining: 5, expires_at: inDays(-1) }, 7, NOW)).toBe(false);
    expect(isExpiringSoon({ remaining: 0, expires_at: inDays(2) }, 7, NOW)).toBe(false);
  });
});

describe("isUuid", () => {
  it("يقبل UUID صحيحًا", () => {
    expect(isUuid(VALID_USER)).toBe(true);
    expect(isUuid(`  ${VALID_USER.toUpperCase()}  `)).toBe(true);
  });

  it("يرفض غير UUID", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("user@example.com")).toBe(false);
    expect(isUuid("3cdaf73b-d4ff-45d3-8087")).toBe(false);
  });
});

describe("validateManualGrant", () => {
  const base = {
    userId: VALID_USER,
    amount: 100,
    source: "manual",
    expiresInDays: DEFAULT_EXPIRY_DAYS,
    notes: "",
  };

  it("يقبل مدخلات صحيحة", () => {
    const result = validateManualGrant(base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.amount).toBe(100);
      expect(result.value.source).toBe("manual");
      expect(result.value.notes).toBeNull();
    }
  });

  it("يرفض user_id غير صالح", () => {
    const result = validateManualGrant({ ...base, userId: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("user_id"))).toBe(true);
  });

  it("يرفض المبالغ غير الصالحة", () => {
    for (const amount of [0, -5, 1.5, MAX_MANUAL_GRANT + 1, Number.NaN]) {
      expect(validateManualGrant({ ...base, amount }).ok).toBe(false);
    }
  });

  it("يقبل الحد الأقصى بالضبط", () => {
    expect(validateManualGrant({ ...base, amount: MAX_MANUAL_GRANT }).ok).toBe(true);
  });

  it("يرفض المصادر غير المسموحة", () => {
    expect(validateManualGrant({ ...base, source: "monthly" }).ok).toBe(false);
    expect(validateManualGrant({ ...base, source: "refund" }).ok).toBe(false);
    expect(validateManualGrant({ ...base, source: "" }).ok).toBe(false);
  });

  it("يرفض مدة انتهاء خارج النطاق", () => {
    expect(validateManualGrant({ ...base, expiresInDays: 0 }).ok).toBe(false);
    expect(validateManualGrant({ ...base, expiresInDays: MAX_EXPIRY_DAYS + 1 }).ok).toBe(false);
    expect(validateManualGrant({ ...base, expiresInDays: 30.5 }).ok).toBe(false);
    expect(validateManualGrant({ ...base, expiresInDays: MIN_EXPIRY_DAYS }).ok).toBe(true);
  });

  it("يرفض ملاحظات أطول من 500 حرف", () => {
    expect(validateManualGrant({ ...base, notes: "س".repeat(501) }).ok).toBe(false);
  });

  it("يجمع كل الأخطاء معًا", () => {
    const result = validateManualGrant({
      userId: "bad",
      amount: 0,
      source: "nope",
      expiresInDays: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});

describe("expiryFromDays", () => {
  it("يضيف الأيام إلى الآن", () => {
    expect(expiryFromDays(30, NOW)).toBe(inDays(30));
  });

  it("لا ينزل تحت الحد الأدنى", () => {
    expect(expiryFromDays(0, NOW)).toBe(inDays(MIN_EXPIRY_DAYS));
    expect(expiryFromDays(-5, NOW)).toBe(inDays(MIN_EXPIRY_DAYS));
  });
});
