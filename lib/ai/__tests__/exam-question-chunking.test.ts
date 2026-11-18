import { describe, it, expect, vi } from "vitest";

import { chunkTranscript } from "../lecture-prompts";
import {
  generateExamReview,
  estimateItemBudget,
  estimateQuestionCalls,
  splitQuestionQuota,
  EXAM_QUESTION_CHUNK_SIZE,
  type ExamReviewDeps,
  type ExamQuestionType,
} from "../exam-review";
import type { AiUsageContext } from "../usage-context";
import type { AiChatMessage } from "../types";

/**
 * تقسيم توليد الأسئلة لمجموعات (5 أسئلة كحد أقصى للنداء الواحد).
 *
 * ⚠️ السبب: طلب 20 سؤال في نداء واحد = ذروة عالية على المزوّد ⇒ 429
 *    ومهلات ومخرج ممكن يتقصّ. التقسيم بيقلّل استهلاك التوكنز في النداء
 *    الواحد، وبيخلّي جزء من الأسئلة ينجح لو جزء اتعطّل.
 */
describe("splitQuestionQuota — تقسيم الحصّة لمجموعات", () => {
  it("20 سؤال ⇒ 4 مجموعات × 5", () => {
    expect(splitQuestionQuota(20)).toEqual([5, 5, 5, 5]);
  });

  it("7 أسئلة ⇒ [5, 2]", () => {
    expect(splitQuestionQuota(7)).toEqual([5, 2]);
  });

  it("5 أسئلة ⇒ مجموعة واحدة", () => {
    expect(splitQuestionQuota(5)).toEqual([5]);
  });

  it("صفر/سالب ⇒ مافيش مجموعات", () => {
    expect(splitQuestionQuota(0)).toEqual([]);
    expect(splitQuestionQuota(-3)).toEqual([]);
  });

  it("الحد الأقصى 5 (مفيش نداء bigger)", () => {
    expect(EXAM_QUESTION_CHUNK_SIZE).toBe(5);
    for (const part of splitQuestionQuota(20)) {
      expect(part).toBeLessThanOrEqual(EXAM_QUESTION_CHUNK_SIZE);
    }
  });
});

describe("تقدير الميزانية بعد التقسيم", () => {
  it("سقف الأسئلة بيتحسب من عدد الأسئلة المطلوب", () => {
    // قطعة واحدة + 20 سؤال ⇒ 1 ملخص + 4 نداءات أسئلة.
    expect(estimateQuestionCalls(1, 20)).toBe(4);
    expect(estimateItemBudget(1, 20)).toEqual({ logical: 5, attempts: 15 });
  });

  it("3 قطع + 20 سؤال ⇒ 4 أسئلة(summary+merge) + 6 نداءات أسئلة", () => {
    expect(estimateQuestionCalls(3, 20)).toBe(6);
    expect(estimateItemBudget(3, 20)).toEqual({ logical: 10, attempts: 30 });
  });

  it("الافتراضي (بدون count) زي قبل ⇒ 1/2/3 قطع = 2/5/7", () => {
    expect(estimateItemBudget(1)).toEqual({ logical: 2, attempts: 6 });
    expect(estimateItemBudget(2)).toEqual({ logical: 5, attempts: 15 });
    expect(estimateItemBudget(3)).toEqual({ logical: 7, attempts: 21 });
  });
});

describe("generateExamReview — مافيش نداء يطلب أكتر من 5 أسئلة", () => {
  function usageForTask(aiTask: string): AiUsageContext {
    return {
      operationId: "op-1",
      idempotencyKey: `exam:s1:l1:${aiTask}`,
      source: "server",
      userId: "u1",
      feature: "exam_review",
      diagnostics: { ai_task: aiTask },
    };
  }

  /** يقرأ العدد المطلوب من البرومبت «اكتب بالضبط N سؤالًا». */
  function promptQuota(messages: AiChatMessage[]): number {
    const system = String(messages.find((m) => m.role === "system")?.content ?? "");
    const match = /بالضبط\s+(\d+)\s+سؤال/.exec(system);
    return match ? Number(match[1]) : 0;
  }

  function mcq(index: number) {
    return {
      type: "mcq" as ExamQuestionType,
      question: `سؤال اختيار ${index}؟`,
      options: ["أ", "ب", "ج", "د"],
      correctAnswer: index % 4,
      explanation: "لأن المحاضرة ذكرت ذلك صراحة.",
    };
  }

  it("20 سؤال في محاضرة قصيرة ⇒ 4 نداءات (5/5/5/5)", async () => {
    const quotas: number[] = [];
    let call = 0;

    const runTask = vi.fn(async (args: { messages: AiChatMessage[]; usage: AiUsageContext }) => {
      const aiTask = String(args.usage.diagnostics?.ai_task ?? "");
      if (aiTask === "questions" || aiTask === "questions_repair") {
        const quota = promptQuota(args.messages);
        quotas.push(quota);
        call += 1;
        return {
          content: JSON.stringify({
            questions: Array.from({ length: quota }, (_, i) => mcq(call * 100 + i)),
          }),
        };
      }
      return { content: "## الفصل الأول\n- تعريف مهم\n- مثال من المحاضرة" };
    });

    const deps: ExamReviewDeps = {
      runTask,
      chunk: chunkTranscript,
      chunkChars: 12_000,
      usageFor: (task) => usageForTask(task),
    };

    const result = await generateExamReview({
      transcript: "نص المحاضرة القصيرة.",
      deps,
      spec: { types: ["mcq"], difficulty: "medium", count: 20 },
    });

    // ⚠️ مافيش نداد واحد طلب أكتر من 5.
    expect(Math.max(...quotas)).toBeLessThanOrEqual(EXAM_QUESTION_CHUNK_SIZE);
    expect(quotas).toEqual([5, 5, 5, 5]);
    expect(result.review.questions.length).toBe(20);
  });
});
