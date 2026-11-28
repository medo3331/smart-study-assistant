import { describe, expect, it } from "vitest";
import {
  citedModeKey,
  citedToText,
  citedVersionsKey,
  collectCitedVersions,
  deriveSummaryFromCited,
  readCitedMode,
  readCitedVersions,
} from "@/lib/lesson/cited-derive";
import { buildCitedMessages, CITED_MODE_HINTS, type LessonCitedExplanation } from "@/lib/lesson/citations";

/* ═════════════════ citedToText ═════════════════ */

describe("citedToText", () => {
  it("بيطلّع markdown بالعناوين والنقاط", () => {
    const cited: LessonCitedExplanation = {
      sections: [
        { heading: "التعريف", claims: [{ text: "الإشارة دالة للزمن.", seg: 0, start: 0, quote: "" }] },
        { heading: "الأنواع", claims: [{ text: "أنواع: متصل ومنفصل.", seg: 1, start: 5, quote: "" }] },
      ],
    };
    const text = citedToText(cited);
    expect(text).toContain("## التعريف");
    expect(text).toContain("- الإشارة دالة للزمن.");
    expect(text).toContain("## الأنواع");
    expect(text.split("\n").length).toBe(4);
  });

  it("بيتجاهل الأقسام الفاضية والأشكال التالفة", () => {
    expect(citedToText({ sections: [] })).toBe("");
    expect(citedToText({ sections: [{ heading: "فاضي", claims: [] }] })).toBe("");
    // @ts-expect-error شكل تالف عمدًا
    expect(citedToText(null)).toBe("");
  });
});

/* ═════════════════ deriveSummaryFromCited ═════════════════ */

describe("deriveSummaryFromCited", () => {
  const cited: LessonCitedExplanation = {
    sections: [
      {
        heading: "التعريف",
        claims: [
          { text: "النقطة الأولى.", seg: 0, start: 0, quote: "" },
          { text: "النقطة التانية.", seg: 1, start: 4, quote: "" },
          { text: "", seg: null, start: null, quote: "" },
        ],
      },
      { heading: "", claims: [{ text: "نقطة بدون عنوان.", seg: 2, start: 9, quote: "" }] },
    ],
  };

  it("derivation نصي — bullets من كل قسم بدون AI", () => {
    const summary = deriveSummaryFromCited(cited);
    expect(summary).toContain("## التعريف");
    expect(summary).toContain("- النقطة الأولى.");
    expect(summary).toContain("- النقطة التانية.");
    expect(summary).toContain("- نقطة بدون عنوان.");
    // الجملة الفاضية متداخلتش
    expect(deriveSummaryFromCited(cited).split("\n")).not.toContain("- ");
  });

  it("بيكاب النقاط لكل قسم (مراجعة سريعة مش نسخة كاملة)", () => {
    const many: LessonCitedExplanation = {
      sections: [
        {
          heading: "قسم",
          claims: Array.from({ length: 10 }, (_, i) => ({ text: `نقطة ${i}`, seg: i, start: i, quote: "" })),
        },
      ],
    };
    const summary = deriveSummaryFromCited(many);
    expect(summary.match(/^- /gm)?.length).toBe(4); // MAX_SUMMARY_BULLETS_PER_SECTION
  });

  it("deterministic — نفس المدخل نفس النص", () => {
    expect(deriveSummaryFromCited(cited)).toBe(deriveSummaryFromCited(cited));
  });
});

/* ═════════════════ readCitedMode / versions ═════════════════ */

describe("readCitedMode + versions", () => {
  const citedA: LessonCitedExplanation = {
    sections: [{ heading: "أ", claims: [{ text: "نص أ", seg: 0, start: 0, quote: "" }] }],
  };
  const citedB: LessonCitedExplanation = {
    sections: [{ heading: "ب", claims: [{ text: "نص ب", seg: 1, start: 2, quote: "" }] }],
  };

  it("بيقرا الكائن المخزَّن تحت المفتاح الصح ويتجاهل التالف", () => {
    const stored = { [citedModeKey("general")]: citedA };
    expect(readCitedMode(stored, "general")).toEqual(citedA);
    expect(readCitedMode(stored, "detailed")).toBeNull();
    expect(readCitedMode(null, "general")).toBeNull();
    expect(readCitedMode({ [citedModeKey("general")]: "نص مش كائن" }, "general")).toBeNull();
  });

  it("الإصدارات: القديم بيتنفد للقائمة مش بيتمسح", () => {
    const stored = {
      [citedModeKey("detailed")]: citedB,
      [citedVersionsKey("detailed")]: [{ cited: citedA, generatedAt: "2026-01-01T00:00:00Z" }, "تالف"],
    };
    expect(readCitedMode(stored, "detailed")).toEqual(citedB);
    const versions = readCitedVersions(stored, "detailed");
    expect(versions.length).toBe(1);
    expect(versions[0].cited).toEqual(citedA);
    expect(collectCitedVersions(stored).detailed?.length).toBe(1);
    expect(collectCitedVersions({})["general"]).toBeUndefined();
  });
});

/* ═════════════════ buildCitedMessages — modeHint ═════════════════ */

describe("buildCitedMessages modeHint", () => {
  const segments = [
    { index: 0, text: "إحنا النهارده هنتكلم عن الإشارات.", start: 0, end: 10 },
    { index: 1, text: "الإشارة دالة تحمل معلومات.", start: 12, end: 20 },
  ];

  it("من غير modeHint — نفس السلوك القديم", () => {
    const messages = buildCitedMessages({ topic: "الإشارات", subject: "Signals", segments });
    expect(messages.length).toBe(2);
    expect(messages[0].content).not.toContain("شرح عام");
  });

  it("مع modeHint — التلميح جوه رسالة المستخدم وقواعد المرجع زي ما هي", () => {
    const messages = buildCitedMessages({
      topic: "الإشارات",
      subject: "Signals",
      segments,
      modeHint: CITED_MODE_HINTS.general,
    });
    expect(messages.length).toBe(2);
    expect(messages[1].content).toContain("شرح عام");
    expect(messages[1].content).toContain("[S0] إحنا النهارده هنتكلم عن الإشارات.");
    // نظام المراجع ثابت — التلميح بيغيّر الوضع مش عقود التحقق.
    expect(messages[0].content).toContain("seg");
  });

  it("لوضع detailed — التلميح بيطلب عمق وأقسام أكثر", () => {
    const messages = buildCitedMessages({
      topic: "الإشارات",
      subject: "Signals",
      segments,
      modeHint: CITED_MODE_HINTS.detailed,
    });
    expect(messages[1].content).toContain("شرح تفصيلي");
  });
});
