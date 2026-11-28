import { describe, it, expect, vi } from "vitest";
import {
  buildReligiousChatSystemPrompt,
  sliceChatContext,
  validateChatMessages,
  chatHistoryKey,
  loadChatState,
  saveChatState,
  newMessageId,
  normalizeDigits,
  parseOptionChoice,
  normalizeArabicText,
  gradeQuizAnswer,
  isValidStoredQuestion,
  formatQuizQuestionMessage,
  formatQuizFeedbackMessage,
  formatQuizSummaryMessage,
  type ChatMessage,
} from "@/lib/religious-chat";
import type { StoredQuestion } from "@/lib/worship-quiz-bank";

/* ── عناصر ثابتة ── */

const question: StoredQuestion = {
  question: "كم عدد أركان الإسلام؟",
  options: ["ثلاثة", "أربعة", "خمسة", "ستة"],
  correct: 2,
  source: "صحيح البخاري، حديث ٨",
  explanation: "الإسلام ببمسلم خمس: الشهادتان والصلاة والزكاة والصوم والحج.",
};

function msg(role: "user" | "assistant", content: string, i = 0): ChatMessage {
  return { id: `m-${i}`, role, content, ts: i };
}

/* ==========================================================================
   ١) برومبت النظام — قواعد المصادر الصارمة لازم تفضل موجودة
   ========================================================================== */

describe("buildReligiousChatSystemPrompt", () => {
  it("بيفرض أسماء السور وأرقام الآيات", () => {
    expect(buildReligiousChatSystemPrompt()).toContain("اسم السورة ورقم الآية");
  });

  it("بيحصر الأحاديث في الصحيحين والكتب الستة", () => {
    const prompt = buildReligiousChatSystemPrompt();
    expect(prompt).toContain("البخاري");
    expect(prompt).toContain("الكتب الستة");
  });

  it("بيمنع الأحاديث الضعيفة والخلافات الفقهية", () => {
    const prompt = buildReligiousChatSystemPrompt();
    expect(prompt).toContain("الضعيفة");
    expect(prompt).toContain("الخلافات الفقهية");
  });

  it("بيمنع اختلاق المصادر وبيقول «معلومة عامة» لما مفيش مصدر", () => {
    const prompt = buildReligiousChatSystemPrompt();
    expect(prompt).toContain("ممنوع اختلاق مصدر");
    expect(prompt).toContain("معلومة عامة");
  });
});

/* ==========================================================================
   ٢) سياق المحادثة — التشذيب والتحقق
   ========================================================================== */

describe("sliceChatContext", () => {
  it("بيرجّع آخر ١٢ رسالة بالترتيب الأصلي وبدون id/ts", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "assistant", `رسالة ${i}`, i),
    );
    const sliced = sliceChatContext(many);
    expect(sliced).toHaveLength(12);
    expect(sliced[0].content).toBe("رسالة 8");
    expect(sliced[11].content).toBe("رسالة 19");
    expect(sliced[0]).not.toHaveProperty("id");
  });
});

describe("validateChatMessages", () => {
  it("بيقبل مصفوفة صالحة وبيقصّ المسافات", () => {
    const out = validateChatMessages([
      { role: "user", content: "  إيه حكم الصلاة؟  " },
    ]);
    expect(out).toEqual([{ role: "user", content: "إيه حكم الصلاة؟" }]);
  });

  it("بيرفض غير المصفوفة والمصفوفة الفاضية", () => {
    expect(validateChatMessages(null)).toBeNull();
    expect(validateChatMessages("نص")).toBeNull();
    expect(validateChatMessages([])).toBeNull();
  });

  it("بيرفض role غريب أو content مش نص أو فاضي", () => {
    expect(validateChatMessages([{ role: "system", content: "x" }])).toBeNull();
    expect(validateChatMessages([{ role: "user", content: 5 }])).toBeNull();
    expect(validateChatMessages([{ role: "user", content: "   " }])).toBeNull();
  });

  it("بيرفض رسائل فوق الحد الأقصى وعدد رسائل فوق ٢٤", () => {
    const long = "ا".repeat(4001);
    expect(validateChatMessages([{ role: "user", content: long }])).toBeNull();
    const many = Array.from({ length: 25 }, (_, i) => ({
      role: "user" as const,
      content: `س ${i}`,
    }));
    expect(validateChatMessages(many)).toBeNull();
  });
});

/* ==========================================================================
   ٣) التخزين المحلي — مفتاح لكل مستخدم وعطب مايضربش
   ========================================================================== */

describe("التخزين المحلي للمحادثة", () => {
  /** بيئة node مافيهاش window — بنركّب localStorage وهمي للبيانات. */
  function withFakeLocalStorage(
    fn: (store: Map<string, string>) => void,
  ): void {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
    try {
      fn(store);
    } finally {
      vi.unstubAllGlobals();
    }
  }

  it("chatHistoryKey بيضمّن معرّف المستخدم", () => {
    expect(chatHistoryKey("u-123")).toBe("worship-religious-chat:u-123");
  });

  it("loadChatState على السيرفر (من غير window) بيرجّع حالة فاضية", () => {
    expect(loadChatState("u-1")).toEqual({ messages: [], quiz: null });
  });

  it("loadChatState مع localStorage معطوب بيرجّع حالة فاضية ومايضربش", () => {
    withFakeLocalStorage(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new Error("blocked");
        },
      });
      expect(loadChatState("u-1")).toEqual({ messages: [], quiz: null });
    });
  });

  it("حفظ وقراءة round-trip بالرسائل وجولة الاختبرني", () => {
    withFakeLocalStorage(() => {
      const state = {
        messages: [msg("user", "السلام عليكم", 1)],
        quiz: { sessionId: "11111111-1111-4111-8111-111111111111", asked: 3 },
      };
      saveChatState("u-rt", state);
      expect(loadChatState("u-rt")).toEqual(state);
      saveChatState("u-rt", { messages: [], quiz: null });
      expect(loadChatState("u-rt").messages).toEqual([]);
    });
  });

  it("loadChatState بيرفض الرسائل المشوهة وبيقصّ عند ٢٠٠", () => {
    withFakeLocalStorage((store) => {
      const garbage = [
        { role: "user", content: "تمام", ts: 1, id: "a" },
        { role: "nope", content: "بايظ", ts: 2, id: "b" },
        { content: "من غير role", ts: 3 },
      ];
      store.set(
        chatHistoryKey("u-filter"),
        JSON.stringify({ messages: garbage, quiz: null }),
      );
      expect(loadChatState("u-filter").messages).toHaveLength(1);

      const many = Array.from({ length: 300 }, (_, i) => ({
        id: `m${i}`,
        role: "user",
        content: `س ${i}`,
        ts: i,
      }));
      store.set(
        chatHistoryKey("u-cap"),
        JSON.stringify({ messages: many, quiz: null }),
      );
      expect(loadChatState("u-cap").messages).toHaveLength(200);
    });
  });

  it("newMessageId بيرجّع قيم مختلفة", () => {
    expect(newMessageId()).not.toBe(newMessageId());
  });
});

/* ==========================================================================
   ٤) تصحيح إجابات «اختبرني» — الأرقام والحروف والنص
   ========================================================================== */

describe("normalizeDigits", () => {
  it("بيحوّل العربية والفارسية لـ ASCII", () => {
    expect(normalizeDigits("١٢٣")).toBe("123");
    expect(normalizeDigits("۴۵")).toBe("45");
  });
});

describe("parseOptionChoice", () => {
  it("بيقرأ الأرقام ١-٤ بأشكالها", () => {
    expect(parseOptionChoice("٣")).toBe(2);
    expect(parseOptionChoice("2")).toBe(1);
    expect(parseOptionChoice("٤.")).toBe(3);
    expect(parseOptionChoice("(1)")).toBe(0);
  });

  it("بيقرأ الحروف أ-د بأشكالها الشائعة", () => {
    expect(parseOptionChoice("أ")).toBe(0);
    expect(parseOptionChoice("ا")).toBe(0);
    expect(parseOptionChoice("ج)")).toBe(2);
    expect(parseOptionChoice("الخيار د")).toBe(3);
    expect(parseOptionChoice("الخيار: ب")).toBe(1);
    expect(parseOptionChoice("(د)")).toBe(3);
  });

  it("بيرفض الأرقام خارج المدى والكلام العادي", () => {
    expect(parseOptionChoice("5")).toBeNull();
    expect(parseOptionChoice("0")).toBeNull();
    expect(parseOptionChoice("مش عارف")).toBeNull();
    expect(parseOptionChoice("")).toBeNull();
  });
});

describe("normalizeArabicText", () => {
  it("بيوحّد الهمزات والتاء المربوطة والألف المقصورة ويشيل التشكيل", () => {
    expect(normalizeArabicText("الإسلامُ")).toBe("الاسلام");
    expect(normalizeArabicText("مدرسة")).toBe("مدرسه");
    expect(normalizeArabicText("على")).toBe("علي");
    expect(normalizeArabicText("مَدَدٍ ــ طويل")).toBe("مدد طويل");
  });
});

describe("gradeQuizAnswer", () => {
  it("بيقبّل رقم الحرف الصحيح", () => {
    expect(gradeQuizAnswer("ج", question)).toBe(2);
  });

  it("بيقبّل نص الإجابة الصحيحة حتى بالاختلافات الإملائية", () => {
    expect(gradeQuizAnswer("خمسة", question)).toBe(2);
    expect(gradeQuizAnswer("  الخمسة  ", {
      ...question,
      options: ["ثلاثه", "أربعة", "خمسة", "ستة"],
    })).toBe(2);
  });

  it("بيرجّع null لإجابة بره الخيارات", () => {
    expect(gradeQuizAnswer("سبعة", question)).toBeNull();
    expect(gradeQuizAnswer("", question)).toBeNull();
  });

  it("بيقبل نص الخيار جوّه جملة أطول", () => {
    expect(gradeQuizAnswer("أكيد خمسة أركان", question)).toBe(2);
  });
});

describe("isValidStoredQuestion", () => {
  it("بيقبل السؤال السليم ويرفض الناقص", () => {
    expect(isValidStoredQuestion(question)).toBe(true);
    expect(isValidStoredQuestion({ ...question, options: ["واحد"] })).toBe(false);
    expect(isValidStoredQuestion({ ...question, correct: 9 })).toBe(false);
    expect(isValidStoredQuestion({ ...question, source: "" })).toBe(false);
    expect(isValidStoredQuestion(null)).toBe(false);
  });
});

/* ==========================================================================
   ٥) تنسيق رسائل الشات — من غير تسريب الإجابة قبل التصحيح
   ========================================================================== */

describe("formatQuizQuestionMessage", () => {
  it("بيعرض السؤال والخيارات والمصدر من غير الإجابة الصحيحة", () => {
    const text = formatQuizQuestionMessage(question, 3, 10);
    expect(text).toContain("سؤال 3 من 10");
    expect(text).toContain("كم عدد أركان الإسلام؟");
    expect(text).toContain("أ) ثلاثة");
    expect(text).toContain("ج) خمسة");
    expect(text).toContain("صحيح البخاري، حديث ٨");
    // مهم: رسالة السؤال مافيهاش مؤشر للإجابة الصحيحة
    expect(text).not.toContain("الإجابة الصحيحة");
  });
});

describe("formatQuizFeedbackMessage", () => {
  it("صح — بيأكد بالشرح والمصدر من غير إجابة المستخدم", () => {
    const text = formatQuizFeedbackMessage({
      correct: true,
      yourAnswer: "ج",
      correctText: "خمسة",
      explanation: question.explanation,
      source: question.source,
    });
    expect(text).toContain("✅");
    expect(text).toContain(question.explanation);
    expect(text).not.toContain("إجابتك");
  });

  it("غلط — بيوضّح الصحيح وإجابتك", () => {
    const text = formatQuizFeedbackMessage({
      correct: false,
      yourAnswer: "أول",
      correctText: "خمسة",
      explanation: question.explanation,
      source: question.source,
    });
    expect(text).toContain("❌");
    expect(text).toContain("الصحيح هو: خمسة");
    expect(text).toContain("إجابتك: أول");
  });
});

describe("formatQuizSummaryMessage", () => {
  it("بيعرض النتيجة والمكافأة", () => {
    const text = formatQuizSummaryMessage({ score: 8, total: 10, awarded: 10 });
    expect(text).toContain("نتيجتك: 8/10");
    expect(text).toContain("كسبت 10 كوينز");
  });

  it("من غير مكافأة (سقف يومي) بيرجّع رسالة واضحة", () => {
    const text = formatQuizSummaryMessage({ score: 3, total: 10, awarded: 0 });
    expect(text).toContain("مفيش كوينز إضافية");
  });
});
