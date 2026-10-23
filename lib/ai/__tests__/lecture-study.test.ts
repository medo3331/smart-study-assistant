/**
 * 🃏❓ اختبار محتوى المذاكرة — Phase 4-B
 *
 * ⚠️ **مافيش نداء مزوّد حقيقي** — `runTask` بيتحقن كـ mock في كل اختبار.
 * هدف الملفات دي: التحقق، إزالة التكرار، والحدود. مش جودة أسئلة الموديل
 * (دي بتتقاس بتجربة حقيقية على محاضرة، مش بـ unit test).
 */

import { describe, it, expect, vi } from "vitest";

import {
  DEFAULT_STUDY_COUNT,
  MAX_STUDY_COUNT,
  MCQ_OPTIONS_COUNT,
  dedupeBySimilarity,
  generateStudyContent,
  normalizeForCompare,
  resolveStudyCount,
  saveStudyContent,
  StudyContentError,
  validateFlashcards,
  validateMcqs,
  type GenerateDeps,
  type Mcq,
} from "../lecture-study";

/* ───────────────── أدوات بناء العيّنات ───────────────── */

const okFlashcard = (question: string) => ({ question, answer: `إجابة ${question}` });

const okMcq = (question: string, correctAnswer = 0): Mcq => ({
  question,
  options: ["صحيح", "غلط1", "غلط2", "غلط3"],
  correctAnswer,
  explanation: "لأن ده正解.",
});

/** مزوّد مزيف بيرجّع JSON مت predetermined. */
function mockTask(responses: string[]) {
  let call = 0;
  return vi.fn(async () => ({ content: responses[call++] ?? responses[responses.length - 1] }));
}

const noChunk = (text: string) => (text.trim() === "" ? [] : [text]);

/* ════════════════ حدود العدد ════════════════ */

describe("resolveStudyCount — سقف على العميل", () => {
  it("الافتراضي 10", () => {
    expect(DEFAULT_STUDY_COUNT).toBe(10);
    expect(resolveStudyCount(undefined)).toBe(10);
    expect(resolveStudyCount(null)).toBe(10);
    expect(resolveStudyCount("مش رقم")).toBe(10);
  });

  it("مافيش حد أعلى من 50 مهما كان الطلب", () => {
    // ⚠️ الأهم: عميل يطلب مليون بطاقة لازم يترفض بصمت، مش يتنفّذ.
    expect(resolveStudyCount(1_000_000)).toBe(MAX_STUDY_COUNT);
    expect(MAX_STUDY_COUNT).toBe(50);
  });

  it("أقل من 1 بيرجع 1", () => {
    expect(resolveStudyCount(0)).toBe(1);
    expect(resolveStudyCount(-5)).toBe(1);
  });

  it("عدد عشري بيتقرّب لتحت", () => {
    expect(resolveStudyCount(7.9)).toBe(7);
  });
});

/* ════════════════ التطبيع وإزالة التكرار ════════════════ */

describe("إزالة التكرار", () => {
  it("التطبيع بيعمل مع الهمزات والتاء المربوطة", () => {
    expect(normalizeForCompare("إستخدام")).toBe(normalizeForCompare("استخدام"));
    expect(normalizeForCompare("الطريقة")).toBe(normalizeForCompare("الطريقه"));
  });

  it("شيل علامات الترقيم والمسافات", () => {
    expect(normalizeForCompare("ما هو الـ LP؟")).toBe(
      normalizeForCompare("ماهو الـ LP"),
    );
  });

  it("بيشيل أسئلة reformulations المتشابهة", () => {
    // ⚠️ الاختبار ده بيمسك المشكلة الحقيقية: الموديل بيكتب نفس السؤال
    // بأشكال مختلفة، والمقارنة الحرفية كانت هتفوّتها.
    const items = [
      okFlashcard("ما هو الـ Linear Programming؟"),
      okFlashcard("ماهو الـ Linear Programming"),
      okFlashcard("ما الفرق بين الـ LP و الـ Integer؟"),
    ];
    const result = dedupeBySimilarity(items, (item) => item.question);

    expect(result).toHaveLength(2);
    expect(result[1].question).toBe("ما الفرق بين الـ LP و الـ Integer؟");
  });

  it("بيحافظ على الترتيب (الأول ب stays)", () => {
    const items = [okFlashcard("السؤال الأول عن ال simplex"), okFlashcard("السؤال الأول عن ال simplex")];
    const result = dedupeBySimilarity(items, (i) => i.question);
    expect(result).toHaveLength(1);
  });
});

/* ════════════════ التحقق: بطاقات ════════════════ */

describe("التحقق من البطاقات", () => {
  it("يقبل مصفوفة صالحة", () => {
    const result = validateFlashcards([okFlashcard("سؤال")]);
    expect(result).toHaveLength(1);
  });

  it("يقبل الكائن الملفوف { flashcards: [...] }", () => {
    // الموديلات البصرية بترجّع الشكل ده، ورفضه كان هيضيّع أسئلة سليمة.
    expect(validateFlashcards({ flashcards: [okFlashcard("س")] })).toHaveLength(1);
  });

  it("يرفض كائن بالحقل الخطأ (ما بنخمّنش المسار)", () => {
    expect(() => validateFlashcards({ items: [] })).toThrow();
  });

  it("يرفض سؤال فاضي", () => {
    expect(() => validateFlashcards([{ question: "", answer: "إجابة" }])).toThrow();
  });

  it("يرفض حقل مش متوقع", () => {
    expect(() =>
      validateFlashcards([{ question: "سؤال", answer: "إجابة", confidence: 0.9 }]),
    ).toThrow();
  });
});
/* ════════════════ التحقق: MCQ ════════════════ */

describe("التحقق من MCQ — صرامة كاملة", () => {
  it("يقبل سؤال صحيح", () => {
    expect(MCQ_OPTIONS_COUNT).toBe(4);
    expect(validateMcqs([okMcq("سؤال")])).toHaveLength(1);
  });

  it("يرفض أقل من 4 اختيارات", () => {
    expect(() =>
      validateMcqs([{ question: "س", options: ["أ", "ب"], correctAnswer: 0, explanation: "ل" }]),
    ).toThrow();
  });

  it("يرفض أكتر من 4 اختيارات", () => {
    expect(() =>
      validateMcqs([
        { question: "س", options: ["أ", "ب", "ج", "د", "هـ"], correctAnswer: 0, explanation: "ل" },
      ]),
    ).toThrow();
  });

  it("correctAnswer لازم يكون 0..3", () => {
    // ⚠️ الفهرس بره المدى = تخزين سؤال مستحيل يتقيّم.
    expect(() => validateMcqs([okMcq("س", 4)])).toThrow();
    expect(() => validateMcqs([okMcq("س", -1)])).toThrow();
    expect(() => validateMcqs([okMcq("س", 3)])).not.toThrow();
  });

  it("correctAnswer لازم يكون عدد صحيح مش عشري ولا نص", () => {
    expect(() => validateMcqs([okMcq("س", 1.5)])).toThrow();
    expect(() =>
      validateMcqs([
        { question: "س", options: ["أ", "ب", "ج", "د"], correctAnswer: "1", explanation: "ل" },
      ]),
    ).toThrow();
  });

  it("يرفض اختيارات مكررة (سؤال غامض)", () => {
    // ⚠️ تكرار = إجابتين صح ظاهرياً.
    expect(() =>
      validateMcqs([
        { question: "س", options: ["نفس", "نفس", "ج", "د"], correctAnswer: 0, explanation: "ل" },
      ]),
    ).toThrow();
  });

  it("يرفض خيار فاضي", () => {
    expect(() =>
      validateMcqs([
        { question: "س", options: ["أ", "", "ج", "د"], correctAnswer: 0, explanation: "ل" },
      ]),
    ).toThrow();
  });

  it("يرفض شرح فاضي", () => {
    expect(() =>
      validateMcqs([
        { question: "س", options: ["أ", "ب", "ج", "د"], correctAnswer: 0, explanation: "" },
      ]),
    ).toThrow();
  });
});

/* ════════════════ التوليد ════════════════ */

function deps(runTask: GenerateDeps["runTask"], chunk = noChunk): GenerateDeps {
  return { runTask, chunk, chunkChars: 12_000 };
}

describe("generateStudyContent", () => {
  it("يرجّع العدد المطلوب من البطاقات", async () => {
    const cards = Array.from({ length: 10 }, (_, i) => okFlashcard(`بطاقة رقم ${i}`));
    const result = await generateStudyContent({
      kind: "flashcards",
      transcript: "نص المحاضرة",
      count: 10,
      deps: deps(mockTask([JSON.stringify({ flashcards: cards })])),
    });

    expect(result.items).toHaveLength(10);
    expect(result.aiCalls).toBe(1);
  });

  it("يرفض مخرجات الموديل الغلط — مافيش حفظ", async () => {
    // ⚠️ الأهم: موديل رجّع 3 اختيارات بس. المحتوى ده مستحيل يتقيّم،
    //    فلازم يبقى رفض صريح مش «نصحّح» أو نحفظه ناقص.
    await expect(
      generateStudyContent({
        kind: "mcq",
        transcript: "نص",
        count: 5,
        deps: deps(
          mockTask([
            JSON.stringify({
              mcqs: [{ question: "س", options: ["أ", "ب", "ج"], correctAnswer: 0, explanation: "ل" }],
            }),
          ]),
        ),
      }),
    ).rejects.toBeInstanceOf(StudyContentError);
  });

  it("النص الفاضي بيرجّع خطأ 422", async () => {
    await expect(
      generateStudyContent({
        kind: "flashcards",
        transcript: "",
        count: 10,
        deps: deps(mockTask(['{"flashcards":[]}'])),
      }),
    ).rejects.toMatchObject({ code: "EMPTY_TRANSCRIPT", status: 422 });
  });

  it("فشل قطعة في النص الطويل = فشل كامل (مافيش partial)", async () => {
    // ⚠️ مافيش partial: نص مذاكرة ناقصة أسوأ من رسالة فشل فيها زر إعادة.
    const twoChunks = (t: string) => [t.slice(0, 10), t.slice(10)];
    await expect(
      generateStudyContent({
        kind: "flashcards",
        transcript: "نص طويل كفاية للتقسيم",
        count: 10,
        deps: deps(
          mockTask(['{"flashcards":[{"question":"س1","answer":"ج1"}]}', "مش JSON خالص"]),
          twoChunks,
        ),
      }),
    ).rejects.toBeInstanceOf(StudyContentError);
  });

  it("النص الطويل: بيندعي الموديل لكل قطعة وبيجمّع", async () => {
    const twoChunks = (t: string) => [t.slice(0, 20), t.slice(20)];
    const result = await generateStudyContent({
      kind: "flashcards",
      transcript: "نص طويل كفاية للتقسيم على قطعتين",
      count: 10,
      deps: deps(
        mockTask([
          JSON.stringify({ flashcards: [okFlashcard("سؤال أول عن simplex")] }),
          JSON.stringify({ flashcards: [okFlashcard("سؤال ثاني عن duality")] }),
        ]),
        twoChunks,
      ),
    });

    expect(result.aiCalls).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it("بيشيل التكرار من كتل متعددة", async () => {
    const twoChunks = (t: string) => [t.slice(0, 10), t.slice(10)];
    const result = await generateStudyContent({
      kind: "flashcards",
      transcript: "نص طويل",
      count: 10,
      deps: deps(
        mockTask([
          JSON.stringify({ flashcards: [okFlashcard("ما هو الـ simplex؟")] }),
          JSON.stringify({ flashcards: [okFlashcard("ماهو الـ simplex")] }),
        ]),
        twoChunks,
      ),
    });

    expect(result.items).toHaveLength(1);
  });
});

/* ════════════════ الحفظ ════════════════ */

describe("saveStudyContent — بيكتب العمود الصح بس", () => {
  function fakeSupabase(error: unknown = null) {
    // ⬇️ الباريامتر بيتسجّل في الـ mock عشان الاختبار يقرا منه.
    const update = vi.fn((payload: Record<string, unknown>) => {
      void payload;
      return {
        eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error })) })),
      };
    });
    return { supabase: { from: vi.fn(() => ({ update })) } as never, update };
  }

  it("flashcards بيكتب عمود flashcards", async () => {
    const { supabase, update } = fakeSupabase();
    await saveStudyContent({
      supabase,
      lectureId: "lec-1",
      userId: "user-1",
      kind: "flashcards",
      items: [okFlashcard("س")],
    });

    // ⚠️ الاختبار ده بيحرس إننا مش بنلمس أي عمود تاني.
    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0][0];
    expect(Object.keys(payload)).toEqual(["flashcards"]);
  });

  it("mcq بيكتب عمود mcqs", async () => {
    const { supabase, update } = fakeSupabase();
    await saveStudyContent({
      supabase,
      lectureId: "lec-1",
      userId: "user-1",
      kind: "mcq",
      items: [okMcq("س")],
    });

    const payload = update.mock.calls[0][0];
    expect(Object.keys(payload)).toEqual(["mcqs"]);
  });

  it("فشل الحفظ بيرمي 500 (مش نجاح كاذب)", async () => {
    const { supabase } = fakeSupabase({ code: "XX", message: "boom" });
    await expect(
      saveStudyContent({
        supabase,
        lectureId: "lec-1",
        userId: "user-1",
        kind: "flashcards",
        items: [okFlashcard("س")],
      }),
    ).rejects.toMatchObject({ code: "DB_WRITE_FAILED", status: 500 });
  });
});