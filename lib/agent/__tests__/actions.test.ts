import { describe, it, expect } from "vitest";
import {
  extractAgentActions,
  validateMagicAction,
  MAGIC_ACTION_LIMITS,
} from "../actions";

describe("validateMagicAction", () => {
  it("web_search صالحة", () => {
    expect(validateMagicAction({ tool: "web_search", query: "سعر الدولار اليوم" })).toEqual({
      tool: "web_search",
      query: "سعر الدولار اليوم",
    });
  });

  it("web_search بدون query تُرفض", () => {
    expect(validateMagicAction({ tool: "web_search", query: "  " })).toBeNull();
  });

  it("diagram بنوع معروف — التفاصيل الافتراضية medium", () => {
    expect(validateMagicAction({ tool: "diagram", topic: "التمثيل الضوئي", type: "mindmap" })).toEqual({
      tool: "diagram",
      topic: "التمثيل الضوئي",
      type: "mindmap",
      detail: "medium",
    });
  });

  it("diagram بنوع مجهول تُرفض", () => {
    expect(validateMagicAction({ tool: "diagram", topic: "x", type: "hologram" })).toBeNull();
  });

  it("file بأقسام صالحة", () => {
    const a = validateMagicAction({
      tool: "file",
      title: "بحث النحالة",
      format: "pptx",
      sections: [{ heading: "مقدمة", body: "نص طويل" }],
    });
    expect(a).not.toBeNull();
    expect((a as { format: string }).format).toBe("pptx");
  });

  it("file بدون أقسام تُرفض", () => {
    expect(validateMagicAction({ tool: "file", title: "x", format: "pdf", sections: [] })).toBeNull();
  });

  it("file بصيغة غير مدعومة تُرفض", () => {
    expect(
      validateMagicAction({ tool: "file", title: "x", format: "exe", sections: [{ heading: "h", body: "b" }] }),
    ).toBeNull();
  });

  it("quiz بأسئلة صالحة", () => {
    const a = validateMagicAction({
      tool: "quiz",
      title: "اختبار سريع",
      questions: [{ question: "٢+٢؟", options: ["٣", "٤"], answerIndex: 1, explanation: "جمع بسيط" }],
    });
    expect(a).not.toBeNull();
  });

  it("quiz بفهرس إجابة خارج النطاق يُرفض", () => {
    expect(
      validateMagicAction({
        tool: "quiz",
        title: "x",
        questions: [{ question: "س", options: ["أ", "ب"], answerIndex: 5 }],
      }),
    ).toBeNull();
  });

  it("quiz بأسئلة فاسدة تُشال — لو فضلوا صفر تُرفض الكل", () => {
    expect(
      validateMagicAction({
        tool: "quiz",
        title: "x",
        questions: [{ question: "", options: ["أ"], answerIndex: 0 }],
      }),
    ).toBeNull();
  });

  it("أداة مجهولة تُرفض", () => {
    expect(validateMagicAction({ tool: "delete_database" })).toBeNull();
    expect(validateMagicAction(null)).toBeNull();
  });
});

describe("extractAgentActions", () => {
  it("يستخرج action واحدة ويشيل الكتلة من النص", () => {
    const message = [
      "جهزتلك اختبار سريع 👇",
      "```magic-action",
      JSON.stringify({
        tool: "quiz",
        title: "فيزياء",
        questions: [{ question: "وحدة القوة؟", options: ["نيوتن", "جول"], answerIndex: 0 }],
      }),
      "```",
      "بالتوفيق!",
    ].join("\n");
    const { actions, cleanedMessage } = extractAgentActions(message);
    expect(actions).toHaveLength(1);
    expect(actions[0].tool).toBe("quiz");
    expect(cleanedMessage).not.toContain("magic-action");
    expect(cleanedMessage).toContain("جهزتلك اختبار سريع");
    expect(cleanedMessage).toContain("بالتوفيق!");
  });

  it("يدعم مصفوفة أدوات في كتلة واحدة", () => {
    const message = [
      "```magic-action",
      JSON.stringify([
        { tool: "web_search", query: "أحدث إصدار React" },
        { tool: "diagram", topic: "دورة الحياة", type: "flowchart" },
      ]),
      "```",
    ].join("\n");
    const { actions } = extractAgentActions(message);
    expect(actions.map((a) => a.tool)).toEqual(["web_search", "diagram"]);
  });

  it("حد أقصى 3 أدوات في الرد الواحد", () => {
    const arr = Array.from({ length: 5 }, (_, i) => ({ tool: "web_search", query: `سؤال ${i}` }));
    const message = ["```magic-action", JSON.stringify(arr), "```"].join("\n");
    const { actions } = extractAgentActions(message);
    expect(actions).toHaveLength(MAGIC_ACTION_LIMITS.maxActionsPerTurn);
  });

  it("كتلة JSON فاسدة تتشال بصمت", () => {
    const message = ["قبل", "```magic-action", "{شبه JSON معطوب", "```", "بعد"].join("\n");
    const { actions, cleanedMessage } = extractAgentActions(message);
    expect(actions).toHaveLength(0);
    expect(cleanedMessage).toContain("قبل");
    expect(cleanedMessage).not.toContain("magic-action");
  });

  it("رد من غير كتل يرجع زي ما هو", () => {
    const { actions, cleanedMessage } = extractAgentActions("رد عادي من غير أدوات");
    expect(actions).toHaveLength(0);
    expect(cleanedMessage).toBe("رد عادي من غير أدوات");
  });
});
