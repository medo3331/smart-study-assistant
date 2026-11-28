import { afterEach, describe, expect, it, vi } from "vitest";
import { getQuranProgress, getQuranReadingPosition, setQuranPosition } from "../worship-progress";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("local Quran reading position", () => {
  it("persists the last position across local-day changes while resetting the daily count", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
      dispatchEvent: vi.fn(),
    });

    setQuranPosition(18, 42, 7, "2026-06-01", "2026-06-01T20:00:00.000Z");
    const nextDay = getQuranProgress("2026-06-02");
    const savedPosition = getQuranReadingPosition();

    expect(nextDay.dailyCount).toBe(0);
    expect(savedPosition).toEqual({ surahId: 18, ayahId: 42, updatedAt: "2026-06-01T20:00:00.000Z" });
  });
});
