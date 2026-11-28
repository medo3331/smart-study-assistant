/**
 * اختبارات التحديث الحيّ لمواقيت الصلاة.
 *
 * تغطي:
 *  - مفتاح الكاش بيبني من الإحداثيات مقربة لـ 0.01° — تغيير صغير بنفس
 *    الـ bucket بيحافظ على المفتاح، وتغيير بعده بيبني مفتاح جديد.
 *  - عتبة تغيّر الموقع (hasLocationChangedSignificantly).
 *  - تعويض drift في العدّاد (computeRemainingMs + formatTimeRemaining
 *    مع ساعة وهمية) — الحساب من Date.now() الحالي مش زيادة/نقصان تراكمي.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  COORDINATE_QUANTUM,
  LOCATION_CHANGE_THRESHOLD_DEGREES,
  roundCoordinate,
  hasLocationChangedSignificantly,
  computeRemainingMs,
  isCountdownExpired,
} from "../prayer-times/live";
import { generateCacheKey } from "../prayer-times/service";
import { formatTimeRemaining } from "../prayer-times";
import type { PrayerTimesRequestParams } from "../prayer-times/service";

const BASE_PARAMS: PrayerTimesRequestParams = {
  date: new Date("2026-01-15T12:00:00Z"),
  localDate: "2026-01-15",
  latitude: 30.0444,
  longitude: 31.2357,
  timezone: "Africa/Cairo",
  calculationMethod: "egyptian",
  madhab: "shafi",
};

describe("تقريب الإحداثيات ومفتاح الكاش", () => {
  it("roundCoordinate يقرّب لخطوة 0.01° كعدد صحيح بدون artifacts عشرية", () => {
    expect(COORDINATE_QUANTUM).toBe(0.01);
    expect(roundCoordinate(30.0444)).toBe(3004);
    expect(roundCoordinate(30.0499)).toBe(3005);
    expect(roundCoordinate(-31.2357)).toBe(-3124);
  });

  it("نفس الإحداثيات دايماً بتبني نفس المفتاح", () => {
    const key1 = generateCacheKey(BASE_PARAMS);
    const key2 = generateCacheKey({ ...BASE_PARAMS });
    expect(key1).toBe(key2);
    // المفتاح فيه القيمة المقرّبة (3004) مش القيمة الخام
    expect(key1).toContain("3004");
    expect(key1).toContain("3124");
  });

  it("إحداثيات داخل نفس bucket الـ 0.01° بتحافظ على نفس مفتاح الكاش", () => {
    // 30.0441 و 30.0449 الاتنين في bucket 3004 — التحديث الدوري بنفس المكان مش بيكسر الكاش
    const keyA = generateCacheKey({ ...BASE_PARAMS, latitude: 30.0441 });
    const keyB = generateCacheKey({ ...BASE_PARAMS, latitude: 30.0449 });
    expect(keyA).toBe(keyB);
  });

  it("تغيير الإحداثيات بعد العتبة (~0.01°) بيبني مفتاح كاش جديد — مواقيت الموقع الجديد متتجابش من كاش الموقع القديم", () => {
    const cairo = generateCacheKey(BASE_PARAMS);
    // خط عرض مختلف بشكل ملموس (Giza ~30.01)
    const giza = generateCacheKey({ ...BASE_PARAMS, latitude: 30.0131, longitude: 31.2083 });
    const alexandria = generateCacheKey({ ...BASE_PARAMS, latitude: 31.2001, longitude: 29.9187 });
    expect(giza).not.toBe(cairo);
    expect(alexandria).not.toBe(cairo);
    expect(alexandria).not.toBe(giza);
  });

  it("المفتاح بيميّز كذلك بين التاريخ والمنطقة الزمنية وطريقة الحساب", () => {
    const base = generateCacheKey(BASE_PARAMS);
    expect(generateCacheKey({ ...BASE_PARAMS, localDate: "2026-01-16" })).not.toBe(base);
    expect(generateCacheKey({ ...BASE_PARAMS, timezone: "Asia/Riyadh" })).not.toBe(base);
    expect(generateCacheKey({ ...BASE_PARAMS, madhab: "hanafi" })).not.toBe(base);
  });
});

describe("عتبة تغيّر الموقع", () => {
  it("حركة أصغر من العتبة مش بتعتبر تغيّر موقع", () => {
    expect(
      hasLocationChangedSignificantly(
        { latitude: 30.0444, longitude: 31.2357 },
        { latitude: 30.0499, longitude: 31.2357 },
      ),
    ).toBe(false);
  });

  it("حركة تعدّي العتبة بتعتبر تغيّر موقع — لازم تحديث فوري للمواقيت", () => {
    // ~0.03° ≈ 3.3 كم شمالاً
    expect(
      hasLocationChangedSignificantly(
        { latitude: 30.0444, longitude: 31.2357 },
        { latitude: 30.0744, longitude: 31.2357 },
      ),
    ).toBe(true);
    // مسافة مركّبة صغيرة في الاتجاهين تعدّي العتبة (hypot(0.009, 0.009) ≈ 0.0127)
    expect(
      hasLocationChangedSignificantly(
        { latitude: 30.0444, longitude: 31.2357 },
        { latitude: 30.0534, longitude: 31.2447 },
      ),
    ).toBe(true);
    // ومركّبة تحت العتبة مش بتعتبر تغيّر (hypot(0.006, 0.006) ≈ 0.0085)
    expect(
      hasLocationChangedSignificantly(
        { latitude: 30.0444, longitude: 31.2357 },
        { latitude: 30.0504, longitude: 31.2417 },
      ),
    ).toBe(false);
  });

  it("العتبة القياسية 0.01° والعتبة المخصّصة بتشتغل", () => {
    expect(LOCATION_CHANGE_THRESHOLD_DEGREES).toBe(0.01);
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 0.02, longitude: 0 };
    expect(hasLocationChangedSignificantly(a, b)).toBe(true);
    expect(hasLocationChangedSignificantly(a, b, 0.5)).toBe(false);
  });
});

describe("تعويض drift في العدّاد", () => {
  it("computeRemainingMs بيحسب الفرق من اللحظة الحالية مش تراكمي", () => {
    const now = 1_000_000;
    const target = now + 5 * 60_000; // 5 دقايق
    expect(computeRemainingMs(target, now)).toBe(5 * 60_000);
    // بعد دقيقة حقيقية (لو التبويب مخفي والمؤقت اتأخر) — الفرق بيتراجع صح
    expect(computeRemainingMs(target, now + 60_000)).toBe(4 * 60_000);
    // بعد تجاوز الهدف — صفر، مش سالب
    expect(computeRemainingMs(target, now + 10 * 60_000)).toBe(0);
  });

  it("isCountdownExpired بيحدد لحظة تجاوز الهدف", () => {
    const now = 2_000_000;
    const target = now + 1;
    expect(isCountdownExpired(target, now)).toBe(false);
    expect(isCountdownExpired(target, now + 1)).toBe(true);
    expect(isCountdownExpired(target, now + 500)).toBe(true);
  });

  it("formatTimeRemaining بيتعوّض عن drift الساعة بعد إيقاف واستئناف الوقت الوهمي", () => {
    vi.useFakeTimers();
    try {
      const target = Date.now() + 2 * 60 * 60 * 1000; // ساعتين
      const before = formatTimeRemaining(target);
      expect(before).toBe("02:00:00");

      // نحرك الوقت دقيقة كاملة للأمام (كأن التبويب كان مخفي والمؤقت اتحرّك مرة واحدة)
      vi.setSystemTime(Date.now() + 60_000);
      const after = formatTimeRemaining(target);
      expect(after).toBe("01:59:00");

      // الرجوع للتبويب بعد ساعة كاملة — الحساب من Date.now() الجديد
      // (أقل من ساعة متبقية → صيغة "دقائق:ثواني")
      vi.setSystemTime(Date.now() + 60 * 60_000);
      expect(formatTimeRemaining(target)).toBe("59:00");

      // بعد تجاوز الصلاة
      vi.setSystemTime(target + 1000);
      expect(formatTimeRemaining(target)).toBe("حان الوقت");
    } finally {
      vi.useRealTimers();
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.useRealTimers();
});
