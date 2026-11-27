/**
 * اختبارات خدمة مواقيت الصلاة (AlAdhan-backed).
 *
 * تغطي إصلاحات post-mortem لمركز العبادات:
 *  - لاحقة المنطقة الزمنية "(EET)" اللي بيرجعها AlAdhan متبوظش الثواني
 *  - الـ timestamps بتتحسب بتوقيت **الموقع المطلوب** مش توقيت السيرفر (DST-aware)
 *  - تحديد الصلاة القادمة
 *  - تمرير التاريخ المطلوب فعليًا للـ API + الكاش
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrayerTimes, getTodayPrayerTimes, clearExpiredCache } from "../service";

const CAIRO = {
  latitude: 30.0444,
  longitude: 31.2357,
  timezone: "Africa/Cairo",
  calculationMethod: "egyptian" as const,
  madhab: "shafi" as const,
};

/** ردّ AlAdhan وهمي بنفس الشكل الحقيقي — timings باللاحقة زي ما السيرفر بيرجعها. */
function aladhanPayload(timings: Record<string, string>, timezone: string) {
  return {
    code: 200,
    status: "OK",
    data: {
      timings,
      date: {
        readable: "28 Nov 2026",
        timestamp: "1764326400",
        hijri: {
          date: "09-06-1448",
          format: "DD-MM-YYYY",
          day: "09",
          weekday: { en: "Saturday", ar: "السبت" },
          month: { en: "Jumada al-akhirah", ar: "جُمادى الآخرة", number: 6 },
          year: "1448",
        },
      },
      meta: {
        latitude: CAIRO.latitude,
        longitude: CAIRO.longitude,
        timezone,
        method: {
          id: 5,
          name: "Egyptian General Authority of Survey",
          params: { Fajr: 19.5, Isha: 17.5, IshaInterval: null },
        },
      },
    },
  };
}

function mockFetch(payload: unknown) {
  return vi.fn(async (_url: string) => ({
    ok: true,
    status: 200,
    json: async () => payload,
  }));
}

const CAIRO_NOV_TIMINGS = {
  Fajr: "05:12 (EET)",
  Sunrise: "06:31 (EET)",
  Dhuhr: "11:53 (EET)",
  Asr: "14:42 (EET)",
  Maghrib: "16:57 (EET)",
  Isha: "18:12 (EET)",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-28T10:00:00Z"));
});

afterEach(() => {
  // نحرّك الساعة بعد انتهاء صلاحية أي كاش قبل التفريغ — clearExpiredCache بيمسح المنتهي فقط
  vi.setSystemTime(new Date("2026-12-30T00:00:00Z"));
  clearExpiredCache();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("خدمة مواقيت الصلاة", () => {
  it("بينظّف لاحقة المنطقة الزمنية من أوقات العرض", async () => {
    vi.stubGlobal("fetch", mockFetch(aladhanPayload(CAIRO_NOV_TIMINGS, CAIRO.timezone)));

    const data = await getPrayerTimes({ ...CAIRO, date: new Date("2026-11-28") });

    expect(data.prayers.fajr).toBe("05:12");
    expect(data.prayers.dhuhr).toBe("11:53");
    expect(data.prayers.isha).toBe("18:12");
  });

  it("بيحسب الـ timestamps بتوقيت الموقع المطلوب مش توقيت السيرفر", async () => {
    vi.stubGlobal("fetch", mockFetch(aladhanPayload(CAIRO_NOV_TIMINGS, CAIRO.timezone)));

    const data = await getPrayerTimes({ ...CAIRO, date: new Date("2026-11-28") });

    // القاهرة شتاءً UTC+2: الفجر 05:12 محليًا = 03:12 UTC
    expect(data.timestamps.fajr).toBe(Date.UTC(2026, 10, 28, 3, 12, 0));
    expect(data.timestamps.isha).toBe(Date.UTC(2026, 10, 28, 16, 12, 0));
    // وليس 05:12 UTC زي ما كان الكود القديم بيطلع بتوقيت السيرفر
    expect(data.timestamps.fajr).not.toBe(Date.UTC(2026, 10, 28, 5, 12, 0));
  });

  it("بيحترم الـ DST في المناطق اللي بتغيّر توقيتها", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        aladhanPayload(
          { Fajr: "05:20 (EDT)", Sunrise: "06:40 (EDT)", Dhuhr: "12:30 (EDT)", Asr: "15:45 (EDT)", Maghrib: "18:15 (EDT)", Isha: "19:40 (EDT)" },
          "America/New_York",
        ),
      ),
    );

    const data = await getPrayerTimes({
      latitude: 40.7128,
      longitude: -74.006,
      timezone: "America/New_York",
      calculationMethod: "north_america",
      madhab: "shafi",
      date: new Date("2026-07-15"),
    });

    // نيويورك صيفًا UTC-4: الظهر 12:30 محليًا = 16:30 UTC
    expect(data.timestamps.dhuhr).toBe(Date.UTC(2026, 6, 15, 16, 30, 0));
  });

  it("بيحدد الصلاة القادمة صح من الـ timestamps", async () => {
    vi.stubGlobal("fetch", mockFetch(aladhanPayload(CAIRO_NOV_TIMINGS, CAIRO.timezone)));

    // «الآن» 10:00 UTC = 12:00 بالقاهرة → الظهر عدّى (09:53Z) والعصر لسه (12:42Z)
    const data = await getPrayerTimes({ ...CAIRO, date: new Date("2026-11-28") });

    expect(data.nextPrayer?.name).toBe("Asr");
    expect(data.nextPrayer?.arabicName).toBe("العصر");
  });

  it("بعد العشاء الصلاة القادمة هي الفجر بكرة", async () => {
    vi.stubGlobal("fetch", mockFetch(aladhanPayload(CAIRO_NOV_TIMINGS, CAIRO.timezone)));

    vi.setSystemTime(new Date("2026-11-28T20:00:00Z")); // 22:00 بالقاهرة — بعد العشاء

    const data = await getPrayerTimes({ ...CAIRO, date: new Date("2026-11-28") });

    expect(data.nextPrayer?.name).toBe("Fajr");
    // فجر بكرة = فجر النهارده + 24 ساعة
    expect(data.nextPrayer?.timestamp).toBe(data.timestamps.fajr + 24 * 60 * 60 * 1000);
  });

  it("بممرّر التاريخ المطلوب للـ API فعليًا", async () => {
    const fetchMock = mockFetch(aladhanPayload(CAIRO_NOV_TIMINGS, CAIRO.timezone));
    vi.stubGlobal("fetch", fetchMock);

    await getPrayerTimes({ ...CAIRO, date: new Date("2026-01-15") });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain("/timings/15-01-2026");
  });

  it("getTodayPrayerTimes بيحترم الباراميتر date الاختياري", async () => {
    const fetchMock = mockFetch(aladhanPayload(CAIRO_NOV_TIMINGS, CAIRO.timezone));
    vi.stubGlobal("fetch", fetchMock);

    await getTodayPrayerTimes(
      CAIRO.latitude,
      CAIRO.longitude,
      CAIRO.timezone,
      CAIRO.calculationMethod,
      CAIRO.madhab,
      new Date("2026-05-10"),
    );

    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain("/timings/10-05-2026");
  });

  it("الكاش بيمنع النداء المتكرر لنفس الطلب", async () => {
    const fetchMock = mockFetch(aladhanPayload(CAIRO_NOV_TIMINGS, CAIRO.timezone));
    vi.stubGlobal("fetch", fetchMock);

    const params = { ...CAIRO, date: new Date("2026-11-28") };
    await getPrayerTimes(params);
    await getPrayerTimes(params);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("الكاش بيرجع الصلاة القادمة محدَّثة مش متجمدة وقت التخزين", async () => {
    const fetchMock = mockFetch(aladhanPayload(CAIRO_NOV_TIMINGS, CAIRO.timezone));
    vi.stubGlobal("fetch", fetchMock);

    // أول نداء بعد الفجر (03:12Z) وقبل الشروق (04:31Z) → القادمة الشروق، ونتيجة الكاش بتتخزن
    vi.setSystemTime(new Date("2026-11-28T03:30:00Z"));
    const first = await getPrayerTimes({ ...CAIRO, date: new Date("2026-11-28") });
    expect(first.nextPrayer?.name).toBe("Sunrise");

    // نداء تاني من الكاش بعد العصر → القادمة لازم تتحدث للمغرب من نفس الـ timestamps
    vi.setSystemTime(new Date("2026-11-28T13:00:00Z"));
    const second = await getPrayerTimes({ ...CAIRO, date: new Date("2026-11-28") });

    expect(fetchMock).toHaveBeenCalledTimes(1); // من الكاش فعلاً
    expect(second.nextPrayer?.name).toBe("Maghrib");
  });

  it("فشل الـ API بدون كاش بينتج خطأ واضح — مفيش بيانات وهمية", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    await expect(
      getPrayerTimes({ ...CAIRO, date: new Date("2026-11-28") }),
    ).rejects.toThrow(/Failed to fetch prayer times/);
  });
});
