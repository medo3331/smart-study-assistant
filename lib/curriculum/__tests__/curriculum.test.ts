import { describe, expect, it } from "vitest";
import { curriculumCreditCost } from "../../ai/credit-pricing";
import {
  buildCurriculumDays,
  chunkOutline,
  parseEnrichment,
  parseOutline,
} from "../prompts";
import {
  CURRICULUM_MAX_LESSONS,
  CurriculumGenerationError,
  type CurriculumGenerationInput,
} from "../types";

function input(lessonCount: number): CurriculumGenerationInput {
  return {
    subject: "Computer Networks",
    category: "دراسة أكاديمية",
    level: "intermediate",
    lessonCount,
    focusTopics: ["OSI Model"],
    personaContext: "طالب جامعي",
  };
}

function outlineJson(count: number, topics?: string[]): string {
  return JSON.stringify({
    isValid: true,
    outline: Array.from({ length: count }, (_, index) => ({
      day: index + 1,
      title: `عنوان ${index + 1}`,
      topic: topics?.[index] ?? `موضوع ${index + 1}`,
      kind: "content",
    })),
  });
}

describe("curriculum pricing", () => {
  it("charges 1 credit per 10 lessons", () => {
    expect(curriculumCreditCost(3)).toBe(1);
    expect(curriculumCreditCost(10)).toBe(1);
    expect(curriculumCreditCost(11)).toBe(2);
    expect(curriculumCreditCost(30)).toBe(3);
    expect(curriculumCreditCost(CURRICULUM_MAX_LESSONS)).toBe(5);
  });
});

describe("curriculum outline validation", () => {
  it("returns exactly the requested count", () => {
    const parsed = parseOutline(outlineJson(3), input(3));
    expect(parsed).toHaveLength(3);
    expect(parsed.map((lesson) => lesson.day)).toEqual([1, 2, 3]);
  });

  it("slices an over-long outline instead of accepting extra lessons", () => {
    const parsed = parseOutline(outlineJson(5), input(3));
    expect(parsed).toHaveLength(3);
  });

  it("forces the last lesson to be a review", () => {
    const parsed = parseOutline(outlineJson(3), input(3));
    expect(parsed[2].kind).toBe("review");
    expect(parsed[2].topic).toContain("مراجعة");
  });

  it("rejects a short outline with a retryable error", () => {
    try {
      parseOutline(outlineJson(2), input(3));
      throw new Error("expected parseOutline to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CurriculumGenerationError);
      expect((error as CurriculumGenerationError).retryable).toBe(true);
      expect((error as CurriculumGenerationError).code).toBe("COUNT_MISMATCH");
    }
  });

  it("rejects duplicate topics", () => {
    expect(() =>
      parseOutline(outlineJson(3, ["TCP", "TCP", "Routing"]), input(3))
    ).toThrow(CurriculumGenerationError);
  });

  it("does not retry when the model says the subject is invalid", () => {
    try {
      parseOutline(JSON.stringify({ isValid: false, reason: "اسم المادة غير واضح." }), input(3));
      throw new Error("expected parseOutline to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CurriculumGenerationError);
      expect((error as CurriculumGenerationError).retryable).toBe(false);
      expect((error as CurriculumGenerationError).status).toBe(422);
    }
  });
});

describe("curriculum enrichment validation", () => {
  it("maps descriptions by day and requires every day", () => {
    const outline = parseOutline(outlineJson(2), { ...input(2) });
    const batch = chunkOutline(outline)[0];
    const raw = JSON.stringify({
      isValid: true,
      days: [
        { day: 1, description: "وصف أول" },
        { day: 2, description: "وصف تاني" },
      ],
    });
    const descriptions = parseEnrichment(raw, batch);
    expect(descriptions.get(1)).toBe("وصف أول");
    expect(descriptions.get(2)).toBe("وصف تاني");
  });

  it("rejects a batch with a missing description", () => {
    const outline = parseOutline(outlineJson(2), { ...input(2) });
    const batch = chunkOutline(outline)[0];
    const raw = JSON.stringify({ isValid: true, days: [{ day: 1, description: "وصف" }] });
    expect(() => parseEnrichment(raw, batch)).toThrow(CurriculumGenerationError);
  });

  it("refuses to build days with a missing description", () => {
    const outline = parseOutline(outlineJson(2), { ...input(2) });
    const descriptions = new Map<number, string>([[1, "وصف"]]);
    expect(() => buildCurriculumDays(outline, descriptions)).toThrow(
      CurriculumGenerationError
    );
  });
});

describe("curriculum batching", () => {
  it("splits into batches of 10", () => {
    const outline = parseOutline(outlineJson(25), input(25));
    const batches = chunkOutline(outline);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(10);
    expect(batches[1]).toHaveLength(10);
    expect(batches[2]).toHaveLength(5);
  });
});
