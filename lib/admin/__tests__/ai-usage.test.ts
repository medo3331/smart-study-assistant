import { describe, it, expect } from "vitest";
import { normalizeAiUsageFilters } from "../ai-usage";

describe("normalizeAiUsageFilters", () => {
  it("defaults to 30 days", () => {
    const f = normalizeAiUsageFilters({});
    const days = (f.to.getTime() - f.from.getTime()) / 86400000;
    expect(days).toBeCloseTo(30, 0);
  });
  it("clamps range to 90 days", () => {
    const f = normalizeAiUsageFilters({ from: "2020-01-01", to: "2026-01-01" });
    const days = (f.to.getTime() - f.from.getTime()) / 86400000;
    expect(days).toBeLessThanOrEqual(90);
  });
  it("trims filters", () => {
    const f = normalizeAiUsageFilters({ feature: " chat ", provider: " groq ", status: " completed " });
    expect(f.feature).toBe("chat");
    expect(f.provider).toBe("groq");
    expect(f.status).toBe("completed");
  });
  it("invalid date falls back", () => {
    const f = normalizeAiUsageFilters({ from: "not-a-date", to: "also-bad" });
    expect(Number.isFinite(f.from.getTime())).toBe(true);
    expect(Number.isFinite(f.to.getTime())).toBe(true);
  });
});
