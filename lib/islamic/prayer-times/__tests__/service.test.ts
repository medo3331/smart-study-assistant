import { afterEach, describe, expect, it, vi } from "vitest";
import { getPrayerTimesForDate, clearExpiredCache } from "../service";

afterEach(() => {
  vi.unstubAllGlobals();
  clearExpiredCache();
});

function alAdhanResponse(date: string, timezone: string, times: Record<string, string> = {}) {
  const [year, month, day] = date.split("-");
  return {
    ok: true,
    json: async () => ({
      code: 200,
      status: "OK",
      data: {
        timings: {
          Fajr: "05:10", Sunrise: "06:20", Dhuhr: "12:30", Asr: "15:45", Maghrib: "18:40", Isha: "19:50",
          Imsak: "05:00", Midnight: "00:00", ...times,
        },
        date: {
          readable: `${day} ${month} ${year}`,
          timestamp: `${date}T12:00:00+00:00`,
          gregorian: { date: `${day}-${month}-${year}` },
          hijri: { date: "01-01-1448", format: "DD-MM-YYYY", day: "1", weekday: { en: "Monday", ar: "الاثنين" }, month: { en: "Muharram", ar: "محرم", number: 1 }, year: "1448" },
        },
        meta: {
          latitude: 40.7128,
          longitude: -74.006,
          timezone,
          method: { id: 5, name: "Egyptian General Authority", params: { Fajr: 19.5, Isha: 17.5, IshaInterval: null } },
        },
      },
    }),
  };
}

describe("AlAdhan prayer time service", () => {
  it("requests and converts the specified local date and coordinates using the actual IANA timezone", async () => {
    const fetch = vi.fn().mockResolvedValue(alAdhanResponse("2026-07-01", "America/New_York"));
    vi.stubGlobal("fetch", fetch);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T12:00:00.000Z"));

    const result = await getPrayerTimesForDate("2026-07-01", 40.7128, -74.006, "America/New_York");
    const requestUrl = new URL(fetch.mock.calls[0][0]);

    expect(requestUrl.pathname).toContain("/timings/01-07-2026");
    expect(requestUrl.searchParams.get("latitude")).toBe("40.7128");
    expect(requestUrl.searchParams.get("longitude")).toBe("-74.006");
    expect(requestUrl.searchParams.get("timezonestring")).toBe("America/New_York");
    expect(result.date).toBe("2026-07-01");
    expect(new Date(result.timestamps.fajr).toISOString()).toBe("2026-07-01T09:10:00.000Z");
    vi.useRealTimers();
  });

  it("rejects mismatched response dates rather than serving incorrect prayer times", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(alAdhanResponse("2026-07-02", "America/New_York")));
    await expect(getPrayerTimesForDate("2026-07-01", 40.7128, -74.006, "America/New_York"))
      .rejects.toThrow("different date than requested");
  });

  it("does not send an unmapped calculation method or madhab by substituting the server default", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(alAdhanResponse("2026-07-01", "America/New_York")));
    await expect(getPrayerTimesForDate("2026-07-01", 40.7128, -74.006, "America/New_York", "invalid" as never))
      .rejects.toThrow();
  });
});
