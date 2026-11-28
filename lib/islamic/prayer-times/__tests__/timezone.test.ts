import { describe, expect, it } from "vitest";
import { dateInTimeZone, zonedDateTimeToTimestamp } from "../timezone";

describe("IANA prayer-time conversion", () => {
  it("uses local calendar dates instead of UTC dates", () => {
    expect(dateInTimeZone(new Date("2026-01-01T01:00:00.000Z"), "America/Los_Angeles")).toBe("2025-12-31");
  });

  it("converts a wall clock time to the correct instant", () => {
    expect(new Date(zonedDateTimeToTimestamp("2026-06-15", "05:10", "Africa/Cairo")).toISOString())
      .toBe("2026-06-15T02:10:00.000Z");
  });

  it("applies the timezone's daylight-saving offset for the requested date", () => {
    expect(new Date(zonedDateTimeToTimestamp("2026-07-01", "05:10", "America/New_York")).toISOString())
      .toBe("2026-07-01T09:10:00.000Z");
  });

  it("supports the AlAdhan 12-hour clock format", () => {
    expect(new Date(zonedDateTimeToTimestamp("2026-06-15", "05:10 PM", "UTC")).toISOString())
      .toBe("2026-06-15T17:10:00.000Z");
  });

  it("rejects impossible dates, invalid wall-clock times and unknown timezones", () => {
    expect(() => zonedDateTimeToTimestamp("2026-02-30", "05:10", "UTC")).toThrow();
    expect(() => zonedDateTimeToTimestamp("2026-02-28", "25:10", "UTC")).toThrow();
    expect(() => zonedDateTimeToTimestamp("2026-02-28", "05:10 PM extra", "UTC")).toThrow();
    expect(() => zonedDateTimeToTimestamp("2026-02-28", "05:10", "Invalid/Zone")).toThrow();
  });
});
