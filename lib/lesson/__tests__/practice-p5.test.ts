import { describe, expect, it } from "vitest";
import { parseFlashcards, readFlashcards } from "@/lib/lesson/flashcards";
import { extractWeakQuestions, MAX_WEAK_POINTS, type QuizAttemptLite } from "@/lib/lesson/weaknesses";

/* ═════════════════ flashcards ═════════════════ */

describe("readFlashcards", () => {
  it("بيقرا الكروت الصالحة ويتجاهل التالف", () => {
    const stored = {
      flashcards: [
        { front: "إيه هي الإشارة؟", back: "دالة بتحمل معلومات." },
        { front: "", back: "ناقص" },
        { front: "كارت تاني", back: "إجابة" },
        "تالف",
      ],
    };
    const cards = readFlashcards(stored);
    expect(cards.length).toBe(2);
    expect(cards[0]).toEqual({ front: "إيه هي الإشارة؟", back: "دالة بتحمل معلومات." });
  });

  it("أشكال تالة ⇒ []", () => {
    expect(readFlashcards(null)).toEqual([]);
    expect(readFlashcards("نص")).toEqual([]);
    expect(readFlashcards({ flashcards: "مش مصفوفة" })).toEqual([]);
    expect(readFlashcards({})).toEqual([]);
  });
});

describe("parseFlashcards", () => {
  it("بيعمل parse لمصفوفة JSON وممكن تكون متغلفة بنص", () => {
    const raw = 'ده الرد:\n[{"front":"س1","back":"ج1"},{"front":"س2","back":"ج2"},{"front":"س3","back":"ج3"}]';
    const cards = parseFlashcards(raw);
    expect(cards?.length).toBe(3);
    expect(cards?.[0].front).toBe("س1");
  });

  it("أقل من الحد الأدنى (3) ⇒ null — مش بنقبل رد ناقص", () => {
    const raw = '[{"front":"س1","back":"ج1"},{"front":"س2","back":"ج2"}]';
    expect(parseFlashcards(raw)).toBeNull();
  });

  it("JSON مكسور ⇒ null", () => {
    expect(parseFlashcards("مش JSON خالص")).toBeNull();
    expect(parseFlashcards("[{broken]")).toBeNull();
  });
});

/* ═════════════════ weaknesses ═════════════════ */

const attempt = (
  answers: (number | null)[],
  questions: { question: string; options: string[]; correctIndex: number }[]
): QuizAttemptLite => ({
  questions,
  answers: answers.map((a) => a ?? -1),
});

describe("extractWeakQuestions", () => {
  const questions = [
    { question: "إيه تعريف الإشارة؟", options: ["أ", "ب", "ج", "د"], correctIndex: 0 },
    { question: "أنواع الإشارات؟", options: ["أ", "ب", "ج", "د"], correctIndex: 1 },
    { question: "إيه الفرق بين المتصل والمنفصل؟", options: ["أ", "ب", "ج", "د"], correctIndex: 2 },
  ];

  it("بيطلّع الأسئلة الغلط بس وبترتيب الأحدث الأول", () => {
    const attempts = [
      attempt([0, 0, 0], questions), // أحدث: غلط في 1 و2
      attempt([0, 1, 2], questions), // أقدم: كله صح
    ];
    const weak = extractWeakQuestions(attempts);
    expect(weak).toEqual(["أنواع الإشارات؟", "إيه الفرق بين المتصل والمنفصل؟"]);
  });

  it("بيمنع التكرار بين المحاولات ويحترم الحد الأقصى", () => {
    const attempts = [
      attempt([0, 0, 0], questions),
      attempt([0, 0, 0], questions),
      attempt([1, 1, 1], questions),
      attempt([2, 2, 2], questions),
    ];
    const weak = extractWeakQuestions(attempts);
    expect(weak.length).toBeLessThanOrEqual(MAX_WEAK_POINTS);
    expect(weak.filter((q) => q === "أنواع الإشارات؟").length).toBe(1);
  });

  it("محاولات فاضية/تالفة ⇒ []", () => {
    expect(extractWeakQuestions([])).toEqual([]);
    expect(extractWeakQuestions([{ questions: null, answers: null }])).toEqual([]);
    expect(
      extractWeakQuestions([{ questions: [{ question: "س", options: ["أ"], correctIndex: 0 }], answers: [0] }])
    ).toEqual([]);
  });
});
