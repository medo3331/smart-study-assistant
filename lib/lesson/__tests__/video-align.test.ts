import { describe, expect, it } from "vitest";
import { alignHeadingsToTranscript, ALIGN_THRESHOLD } from "@/lib/lesson/video-align";
import type { TimedSegment } from "@/lib/ai/lecture-intensive";

const segments: TimedSegment[] = [
  { index: 0, text: "إحنا النهارده هنتكلم عن التعريف الأساسي للإشارة.", start: 0, end: 10 },
  { index: 1, text: "الإشارة دالة بتحمل معلومات عن نظام معين.", start: 12, end: 25 },
  { index: 2, text: "دلوقتي ندخل على أنواع الإشارات: متصلة ومنفصلة.", start: 30, end: 45 },
  { index: 3, text: "الأمثلة العملية على الإشارة المنفصلة كتير في المعالجة الرقمية.", start: 50, end: 70 },
];

describe("alignHeadingsToTranscript", () => {
  it("بيقرب العنوان للمقطع اللي فيه توكناته بعد التطبيع العربي", () => {
    const result = alignHeadingsToTranscript(["أنواع الإشارات"], segments);
    // «الإشارات» بتتطابق (التطبيع بيوحّد الهمزات/التاء المربوطة) — أول أفضل مقطع
    expect(result["أنواع الإشارات"]).toBe(30);
  });

  it("بيدّي توقيت null بصدق لعنوان ملوش لازمة في التفريغ", () => {
    const result = alignHeadingsToTranscript(["التحويلات لابلاس المتقدمة"], segments);
    expect(result["التحويلات لابلاس المتقدمة"]).toBeNull();
  });

  it("التطبيع العربي: الهمزة والتاء المربوطة مش بتفرق", () => {
    const result = alignHeadingsToTranscript(["أنواع الإشارة"], segments);
    // «أنواع» في مقطع 2 و«الإشاره» في مقطع 1 — تعادل 0.5/0.5 ⇒ الأول بيكسب (start 12).
    expect(result["أنواع الإشارة"]).toBe(12);
  });

  it("مفيش مقاطع ⇒ كل القيم null (مش crash)", () => {
    const result = alignHeadingsToTranscript(["التعريف", "الأنواع"], []);
    expect(result).toEqual({ "التعريف": null, "الأنواع": null });
  });

  it("عناوين فاضية ⇒ null", () => {
    expect(alignHeadingsToTranscript(["", "  "], segments)[""]).toBeNull();
  });

  it("العتبة 0.5 — عنوان بتوكن واحد موجود بيكسب، مش موجود بيرجع null", () => {
    expect(ALIGN_THRESHOLD).toBe(0.5);
    const one = alignHeadingsToTranscript(["التعريف"], segments);
    expect(one["التعريف"]).toBe(0);
    const missing = alignHeadingsToTranscript(["مصفوفة"], segments);
    expect(missing["مصفوفة"]).toBeNull();
  });

  it("بيختار **أفضل** تطابق مش أول تطابق جزئي", () => {
    const result = alignHeadingsToTranscript(["الأمثلة العملية على الإشارة المنفصلة"], segments);
    expect(result["الأمثلة العملية على الإشارة المنفصلة"]).toBe(50);
  });
});
