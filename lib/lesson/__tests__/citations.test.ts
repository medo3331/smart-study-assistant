/**
 * 🔗 Citations للدرس — تغطية التحقق (lib/lesson/citations.ts)
 * ═══════════════════════════════════════════════════════════
 *
 * القاعدة الذهبية: **الرقم مش ممكن يتخترع**. الموديل يطلّع seg + quote،
 * والدالة تثبت إن الاقتباس من المقطع نفسه (0.6) قبل ما تسمح بالحفظ.
 */
import { describe, it, expect } from "vitest";
import {
  parseCitedExplanation,
  capSegmentsForPrompt,
  MAX_PROMPT_SEGMENTS,
  type TimedSegment,
} from "@/lib/lesson/citations";

const SEGMENTS: TimedSegment[] = [
  { index: 0, start: 0, end: 4, text: "أهلاً بيكوا في محاضرة الشبكات اليوم هنتكلم عن الطبقات" },
  { index: 1, start: 4, end: 9, text: "طبقة النقل مسؤولة عن تقطيع البيانات لحزم" },
  { index: 2, start: 9, end: 15, text: "كل حزمة ليها عنوان بيحدد المصدر والوجهة" },
  { index: 3, start: 15, end: 22, text: "الراوتر بيقرأ العنوان ويقرر مسار الحزمة" },
  { index: 4, start: 22, end: 30, text: "الطبقة الخامسة بتعمل اتصال بين التطبيقات" },
];

function makeSegments(count: number): TimedSegment[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    start: i * 5,
    end: i * 5 + 5,
    text: `نص المقطع رقم ${i} عن موضوع الدرس`,
  }));
}

describe("parseCitedExplanation", () => {
  it("يقبل ردًا سليمًا ويحسب التوقيت من المقطع (مش من الموديل)", () => {
    const raw = JSON.stringify({
      summary: "ملخص قصير",
      sections: [
        {
          heading: "مقدمة",
          claims: [
            { text: "الشبكات بتشتغل بطبقات", seg: 0, quote: "محاضرة الشبكات اليوم هنتكلم عن الطبقات" },
            { text: "الحزم بتيجي بعناوين", seg: 2, quote: "كل حزمة ليها عنوان بيحدد المصدر والوجهة" },
          ],
        },
      ],
    });

    const result = parseCitedExplanation(raw, SEGMENTS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // التوقيت جاي من segments[seg].start — مش من أي رقم قاله الموديل.
    expect(result.cited.sections[0].claims[0].start).toBe(0);
    expect(result.cited.sections[0].claims[1].start).toBe(9);
    expect(result.summary).toBe("ملخص قصير");
    expect(result.stats).toEqual({ totalClaims: 2, citedClaims: 2 });
  });

  it("المرجع الغلط (اقتباس مش من المقطع) → الجملة تفضل بدون مرجع مش مرمية", () => {
    const raw = JSON.stringify({
      sections: [
        {
          heading: "قسم",
          claims: [
            // الاقتباس ده من مقطع تاني = BAD_QUOTE
            { text: "جملة صحيحة المضمون", seg: 1, quote: "أهلاً بيكوا في محاضرة الشبكات" },
          ],
        },
      ],
    });

    const result = parseCitedExplanation(raw, SEGMENTS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const claim = result.cited.sections[0].claims[0];
    expect(claim.text).toBe("جملة صحيحة المضمون");
    expect(claim.seg).toBeNull();
    expect(claim.start).toBeNull();
    expect(result.stats.citedClaims).toBe(0);
  });

  it("seg مش موجود في التفريغ → مرفوض", () => {
    const raw = JSON.stringify({
      sections: [
        { heading: "قسم", claims: [{ text: "جملة", seg: 999, quote: "نص أي حاجة" }] },
      ],
    });

    const result = parseCitedExplanation(raw, SEGMENTS);
    // المرجع الوحيد مرفوض → نسبة الرفض 100% بس تحت حد الأقل (1 جملة) فيتم قبول
    // الجملة بدون مرجع.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cited.sections[0].claims[0].seg).toBeNull();
  });

  it("أكتر من 30% مراجع مرفوضة → الرد كله يترفض (BAD_HONESTY)", () => {
    // 6 جمل، 4 منهم مراجع غلط = 66% > 30%
    const claims = [
      { text: "جملة سليمة 1", seg: 0, quote: "محاضرة الشبكات اليوم هنتكلم عن الطبقات" },
      { text: "جملة غلط 1", seg: 3, quote: "كلام من عنتر" },
      { text: "جملة غلط 2", seg: 4, quote: "كلام من عثر" },
      { text: "جملة غلط 3", seg: 2, quote: "أهلاً بيكوا في محاضرة" },
      { text: "جملة غلط 4", seg: 1, quote: "الراوتر بيقرر" },
      { text: "جملة سليمة 2", seg: 2, quote: "كل حزمة ليها عنوان بيحدد المصدر والوجهة" },
    ];
    const raw = JSON.stringify({ sections: [{ heading: "قسم", claims }] });

    const result = parseCitedExplanation(raw, SEGMENTS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("BAD_HONESTY");
  });

  it("رد مش JSON → BAD_SHAPE", () => {
    const result = parseCitedExplanation("أنا مش هديك JSON خالص", SEGMENTS);
    expect(result).toEqual({ ok: false, reason: "BAD_SHAPE" });
  });

  it("sections فاضية → EMPTY", () => {
    const result = parseCitedExplanation(JSON.stringify({ summary: "s", sections: [] }), SEGMENTS);
    expect(result).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("يقبل JSON داخل كود markdown ( fences )", () => {
    const raw = "```json\n" + JSON.stringify({
      sections: [{ heading: "أ", claims: [{ text: "ج", seg: 1, quote: "طبقة النقل مسؤولة عن تقطيع البيانات لحزم" }] }],
    }) + "\n```";

    const result = parseCitedExplanation(raw, SEGMENTS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cited.sections[0].claims[0].seg).toBe(1);
  });
});

describe("capSegmentsForPrompt", () => {
  it("بيقتطع عند الحد الأقصى ويحافظ على الأرقام الأصلية", () => {
    const capped = capSegmentsForPrompt(makeSegments(500));
    expect(capped.length).toBeLessThanOrEqual(MAX_PROMPT_SEGMENTS);
    // الأرقام لسه أرقام التفريغ الأصلية (مهم للـ set-membership).
    expect(capped[0].index).toBe(0);
    expect(capped[capped.length - 1].index).toBe(capped.length - 1);
  });

  it("التفريغ الصغير بيعدّي كما هو", () => {
    expect(capSegmentsForPrompt(SEGMENTS)).toHaveLength(SEGMENTS.length);
  });
});
