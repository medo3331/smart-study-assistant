/**
 * 🔬 اختبار PDF حقيقي — المرحلة 4-D
 *
 * ⚠️ **ليه الملف ده مهم:** الاختبارات السابقة كانت بتتأكد إن الـ buffer
 * بيبدأ بـ `%PDF-` وبس. ده كان **يكفي غلط**: Amiri كان بيكسر التوليد
 * بالكامل مع العربي الحقيقي، والاختبار عدّى لأن نص العينة كان قصير
 * أوي ومابفعش يقع في المسار المعطوب.
 *
 * الاختبار ده بيشغّل **نص محاضرة عربي واقعي** (عناوين + غامق + blockquote
 * + قوائم + كود + إنجليزي مختلط) — وهو بالظبط اللي كان بيفشل.
 *
 * ⚠️ الخطوط **محلية** في `public/fonts/` — فمافيش اعتماد على شبكة وقت
 * التشغيل، والاختبار بيشتغل في أي بيئة.
 */

import { describe, it, expect } from "vitest";

import { generateLecturePdf, ensureArabicFont } from "../lecture-document";

/** نص عربي واقعي فيه كل العناصر اللي بتتحوّل في المستند. */
const REALISTIC = [
  "## مقدمة في بحوث العمليات",
  "",
  "**بحوث العمليات** هي استخدام الأساليب الرياضية لاتخاذ قرارات أفضل.",
  "",
  "> 💡 ببساطة: بتحوّل المشكلة الحقيقي لصيغة رياضية تحل.",
  "",
  "- الخطوة الأولى: صياغة النموذج",
  "- الخطوة الثانية: حل النموذج",
  "",
  "### مصطلحات",
  "",
  "Decision Variables هي المتغيرات التي نحدد قيمتها، وتكون غير سالبة.",
  "",
  "```text",
  "maximize Z = 3x + 2y",
  "```",
].join("\n");

describe("generateLecturePdf — توليد حقيقي", () => {
  it("بيستخدم الخط المحلي Cairo (مش CDN)", async () => {
    // ⬇️ assertion صريح: لو رجع Helvetica معناها إن ملفات الخط مفقودة،
    // والعربي هيفضل مكسور. مافيش استقبال صامت.
    expect(await ensureArabicFont()).toBe("MagiclyCairo");
  }, 30000);

  it("بيولّد PDF كامل مع عربي واقعي (كان بيفشل قبل)", async () => {
    const result = await generateLecturePdf({
      title: "محاضرة بحوث العمليات",
      explanation: REALISTIC,
    });

    expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(result.buffer.length).toBeGreaterThan(5000);
    expect(result.mimeType).toBe("application/pdf");
    expect(result.filename.endsWith(".pdf")).toBe(true);
  }, 60000);

  it("الملف PDF صالح — فيه خطوط مدمجة ونهاية سليمة", async () => {
    const result = await generateLecturePdf({ title: "اختبار", explanation: REALISTIC });
    const raw = result.buffer.toString("latin1");

    expect(raw).toContain("%%EOF");
    // ⬇️ Cairo regular + bold لازم يبقوا مدمجين، وإلا العربي مش هيترسم.
    expect((raw.match(/\/FontFile2/g) ?? []).length).toBeGreaterThanOrEqual(2);
  }, 60000);

  it("بيشيل الإيموجي قبل الطباعة (خط Cairo مالوش إيموجي)", async () => {
    const withEmoji = await generateLecturePdf({
      title: "اختبار",
      explanation: "💡 نص مع إيموجي 🧠 و 🃏",
    });
    const withoutEmoji = await generateLecturePdf({
      title: "اختبار",
      explanation: "نص مع إيموجي و",
    });

    // ⬇️ لو الإيموجي اتشال صح، الملفين يبقوا بنفس الحجم تقريبًا.
    // لو رجع للمستند، الفرق هيفرق بوضوح (مربعات/محارف null).
    expect(Math.abs(withEmoji.buffer.length - withoutEmoji.buffer.length)).toBeLessThan(400);
  }, 60000);
});