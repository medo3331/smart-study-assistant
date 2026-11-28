import { describe, expect, it } from "vitest";
import {
  isStoredQuestionArray,
  pickBankRow,
  type BankCandidateRow,
} from "@/lib/worship-quiz-bank";

/* ==========================================================================
   اختبارات منطق بنك الأسئلة (db/123) — الاختيار النقي + التحقق من jsonb
   ========================================================================== */

const NOW = Date.parse("2026-01-15T12:00:00Z");

function row(
  id: string,
  usedCount: number,
  lastUsedMinutesAgo: number | null,
): BankCandidateRow {
  return {
    id,
    used_count: usedCount,
    last_used_at:
      lastUsedMinutesAgo === null
        ? null
        : new Date(NOW - lastUsedMinutesAgo * 60_000).toISOString(),
  };
}

describe("pickBankRow", () => {
  it("بيرجّع null لو البنك فاضي", () => {
    expect(pickBankRow([], [])).toBeNull();
  });

  it("بيختار الصف اللي مالوش last_used_at (nulls first)", () => {
    const rows = [
      row("a", 0, 10),
      row("b", 0, null), // عمرك ما اتصف — الأولوية الأولى
      row("c", 0, 5),
    ];
    expect(pickBankRow(rows, [], () => 0)?.id).toBe("b");
  });

  it("بيختار الأقل استخداماً لو الكل متساوي في last_used_at", () => {
    const rows = [
      row("a", 3, 10),
      row("b", 1, 10),
      row("c", 2, 10),
    ];
    expect(pickBankRow(rows, [], () => 0)?.id).toBe("b");
  });

  it("بيفضّل صف مش في آخر جلسات المستخدم حتى لو أقدم استخداماً", () => {
    const rows = [
      row("recent", 0, 100), // الأقدم استخداماً لكن في آخر جلسات المستخدم
      row("fresh", 5, 1), // مستخدم حديثاً لكن مش من جلسات المستخدم
    ];
    expect(pickBankRow(rows, ["recent"], () => 0)?.id).toBe("fresh");
  });

  it("بيرجع لأي صف لو كل المرشّحين في آخر جلسات المستخدم", () => {
    const rows = [row("a", 2, 5), row("b", 1, 30)];
    // كلهم recent → نرجع للترتيب الطبيعي (الأقل استخداماً/الأقدم)
    expect(pickBankRow(rows, ["a", "b"], () => 0)?.id).toBe("b");
  });

  it("بيحلّ التعادل عشوائياً — rng حتمي بيحدد الصف بين المتعادلين", () => {
    const rows = [row("a", 1, 10), row("b", 1, 10), row("c", 1, 10)];
    // rng=0 → أول متعادل، rng قريب من 1 → آخر متعادل
    expect(pickBankRow(rows, [], () => 0)?.id).toBe("a");
    expect(pickBankRow(rows, [], () => 0.99)?.id).toBe("c");
  });

  it("rng=0.5 بين المتعادلين بيختار من النص — دايماً من المتعادلين مش غيرهم", () => {
    const rows = [
      row("worst", 9, 0), // الأحدث استخداماً والأكثر — خارج المتعادلين
      row("a", 1, 10),
      row("b", 1, 10),
    ];
    const picked = pickBankRow(rows, [], () => 0.5);
    expect(["a", "b"]).toContain(picked?.id);
  });

  it("بتاريخ غير صالح في last_used_at بيتعامل معاه كأنه null (الأولوية)", () => {
    const rows: BankCandidateRow[] = [
      { id: "bad", used_count: 0, last_used_at: "not-a-date" },
      row("a", 0, 3),
    ];
    expect(pickBankRow(rows, [], () => 0)?.id).toBe("bad");
  });
});

describe("isStoredQuestionArray", () => {
  const validQuestion = {
    question: "كم عدد أركان الإسلام؟",
    options: ["٤", "٥", "٦", "٧"],
    correct: 1,
    source: "صحيح البخاري، حديث ٨",
    explanation: "أركان الإسلام خمسة.",
  };

  function bank(overrides: Partial<Record<string, unknown>> = {}, count = 10) {
    return Array.from({ length: count }, () => ({ ...validQuestion, ...overrides }));
  }

  it("بيقبل مصفوفة ١٠ أسئلة صالحة", () => {
    expect(isStoredQuestionArray(bank())).toBe(true);
  });

  it("بيرفض مصفوفة أقل أو أكثر من ١٠", () => {
    expect(isStoredQuestionArray(bank({}, 9))).toBe(false);
    expect(isStoredQuestionArray(bank({}, 11))).toBe(false);
  });

  it("بيرفض correct خارج ٠..٣ أو غير صحيح", () => {
    expect(isStoredQuestionArray(bank({ correct: 4 }))).toBe(false);
    expect(isStoredQuestionArray(bank({ correct: -1 }))).toBe(false);
    expect(isStoredQuestionArray(bank({ correct: 1.5 }))).toBe(false);
    expect(isStoredQuestionArray(bank({ correct: "1" }))).toBe(false);
  });

  it("بيرفض خيارات ناقصة أو فاضية", () => {
    expect(isStoredQuestionArray(bank({ options: ["أ", "ب", "ج"] }))).toBe(false);
    expect(isStoredQuestionArray(bank({ options: ["أ", "ب", "ج", "  "] }))).toBe(false);
  });

  it("بيرفض سؤال أو مصدر فاضي، وقيمة غير مصفوفة أصلاً", () => {
    expect(isStoredQuestionArray(bank({ question: "  " }))).toBe(false);
    expect(isStoredQuestionArray(bank({ source: "" }))).toBe(false);
    expect(isStoredQuestionArray(null)).toBe(false);
    expect(isStoredQuestionArray({})).toBe(false);
  });
});
