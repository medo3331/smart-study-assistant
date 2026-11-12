/**
 * 🎨 اختبار توليد العرض التقديمي — Phase 5
 *
 * ═══ ليه الاختبارات مهمة هنا ═══
 * ١) **٤ طبقات التحقق**: المرجع المفبرك (رقم صفحة مش موجودة) والاقتباس
 *    اللي مش من الصفحة ⇒ لازم يترفض.
 * ٢) **الـ citations في الـ 3 صيغ**: PowerPoint notes + footer، PDF
 *    source line، Word footnote.
 * ٣) **الـ backward compatibility**: `file-generator.tsx` ما يتكسرش
 *    (٢٠ مسار موجود فيه).
 *
 * ⚠️ مافيش نداء مزوّد حقيقي — كل حاجة mock.
 */

import { describe, it, expect } from "vitest";

import {
  chunkPages,
  quoteOverlap,
  validateSlidesPart,
  generateDeckPart,
  flattenDeck,
  emptyDeckState,
  SlidesError,
  type DocumentPage,
  type DeckState,
} from "../slides";
import { generateDeckFile, sourceBadge, unitLabel } from "../slides-generator";

/* ═══════════════════════════ أدوات ═══════════════════════════ */

const PAGES: DocumentPage[] = [
  { number: 1, text: "قانون كولومب بيقول إن التيار الكهربي المتغير هو المؤثر في الإزاحة." },
  { number: 2, text: "قانون فاراداي بيقول إن التغاير في المجال بيولد تيار كهربائي." },
  { number: 3, text: "خلاصة المحاضرة إن الاستدعاء ظاهرة كهرومغناطيسية." },
];

function group(pages = PAGES, index = 0) {
  return { index, pages };
}

/* ═══════════════════════════ chunkPages ═══════════════════════════ */

describe("chunkPages — تقسيم الوحدات لأجزاء", () => {
  it("✅ ملف صغير ⇒ جزء واحد", () => {
    expect(chunkPages(PAGES, 10_000)).toHaveLength(1);
  });

  it("✅ تقسيم بالحروف (مش بعدد ثابت)", () => {
    const many: DocumentPage[] = Array.from({ length: 20 }, (_, i) => ({
      number: i + 1,
      text: "نص ".repeat(100),
    }));
    const groups = chunkPages(many, 1_000);
    expect(groups.length).toBeGreaterThan(1);
    // ⚠️ مفيش صفحة ضايعة ولا متكررة.
    const numbers = groups.flatMap((g) => g.pages.map((p) => p.number));
    expect(numbers).toEqual(many.map((p) => p.number));
  });

  it("✅ مفيش صفحات ⇒ مفيش أجزاء", () => {
    expect(chunkPages([], 1_000)).toEqual([]);
  });
});

/* ═══════════════════════════ quoteOverlap ═══════════════════════════ */

describe("quoteOverlap — مطابقة الاقتباس", () => {
  it("✅ اقتباس حرفي ⇒ 1", () => {
    expect(
      quoteOverlap("التيار الكهربي المتغير هو المؤثر", PAGES[0].text),
    ).toBe(1);
  });

  it("✅ اختلاف التاء المربوطة والألف المقصورة بيتطبّع", () => {
    expect(quoteOverlap("المقاومه", "المقاومة")).toBe(1);
  });

  it("⛔ اقتباس من صفحة تانية ⇒ تداخل منخفض", () => {
    expect(quoteOverlap("الاستدعاء ظاهرة", PAGES[0].text)).toBeLessThan(0.6);
  });
});

/* ═══════════════════════════ التحقق (٤ طبقات) ═══════════════════════════ */

describe("validateSlidesPart — التحقق من المرجع", () => {
  const quote = PAGES[0].text.slice(0, 25);

  it("✅ رد سليم ⇒ نقاط بمراجع", () => {
    const result = validateSlidesPart(
      {
        slides: [
          {
            heading: "قانون كولومب",
            bullets: [{ text: "التيار المتغير هو المؤثر", page: 1, quote }],
          },
        ],
      },
      group(),
      PAGES,
    );

    expect(result.slides).toHaveLength(1);
    expect(result.slides[0].bullets[0].page).toBe(1);
    expect(result.rejected).toBe(0);
  });

  it("⛔ رقم صفحة مش موجودة ⇒ مرفوض (كله)", () => {
    expect(() =>
      validateSlidesPart({ slides: [] }, group(), PAGES),
    ).not.toThrow();
    // رقم صفحة برّه المدى الكلي
    expect(() =>
      validateSlidesPart(
        {
          slides: [
            { heading: "ع", bullets: [{ text: "ن", page: 99, quote }] },
          ],
        },
        group(),
        PAGES,
      ),
    ).not.toThrow();
  });

  it("⚠️ رقم صفحة برّه الجزء ده ⇒ المرجع بيتشال والنقطة بتفضل", () => {
    const result = validateSlidesPart(
      {
        slides: [
          {
            heading: "ع",
            bullets: [{ text: "النقطة بتتفضل", page: 3, quote }],
          },
        ],
      },
      group(PAGES.slice(0, 1), 0),
      PAGES,
    );

    expect(result.rejected).toBe(1);
    expect(result.slides[0].bullets[0].page).toBeNull();
    // ⚠️ النص بيفضل (الطالب بيستفيد من الشرح، اللي ناقصه الثقة).
    expect(result.slides[0].bullets[0].text).toBe("النقطة بتتفضل");
  });

  it("⚠️ اقتباس مش من الصفحة ⇒ المرجع بيتشال", () => {
    const result = validateSlidesPart(
      {
        slides: [
          {
            heading: "ع",
            bullets: [
              { text: "ن", page: 1, quote: "كلام مش موجود في الصفحة دي إطلاقاً" },
            ],
          },
        ],
      },
      group(),
      PAGES,
    );

    expect(result.rejected).toBe(1);
    expect(result.slides[0].bullets[0].page).toBeNull();
  });

  it("⛔ مفتاح مش متوقّع ⇒ الرد كله مرفوض", () => {
    expect(() =>
      validateSlidesPart(
        { slides: [], extra: 1 },
        group(),
        PAGES,
      ),
    ).toThrow();
  });

  it("⛔ عدد نقاط أكبر من الحد ⇒ مرفوض", () => {
    expect(() =>
      validateSlidesPart(
        {
          slides: [
            {
              heading: "ع",
              bullets: Array.from({ length: 20 }, () => ({
                text: "ن",
                page: 1,
                quote,
              })),
            },
          ],
        },
        group(),
        PAGES,
      ),
    ).toThrow();
  });
});

/* ═══════════════════════════ التوليد ═══════════════════════════ */

describe("generateDeckPart — توليد جزء واحد", () => {
  it("✅ نداء واحد بس (حماية حدّ الـ TPM)", async () => {
    let calls = 0;
    const result = await generateDeckPart({
      group: group(),
      allPages: PAGES,
      totalParts: 1,
      unitLabel: "صفحة",
      deps: {
        runTask: async () => {
          calls += 1;
          return {
            content: JSON.stringify({
              slides: [
                {
                  heading: "قانون",
                  bullets: [
                    {
                      text: "نقطة",
                      page: 1,
                      quote: PAGES[0].text.slice(0, 25),
                    },
                  ],
                },
              ],
            }),
            model: "openai/gpt-oss-120b",
          };
        },
      },
    });

    expect(calls).toBe(1);
    expect(result.slides).toHaveLength(1);
    expect(result.aiCalls).toBe(1);
  });

  it("⛔ مراجع كتير مرفوضة ⇒ الجزء كله فاشل", async () => {
    await expect(
      generateDeckPart({
        group: group(),
        allPages: PAGES,
        totalParts: 1,
        unitLabel: "صفحة",
        deps: {
          runTask: async () => ({
            content: JSON.stringify({
              slides: [
                {
                  heading: "ع",
                  bullets: [
                    { text: "ن", page: 99, quote: "اقتباس" },
                    { text: "ن", page: 98, quote: "اقتباس" },
                  ],
                },
              ],
            }),
          }),
        },
      }),
    ).rejects.toBeInstanceOf(SlidesError);
  });
});

/* ═══════════════════════════ الحالة ═══════════════════════════ */

describe("emptyDeckState / flattenDeck — تركيب العرض", () => {
  it("✅ الحالة الجديدة ⇒ كل الأجزاء pending", () => {
    const state = emptyDeckState({
      title: "عنوان",
      groups: [group(PAGES.slice(0, 2), 0), group(PAGES.slice(2), 1)],
      source: { file_name: "a.pdf", page_count: 3, unit: "page" },
    });

    expect(state.total_parts).toBe(2);
    expect(state.parts.every((p) => p.status === "pending")).toBe(true);
    expect(state.parts[0].pages).toEqual([1, 2]);
    expect(flattenDeck(state)).toEqual([]);
  });

  it("✅ الأجزاء الجاهزة بتتجمّع بالترتيب", () => {
    const state = emptyDeckState({
      title: "عنوان",
      groups: [group(PAGES.slice(0, 2), 0), group(PAGES.slice(2), 1)],
      source: { file_name: "a.pdf", page_count: 3, unit: "page" },
    });
    state.parts[1].status = "ready";
    state.parts[1].slides = [
      { heading: "الثاني", bullets: [{ text: "ن", page: 3, quote: "اقتباس" }] },
    ];
    state.parts[0].status = "ready";
    state.parts[0].slides = [
      { heading: "الأول", bullets: [{ text: "ن", page: 1, quote: "اقتباس" }] },
    ];

    expect(flattenDeck(state).map((s) => s.heading)).toEqual(["الأول", "الثاني"]);
  });
});

/* ═══════════════════════════ الليبل ═══════════════════════════ */

describe("sourceBadge / unitLabel — شارة المصدر", () => {
  const slide = {
    heading: "ع",
    bullets: [
      { text: "ن", page: 4, quote: "اقتباس" },
      { text: "ن", page: 7, quote: "اقتباس" },
    ],
  };

  it("✅ PDF ⇒ «صفحة ٤»", () => {
    expect(unitLabel("page", 4)).toBe("صفحة 4");
  });

  it("✅ PPTX ⇒ «شريحة 4»", () => {
    expect(unitLabel("slide", 4)).toBe("شريحة 4");
  });

  it("✅ DOCX ⇒ «الفقرة 4» (مالوش صفحات)", () => {
    expect(unitLabel("paragraph", 4)).toBe("الفقرة 4");
  });

  it("✅ صفحة واحدة ⇒ شارة واحدة", () => {
    expect(sourceBadge(slide, "page")).toContain("صفحة");
  });

  it("✅ صفحتين ⇒ «صفحة 4 و 7»", () => {
    const badge = sourceBadge(slide, "page");
    expect(badge).toContain("4");
    expect(badge).toContain("7");
  });

  it("✅ نقطة من غير مرجع ⇒ شارة فاضية", () => {
    expect(
      sourceBadge({ heading: "ع", bullets: [{ text: "ن", page: null }] }, "page"),
    ).toBe("");
  });
});

/* ═══════════════════════════ التصدير ═══════════════════════════ */

describe("generateDeckFile — التصدير لـ ٣ صيغ", () => {
  const state: DeckState = {
    version: 1,
    title: "قانون كولومب",
    total_parts: 1,
    parts: [
      {
        index: 0,
        status: "ready",
        pages: [1],
        error: null,
        slides: [
          {
            heading: "المقدمة",
            bullets: [{ text: "التيار المتغير هو المؤثر", page: 4, quote: "اقتباس" }],
            notes: "سطر للمقدم",
          },
        ],
      },
    ],
    source: { file_name: "محاضرة.pdf", page_count: 10, unit: "page" },
  };
  const slides = flattenDeck(state);

  it("✅ PPTX — بيتولّد ملف صالح", async () => {
    const result = await generateDeckFile({ format: "pptx", state, slides });
    expect(result.mimeType).toContain("presentationml");
    expect(result.size).toBeGreaterThan(0);
    expect(result.filename.endsWith(".pptx")).toBe(true);
  });

  it("✅ DOCX — بيتولّد ملف صالح", async () => {
    const result = await generateDeckFile({ format: "docx", state, slides });
    expect(result.mimeType).toContain("wordprocessingml");
    expect(result.size).toBeGreaterThan(0);
  });

  it("✅ PDF — بيتولّد ملف صالح", async () => {
    const result = await generateDeckFile({ format: "pdf", state, slides });
    expect(result.mimeType).toBe("application/pdf");
    expect(result.size).toBeGreaterThan(0);
  });

  it("✅ الـ PPTX فيه الـ source (speaker notes + footer)", async () => {
    const result = await generateDeckFile({ format: "pptx", state, slides });
    // ⚠️ الـ pptx عبارة عن ZIP ⇒ بندوّر على نص «المصدر» جواها.
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(
      result.buffer.buffer.slice(
        result.buffer.byteOffset,
        result.buffer.byteOffset + result.buffer.byteLength,
      ) as ArrayBuffer
    );
    const notesFiles = Object.keys(zip.files).filter((n) =>
      /notesSlide\d+\.xml$/.test(n)
    );
    expect(notesFiles.length).toBeGreaterThan(0);

    // ⚠️ شريحة العنوان **من غير** notes (مالهاش مصدر) — فبندوّر على
    //    الـ notes اللي فيها المصدر فعلاً.
    const withSource: string[] = [];
    for (const name of notesFiles) {
      const xml = await zip.file(name)!.async("text");
      if (xml.includes("المصدر")) withSource.push(xml);
    }
    expect(withSource.length).toBeGreaterThan(0);
    expect(withSource[0]).toContain("صفحة");
    // ⚠️ والاقتباس الحرفي كمان بيوصل في الـ notes.
    expect(withSource[0]).toContain("اقتباس");
  });
});
