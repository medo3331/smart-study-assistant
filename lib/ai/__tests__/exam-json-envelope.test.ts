import { describe, it, expect, vi } from "vitest";

import { chunkTranscript } from "../lecture-prompts";
import { generateExamReview, examMaxTokens } from "../exam-review";
import type { AiUsageContext } from "../usage-context";
import type { AiChatMessage } from "../types";

/**
 * 🔬 **الشكل اللي الموديل بيرجّعه فعلاً** — الـroot cause للـ502/503.
 *
 * ⚠️ **اللي اتأكد حيّ**: `gpt-oss-20b` رجّع **Array مباشر**
 *    `[ {type:"mcq",…}, … ]` مش `{questions:[ … ]}` ⇒ الـparse (``expectObject``)
 *    كان **بيرمي** ⇒ كل بنود الامتحان فشلت بـ`PROVIDER_ERROR` ⇒ 502/503
 *    للطالب (من `ai_usage_events`: الـsummary والـquestions اتنفذوا بنجاح
 *    وبعدها البند فشل).
 *
 * ⇒ الحل: الـparser يقبل الشكلين، والبرومبت بيوضّح الـiorفة `{questions:[…]}`.
 */
function usageForTask(aiTask: string): AiUsageContext {
  return {
    operationId: "op-1",
    idempotencyKey: `exam:s1:${aiTask}`,
    source: "server",
    userId: "u1",
    feature: "exam_review",
    diagnostics: { exam_session_id: "s1", ai_task: aiTask },
  };
}

const ARRAY_ANSWER = JSON.stringify([
  {
    type: "mcq",
    question: "سؤال على شكل Array؟",
    options: ["أ", "ب", "ج", "د"],
    correctAnswer: 0,
    explanation: "لأنه معروف.",
  },
  {
    type: "mcq",
    question: "سؤال تاني على شكل Array؟",
    options: ["أ", "ب", "ج", "د"],
    correctAnswer: 1,
    explanation: "لأنه معروف.",
  },
]);

const OBJECT_ANSWER = JSON.stringify({
  questions: [
    {
      type: "mcq",
      question: "سؤال على شكل object؟",
      options: ["أ", "ب", "ج", "د"],
      correctAnswer: 0,
      explanation: "لأنه معروف.",
    },
  ],
});

function makeDeps(answer: string) {
  const runTask = vi.fn(async (args: { messages: AiChatMessage[]; usage: AiUsageContext }) => {
    const aiTask = String(args.usage.diagnostics?.ai_task ?? "");
    if (aiTask === "questions" || aiTask === "questions_repair") {
      return { content: answer };
    }
    return { content: "## ملخص\n- نقطة" };
  });

  return {
    deps: {
      runTask: runTask as never,
      chunk: chunkTranscript,
      chunkChars: 12_000,
      usageFor: (task: string) => usageForTask(task),
      afterCall: async () => {},
    },
    runTask,
  };
}

describe("شكل رد الـJSON — Array ولا {questions:[…]}", () => {
  it("Array مباشر ⇒ بيتقبل (كان بيرمي ⇒ 502/503)", async () => {
    const { deps } = makeDeps(ARRAY_ANSWER);
    const result = await generateExamReview({
      transcript: "البناء الضوئي",
      deps: deps as never,
      spec: { types: ["mcq"], difficulty: "medium", count: 2 },
    });
    expect(result.review.questions.length).toBe(2);
  });

  it("object {questions:[…]} ⇒ بيتقبل زي ما كان", async () => {
    const { deps } = makeDeps(OBJECT_ANSWER);
    const result = await generateExamReview({
      transcript: "البناء الضوئي",
      deps: deps as never,
      spec: { types: ["mcq"], difficulty: "medium", count: 1 },
    });
    expect(result.review.questions.length).toBe(1);
  });

  it("البرومبت بيوضّح الـenvelope {questions:[…]}", async () => {
    const { deps, runTask } = makeDeps(ARRAY_ANSWER);
    await generateExamReview({
      transcript: "البناء الضوئي",
      deps: deps as never,
      spec: { types: ["mcq"], difficulty: "medium", count: 2 },
    });
    const systems = runTask.mock.calls.map(
      (call) => String((call[0] as { messages: AiChatMessage[] }).messages.find((m) => m.role === "system")?.content ?? "")
    );
    const questionsPrompt = systems.find((text) => text.includes("اكتب بالضبط")) ?? "";
    expect(questionsPrompt).toContain("questions");
  });
});

describe("سقف توكنات المخرج — مفيش اقتطاع", () => {
  it("أسئلة 5 ⇒ 4000 توكن (أكبر من الـ1270 الفعلية)", () => {
    // ⚠️ اتأكد حيّ: 5 أسئلة على gpt-oss-20b = 1270 توكن (فيهم تفكير)
    //    ⇒ 2048 كان بيبتر ⇒ JSON ناقص ⇒ نفس الـ502.
    expect(examMaxTokens("questions", 5)).toBe(4_000);
    expect(examMaxTokens("questions", 5)).toBeGreaterThanOrEqual(2_048);
  });

  it("السقف الكلي 4096 (مفيش نداءات طويلة بتبتر)", () => {
    expect(examMaxTokens("questions", 20)).toBeLessThanOrEqual(4_096);
    expect(examMaxTokens("questions_repair", 5)).toBe(4_000);
    expect(examMaxTokens("summary")).toBe(3_000);
  });
});
