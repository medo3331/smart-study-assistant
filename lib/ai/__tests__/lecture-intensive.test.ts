/**
 * 🧠 اختبار الشرح المكثف — Phase 5
 *
 * ═══ ليه الاختبارات على الدوال الصافية ═══
 * أخطر حاجة في الميزة دي: **مرجع مفبرك**. لو الـ Mوديل قدر يGuyّد
 * «المعلومة دي في الدقيقة 12:30» والمعلومة مش موجودة، الطالب بيخسر
 * كل الثقة في الميزة.
 *
 * فالفحوصات هنا كلها على **حدود الـ citation**:
 *   ١) `seg` لازم يكون رقم حقيقي جوه القطعة.
 *   ٢) الاقتباس لازم يكون فعلاً من نص المقطع المشار إليه.
 *   ٣) التوقيت لازم يكون من البيانات بتاعتنا — **مش** من الموديل.
 *
 * ⚠️ مافيش نداء مزوّد حقيقي في أي اختبار هنا — كل حاجة صافية.
 */

import { describe, it, expect } from "vitest";

import {
  extractSegments,
  chunkSegments,
  planParts,
  quoteOverlap,
  reconcileExplanation,
  validateIntensiveOutput,
  parseJsonPayload,
  generateIntensivePart,
} from "../lecture-intensive";
import { QUOTE_OVERLAP_THRESHOLD } from "../lecture-intensive";
import type { TimedSegment } from "../lecture-intensive-prompts";

/* ═══════════════════════════ أدوات ═══════════════════════════ */

/** مقاطع تجريبية بترتيب زمني. */
function makeSegments(count: number, textLength = 60): TimedSegment[] {
  const segments: TimedSegment[] = [];
  for (let i = 0; i < count; i += 1) {
    segments.push({
      index: i,
      start: i * 10,
      end: i * 10 + 9,
      text: `النقطة رقم ${i} من المحاضرة ${"كلمة ".repeat(Math.max(1, textLength / 6))}`,
    });
  }
  return segments;
}

/** map كما بيتبني جوّه الكود. */
function indexMap(segments: TimedSegment[]) {
  return new Map(segments.map((segment) => [segment.index, segment]));
}

/* ═══════════════════════════ extractSegments ═══════════════════════════ */

describe("extractSegments — استخراج المقاطع من transcript_data", () => {
  it("بيقرا المقاطع وبيمنحها فهرس متسلسل", () => {
    const segments = extractSegments({
      segments: [
        { text: "أول", start: 0, end: 5, speaker: null },
        { text: "ثاني", start: 5, end: 9, speaker: null },
      ],
    });

    expect(segments).toHaveLength(2);
    expect(segments[0].index).toBe(0);
    expect(segments[1].index).toBe(1);
    expect(segments[1].start).toBe(5);
  });

  it("⚠️ مقطع بلا وقت بيتخطّى — أحسن نخسر مرجع من إنcitations تبقى مكسورة", () => {
    const segments = extractSegments({
      segments: [
        { text: "بوقت", start: 0, end: 5 },
        { text: "من غير وقت", end: 5 },
      ],
    });

    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("بوقت");
  });

  it("بيتجاهل القطع الفاضية والم-broken", () => {
    const segments = extractSegments({
      segments: [
        { text: "   ", start: 0, end: 1 },
        { text: "سليم", start: 1, end: 2 },
        null,
        42,
      ],
    });

    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("سليم");
  });

  it("بيانات مش ماشكلها بتدي مصفوفة فاضية (مش crash)", () => {
    expect(extractSegments(null)).toEqual([]);
    expect(extractSegments(undefined)).toEqual([]);
    expect(extractSegments({})).toEqual([]);
    expect(extractSegments({ segments: "مش مصفوفة" })).toEqual([]);
  });
});

/* ═══════════════════════════ chunkSegments ═══════════════════════════ */

describe("chunkSegments — تقسيم المقاطع", () => {
  it("محاضرة قصيرة بتبقى قطعة واحدة", () => {
    const segments = makeSegments(3, 20);
    const chunks = chunkSegments(segments, 6_000);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(3);
  });

  it("⚠️ الفهرس العام بيتحفظ — الأرقام مستقرة عبر القطع", () => {
    // ده اللي بيخلّي التحقق ينفع: تشيك set-membership على مدى القطعة.
    const segments = makeSegments(40, 50);
    const chunks = chunkSegments(segments, 400);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      for (const segment of chunk) {
        expect(segment.index).toBe(segments[segment.index].index);
      }
    }
    // ومفيش مقطع ضاع ولا اتكرر.
    const all = chunks.flat().map((s) => s.index);
    expect(all).toEqual(segments.map((s) => s.index));
  });

  it("بيقسّم على حدود المقاطع — مقطع واحد ما بينقسمش", () => {
    const segments = makeSegments(20, 100);
    const chunks = chunkSegments(segments, 250);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      for (const segment of chunk) {
        expect(segment.text.length).toBeLessThan(250);
      }
    }
  });

  it("مفيش مقاطع ⇒ مفيش قطع", () => {
    expect(chunkSegments([], 1_000)).toEqual([]);
  });
});

/* ═══════════════════════════ quoteOverlap ═══════════════════════════ */

describe("quoteOverlap — مطابقة الاقتباس بالمقطع", () => {
  it("اقتباس حرفي ⇒ تداخل 1", () => {
    const segment = "قانون كولومب بيقول إن التيار الكهربي المتغير هو المؤثر";
    expect(quoteOverlap("التيار الكهربي المتغير هو المؤثر", segment)).toBe(1);
  });

  it("اقتباس من مقطع تاني ⇒ تداخل منخفض", () => {
    const segment = "قانون كولومب بيقول إن التيار الكهربي المتغير هو المؤثر";
    const overlap = quoteOverlap("المقاومة الكهربية بتزيد مع تردد الموجة", segment);
    expect(overlap).toBeLessThan(QUOTE_OVERLAP_THRESHOLD);
  });

  it("⚠️ اختلافات الحروف العربية بتتطبّع (أ/إ/آ، ة، ى)", () => {
    const segment = "المقاومة الكهربية بتزيد مع التردد";
    // «المقاومه الكهربيه» بعد التطبيع = نفس الكلمات بالظبط.
    expect(quoteOverlap("المقاومه الكهربيه", segment)).toBe(1);
    // والألف المقصورة: «المستوى» = «المستوي» بعد التطبيع.
    expect(quoteOverlap("المستوى", "المستوي النهائي")).toBe(1);
  });

  it("اقتباس فاضي ⇒ تداخل 0 (مش crash)", () => {
    expect(quoteOverlap("", "أي نص")).toBe(0);
    expect(quoteOverlap("   ", "أي نص")).toBe(0);
  });
});

/* ═══════════════════════════ validateIntensiveOutput ═══════════════════════════ */

describe("validateIntensiveOutput — التحقق من رد الموديل", () => {
  const segments = makeSegments(10, 40);
  const map = indexMap(segments);
  const chunk = segments.slice(0, 5);

  const validOutput = {
    sections: [
      {
        heading: "قانون كولومب",
        claims: [
          {
            text: "التيار المتغير هو المؤثر",
            seg: 2,
            quote: segments[2].text.slice(0, 30),
          },
        ],
      },
    ],
  };

  it("✅ رد سليم ⇒ جملة بمرجع متحقَّق منه", () => {
    const result = validateIntensiveOutput(validOutput, chunk, map, 100);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].claims).toHaveLength(1);
    expect(result.sections[0].claims[0].seg).toBe(2);
    // ⚠️ التوقيت جاي من البيانات بتاعنا — مش من رد الموديل.
    expect(result.sections[0].claims[0].start).toBe(segments[2].start);
    expect(result.rejected).toBe(0);
  });

  it("⚠️ seg برّه القطعة ⇒ المرجع بيتشال والجملة بتفضل", () => {
    const result = validateIntensiveOutput(
      {
        sections: [
          {
            heading: "عنوان",
            claims: [{ text: "جملة", seg: 9, quote: segments[9].text.slice(0, 20) }],
          },
        ],
      },
      chunk,
      map,
      100,
    );

    expect(result.rejected).toBe(1);
    expect(result.sections[0].claims[0].seg).toBeNull();
    expect(result.sections[0].claims[0].text).toBe("جملة");
  });

  it("⚠️ اقتباس من مقطع تاني ⇒ المرجع بيتشال", () => {
    const result = validateIntensiveOutput(
      {
        sections: [
          {
            heading: "عنوان",
            claims: [
              {
                text: "جملة",
                seg: 1,
                quote: "كلام مش موجود في المقطع خالص أبداً",
              },
            ],
          },
        ],
      },
      chunk,
      map,
      100,
    );

    expect(result.rejected).toBe(1);
    expect(result.sections[0].claims[0].seg).toBeNull();
  });

  it("⚠️ مفتاح مش متوقّع ⇒ الرد كله مرفوض (مش جزئي)", () => {
    expect(() =>
      validateIntensiveOutput(
        { sections: [], extra: 1 },
        chunk,
        map,
        100,
      ),
    ).toThrow();
  });

  it("⚠️ sections مش مصفوفة ⇒ مرفوض", () => {
    expect(() =>
      validateIntensiveOutput({ sections: "نص" }, chunk, map, 100),
    ).toThrow();
  });

  it("⚠️ نص طويل أوي ⇒ مرفوض (حماية من الردود الفوضوية)", () => {
    expect(() =>
      validateIntensiveOutput(
        {
          sections: [
            {
              heading: "عنوان",
              claims: [{ text: "ط".repeat(2_000), seg: 1, quote: "x" }],
            },
          ],
        },
        chunk,
        map,
        100,
      ),
    ).toThrow();
  });
});

/* ═══════════════════════════ parseJsonPayload ═══════════════════════════ */

describe("parseJsonPayload — استخراج JSON من رد الموديل", () => {
  it("JSON نضيف بيتقرا", () => {
    expect(parseJsonPayload('{"sections":[]}')).toEqual({ sections: [] });
  });

  it("✅ رد داخل ```json fence بيتقرا (الموديل أحياناً بيعمل كده)", () => {
    expect(parseJsonPayload('```json\n{"sections":[]}\n```')).toEqual({ sections: [] });
  });

  it("✅ رد فيه كلام قبل JSON بيتقرا (المستخرِج المتسامح بيلاقي الكائن)", () => {
    expect(parseJsonPayload('ده شرح: {"sections":[]}')).toEqual({ sections: [] });
  });

  it("⚠️ مافيش JSON خالص ⇒ مرفوض", () => {
    expect(() => parseJsonPayload("مفيش JSON هنا")).toThrow();
  });

  it("⚠️ JSON مش صالح ⇒ مرفوض", () => {
    expect(() => parseJsonPayload('{"sections":')).toThrow();
  });
});

/* ═══════════════════════ planParts ═══════════════════════ */

describe("planParts — خطة الأجزاء", () => {
  it("محاضرة قصيرة ⇒ جزء واحد", () => {
    const plan = planParts(makeSegments(3, 20), 6_000);
    expect(plan).toHaveLength(1);
    expect(plan[0].index).toBe(0);
  });

  it("⚠️ التوقيتات بتاعت كل جزء محسوبة", () => {
    const segments = makeSegments(20, 100);
    const plan = planParts(segments, 250);
    expect(plan.length).toBeGreaterThan(1);
    for (const p of plan) {
      expect(p.start).toBe(p.segments[0].start);
      expect(p.end).toBe(p.segments[p.segments.length - 1].end);
    }
  });

  it("⚠️ أرقام المقاطع العامة محفوظة (مفيش إعادة ترقيم)", () => {
    const segments = makeSegments(40, 50);
    const plan = planParts(segments, 400);
    const all = plan.flatMap((p) => p.segments.map((s) => s.index));
    expect(all).toEqual(segments.map((s) => s.index));
  });

  it("⚠️ مقطع أكبر من الميزانية بيتكسّر — ونفس الـ anchor محفوظ", () => {
    // ⚠️ ده كان السبب في رفض المزوّد (413): مقطع واحد ١٣٢٩٦ حرف كان
    //    بيطلع part بـ ٤٢٠٠ حرف ⇒ مدخل ~٤٢٠٠ توكن ⇒ «Request too large».
    const big: TimedSegment = {
      index: 7,
      start: 100,
      end: 200,
      text: Array.from({ length: 400 }, (_, i) => `كلمة${i}`).join(" "),
    };
    const plan = planParts([big], 400);

    expect(plan.length).toBeGreaterThan(1);
    for (const p of plan) {
      // ⚠️ مفيش piece واحدة عدّت الميزانية.
      expect(p.segments[0].text.length).toBeLessThanOrEqual(400);
      // ⚠️ وكل القطع محتفظة بنفس الـ anchor (المقطع الأصلي واحد).
      expect(p.segments[0].index).toBe(7);
    }
  });
});

/* ═══════════════════════ reconcileExplanation ═══════════════════════ */

describe("reconcileExplanation — مطابقة الحالة المحفوظة مع الخطة", () => {
  const segments = makeSegments(6, 40);
  const plan = planParts(segments, 6_000);

  it("حالة فاضية ⇒ كل الأجزاء pending", () => {
    const state = reconcileExplanation(null, plan);
    expect(state.version).toBe(2);
    expect(state.parts).toHaveLength(plan.length);
    expect(state.parts.every((p) => p.status === "pending")).toBe(true);
  });

  it("⚠️ الشكل القديم (v1) ⇒ نبدأ من جديد", () => {
    const state = reconcileExplanation({ version: 1, sections: [] }, plan);
    expect(state.parts.every((p) => p.status === "pending")).toBe(true);
  });

  it("⚠️ لو مقاطع الجزء اتغيّرت ⇒ الجزء بيرجع pending (مراجعه القديمة بقت لغيره)", () => {
    const stored = {
      version: 2,
      generated_at: "2026-01-01T00:00:00.000Z",
      model: "m",
      total_parts: plan.length,
      parts: plan.map((p) => ({
        index: p.index,
        status: "ready" as const,
        start: p.start,
        end: p.end,
        segments: [999], // ← أرقام مقاطع غلط
        generated_at: "2026-01-01T00:00:00.000Z",
        error: null,
        sections: [],
      })),
    };
    const state = reconcileExplanation(stored, plan);
    expect(state.parts.every((p) => p.status === "pending")).toBe(true);
  });

  it("✅ جزء سليم بيفضل ready", () => {
    const stored = {
      version: 2,
      generated_at: "2026-01-01T00:00:00.000Z",
      model: "m",
      total_parts: plan.length,
      parts: plan.map((p) => ({
        index: p.index,
        status: "ready" as const,
        start: p.start,
        end: p.end,
        segments: p.segments.map((s) => s.index),
        generated_at: "2026-01-01T00:00:00.000Z",
        error: null,
        sections: [],
      })),
    };
    const state = reconcileExplanation(stored, plan);
    expect(state.parts.every((p) => p.status === "ready")).toBe(true);
  });
});

/* ═══════════════════════ generateIntensivePart ═══════════════════════ */

describe("generateIntensivePart — توليد جزء واحد", () => {
  const segments = makeSegments(6, 40);
  const plan = planParts(segments, 6_000);

  it("✅ الموديل بيرجّع JSON صالح ⇒ أقسام بمراجع", async () => {
    const calls: string[] = [];
    const result = await generateIntensivePart({
      part: plan[0],
      segments,
      durationSeconds: 60,
      totalParts: plan.length,
      deps: {
        chunkChars: 6_000,
        runTask: async (_task: "chat", input) => {
          calls.push(String(input.messages[1].content));
          return {
            content: JSON.stringify({
              sections: [
                {
                  heading: "عنوان",
                  claims: [
                    { text: "جملة", seg: 0, quote: segments[0].text.slice(0, 25) },
                  ],
                },
              ],
            }),
            model: "openai/gpt-oss-120b",
          };
        },
      },
    });

    expect(result.sections).toHaveLength(1);
    expect(result.model).toBe("openai/gpt-oss-120b");
    expect(result.aiCalls).toBe(1);
    // ⚠️ البرومبت لازم يبعت رقم المقطع (S<n>) — ده الـ anchor.
    expect(calls[0]).toContain("[S0]");
  });

  it("⚠️ ⚡ نداء واحد بس — وده اللي بيحمي من حدّ الـ TPM", async () => {
    let callCount = 0;
    await generateIntensivePart({
      part: plan[0],
      segments,
      durationSeconds: 60,
      totalParts: plan.length,
      deps: {
        chunkChars: 6_000,
        runTask: async () => {
          callCount += 1;
          return {
            content: JSON.stringify({
              sections: [
                { heading: "ع", claims: [{ text: "ج", seg: 0, quote: segments[0].text.slice(0, 25) }] },
              ],
            }),
            model: "m",
          };
        },
      },
    });
    expect(callCount).toBe(1);
  });

  it("⚠️ الجزء كله مرفوض ⇒ الخطأ بيقول كود واضح", async () => {
    await expect(
      generateIntensivePart({
        part: plan[0],
        segments,
        durationSeconds: 60,
        totalParts: plan.length,
        deps: {
          chunkChars: 6_000,
          runTask: async () => ({ content: JSON.stringify({ sections: [] }) }),
        },
      }),
    ).rejects.toMatchObject({ code: "PART_INVALID" });
  });
});
