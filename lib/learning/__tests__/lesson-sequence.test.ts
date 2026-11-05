import { describe, expect, it } from "vitest";
import { buildLessonSequence } from "../lesson-sequence";

function days(completed: boolean[]) {
  return completed.map((isCompleted, index) => ({
    id: `lesson-${index + 1}`,
    dayNumber: index + 1,
    isCompleted,
  }));
}

describe("lesson sequence locking", () => {
  it("keeps the first lesson open and locks the rest", () => {
    const result = buildLessonSequence(days([false, false, false]));
    expect(result.map((item) => item.isLocked)).toEqual([false, true, true]);
    expect(result[0].isCurrent).toBe(true);
    expect(result.filter((item) => item.isCurrent)).toHaveLength(1);
  });

  it("opens the next lesson after the previous one is completed", () => {
    const result = buildLessonSequence(days([true, false, false]));
    expect(result.map((item) => item.isLocked)).toEqual([false, false, true]);
    expect(result[1].isCurrent).toBe(true);
    expect(result[0].isCurrent).toBe(false);
  });

  it("keeps completed lessons open for review", () => {
    const result = buildLessonSequence(days([true, true, false]));
    expect(result[0].isLocked).toBe(false);
    expect(result[1].isLocked).toBe(false);
    expect(result[2].isCurrent).toBe(true);
  });

  it("has no current lesson when everything is completed", () => {
    const result = buildLessonSequence(days([true, true, true]));
    expect(result.some((item) => item.isCurrent)).toBe(false);
    expect(result.every((item) => !item.isLocked)).toBe(true);
  });

  it("sorts unsorted input before locking", () => {
    const result = buildLessonSequence([
      { id: "c", dayNumber: 3, isCompleted: false },
      { id: "a", dayNumber: 1, isCompleted: true },
      { id: "b", dayNumber: 2, isCompleted: false },
    ]);
    expect(result.map((item) => item.lesson.id)).toEqual(["a", "b", "c"]);
    expect(result.map((item) => item.isLocked)).toEqual([false, false, true]);
    expect(result[1].isCurrent).toBe(true);
  });
});

describe("early unlock", () => {
  it("unlocks a day that exists in unlockedDays even if the previous day is incomplete", () => {
    const result = buildLessonSequence(days([true, false, false]), {
      unlockedDays: ["lesson-3"],
    });
    expect(result[1].isLocked).toBe(false);
    expect(result[2].isLocked).toBe(false);
    expect(result[2].isEarlyUnlocked).toBe(true);
    expect(result[1].isCurrent).toBe(true);
  });

  it("does not mark an already-open day as early unlocked", () => {
    const result = buildLessonSequence(days([true, false]), {
      unlockedDays: ["lesson-2"],
    });
    expect(result[1].isLocked).toBe(false);
    expect(result[1].isEarlyUnlocked).toBe(false);
  });
});
