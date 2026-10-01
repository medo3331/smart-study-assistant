/**
 * 🔤 اختبار الخط العربي للـ PDF — المصدر المشترك
 *
 * ⚠️ **ليه الملف ده مهم:** كان فيه **نسختين** من كود تحميل الخط، والاتنين
 * بخط Amiri. لما Amiri اتغيّر لـ Cairo في مسار تصدير المحاضرات، النسخة
 * التانية في `lib/ai/file-generator.tsx` فضلت مكسورة — ونفس العطل بيقع
 * معاها: `Cannot read properties of null (reading 'xCoordinate')`.
 *
 * الاختبارات دي بتقفل النسختين على نفس المصدر، عشان الإصلاح ده ما
 * يترجعش تاني.
 */

import { describe, it, expect } from "vitest";

import { generateFile } from "@/lib/ai/file-generator";
import { ensurePdfFont, PDF_FONT_FAMILY } from "../pdf-font";

/** نص عربي واقعي — الطول مهم، العينة القصيرة مابتمسش مسار الخطأ. */
const REALISTIC_AR =
  "بتحوّل المشكلة الحقيقي لصيغة رياضية تحل. بحوث العمليات هي استخدام " +
  "الأساليب الرياضية لاتخاذ قرارات أفضل من خلال نماذج مبنية على البيانات.";

describe("خط PDF العربي — مصدر واحد", () => {
  it("بيسجّل Cairo المحلي (مش Amiri ولا CDN)", async () => {
    // ⬇️ لو رجع أي اسم تاني، معناها إن التسجيل رجع يفشل بصمت والعربي
    // هيطلع مقطوع. لازم الاختبار يقع في الحالة دي.
    expect(await ensurePdfFont()).toBe(PDF_FONT_FAMILY);
  }, 30000);

  it("تصدير المحاضرات بيشتغل بعربي واقعي", async () => {
    const { generateLecturePdf } = await import("../lecture-document");
    const result = await generateLecturePdf({
      title: "محاضرة بحوث العمليات",
      explanation: REALISTIC_AR,
    });

    expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(result.buffer.length).toBeGreaterThan(3000);
  }, 60000);

  it("⚠️ مصدّر الملفات القديم كان مكسور — لازم يبقى شغّال", async () => {
    // نفس العطل، نفس السبب. `key_points` هو المفتاح الصح — البنية تقرأ
    // `key_points` مش `keyPoints`، فلو استخدمت latter بيطلع PDF فاضي
    // من غير ما يقع أي خطأ وده اختبار مضلّل.
    const result = await generateFile({
      type: "pdf",
      content: "summary",
      title: "محاضرة بحوث العمليات",
      data: { key_points: [REALISTIC_AR, REALISTIC_AR] },
    } as never);

    expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(result.buffer.length).toBeGreaterThan(3000);
  }, 60000);

  it("تصدير Word من المسار القديم لسه شغّال", async () => {
    const result = await generateFile({
      type: "docx",
      content: "report",
      title: "تقرير",
      data: { summary: REALISTIC_AR },
    } as never);

    // ⬇️ توقيع ZIP = OOXML صالح.
    expect(result.buffer.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  }, 60000);
});