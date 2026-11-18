import { describe, it, expect, vi } from "vitest";

import { chunkTranscript } from "../lecture-prompts";
import { generateExamReview, type ExamReviewDeps } from "../exam-review";
import type { AiUsageContext } from "../usage-context";
import type { AiChatMessage } from "../types";

/**
 * 🌍 وضع **المعلومات العامة** — امتحان من غير أي ملف، المصدر هو معرفة الـAI.
 *
 * ⚠️ **اللي بنختبره**: البرومبت في الوضع العام بيقول «معلوماتك العامة»
 *    (مش «التفريغ»)، ومنع التفاصيل النادرة، و«مش مذكور في المحاضرة»
 *    ما بتظهرش (لأن مافيش محاضرة أصلاً).
 */
function usageForTask(aiTask: string): AiUsageContext {
  return {
    operationId: "op-1",
    idempotencyKey: `exam:s1:t:${aiTask}`,
    source: "server",
    userId: "u1",
    feature: "exam_review",
    diagnostics: { exam_session_id: "s1", ai_task: aiTask },
  };
}

function makeDeps(captured: AiChatMessage[][]) {
  const runTask = vi.fn(async (args: { messages: AiChatMessage[]; usage: AiUsageContext }) => {
    captured.push(args.messages);
    const aiTask = String(args.usage.diagnostics?.ai_task ?? "");
    if (aiTask === "questions" || aiTask === "questions_repair") {
      return {
        content: JSON.stringify({
          questions: [
            {
              type: "mcq",
              question: "سؤال عام؟",
              options: ["أ", "ب", "ج", "د"],
              correctAnswer: 0,
              explanation: "لأنه معروف في المجال.",
            },
            {
              type: "mcq",
              question: "سؤال عام تاني؟",
              options: ["أ", "ب", "ج", "د"],
              correctAnswer: 1,
              explanation: "لأنه معروف.",
            },
          ],
        }),
      };
    }
    return { content: "## الأساسيات\n- تعريف مهم\n\n## التطبيقات\n- مثال شائع" };
  });

  const deps: ExamReviewDeps = {
    runTask: runTask as never,
    chunk: chunkTranscript,
    chunkChars: 12_000,
    usageFor: (task) => usageForTask(task),
    afterCall: async () => {},
  };
  return { deps, runTask };
}

function systemOf(messages: AiChatMessage[]): string {
  return String(messages.find((m) => m.role === "system")?.content ?? "");
}

describe("generateExamReview — الوضع العام (معلومات عامة)", () => {
  it("برومبت الملخص بيقول «معلوماتك العامة» ومش «التفريغ»", async () => {
    const captured: AiChatMessage[][] = [];
    const { deps } = makeDeps(captured);

    await generateExamReview({
      transcript: "البناء الضوئي",
      deps,
      mode: "general",
    });

    const summarySystem = systemOf(captured[0]);
    expect(summarySystem).toContain("معلوماتك العامة");
    expect(summarySystem).not.toContain("تفريغ محاضرة جامعية");
    // ⚠️ ضوابط «مش مذكور في المحاضرة» بتاعت وضع المصدر ما بتظهرش.
    expect(summarySystem).not.toContain("مش مذكور في المحاضرة");
  });

  it("برومبت الأسئلة فيه منع التفاصيل النادرة بدل «خارج المحاضرة»", async () => {
    const captured: AiChatMessage[][] = [];
    const { deps } = makeDeps(captured);

    await generateExamReview({
      transcript: "البناء الضوئي",
      deps,
      mode: "general",
    });

    const questionsSystem = captured
      .map(systemOf)
      .find((text) => text.includes("اكتب بالضبط")) ?? "";
    expect(questionsSystem).toContain("معلوماتك العامة");
    expect(questionsSystem).toContain("ممنوع التفاصيل النادرة أو غير المؤكدة");
    expect(questionsSystem).not.toContain("ممنوع سؤال يحتاج معرفة خارج المحاضرة");
  });

  it("وضع المصدر (الافتراضي) بيفضل زي ما هو: مرتبط بالتفريغ", async () => {
    const captured: AiChatMessage[][] = [];
    const { deps } = makeDeps(captured);

    await generateExamReview({
      transcript: "نص محاضرة طويل كفاية",
      deps,
    });

    const summarySystem = systemOf(captured[0]);
    expect(summarySystem).toContain("تفريغ محاضرة جامعية");
    expect(summarySystem).toContain("مش مذكور في المحاضرة");
  });

  it("الموضوع الفاضي ⇒ خطأ واضح", async () => {
    const captured: AiChatMessage[][] = [];
    const { deps } = makeDeps(captured);

    await expect(
      generateExamReview({ transcript: "   ", deps, mode: "general" })
    ).rejects.toThrow();
  });
});
