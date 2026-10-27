/**
 * 🧠 اختبار معالجة المحاضرات — Phase 4-A
 *
 * ═══ ليه الاختبارات على الدوال الصافية ═══
 * أخطر حاجتين في المرحلة دي:
 *   ١) **مفيش قص صامت**: تفريغ محاضرة طويلة لازم يتقسّم ويتجمّع، ومفيش
 *      جزء يضيع. الاختبار بيفحص إن إعادة الدمج بترجّع النص كله.
 *   ٢) **مفيش اختراع**: البرومبت لازم يطلب صراحةً إن الموديل يلتزم
 *      بالتفريغ. الاختبار بيقرأ البرومبت نفسه ويرفض لو السطر ده اتشال.
 *
 * ⚠️ **مافيش نداء مزوّد حقيقي في أي اختبار هنا** — كل حاجة صافية.
 */

import { describe, it, expect } from "vitest";

import {
  buildMessages,
  chunkTranscript,
  DEFAULT_CHUNK_CHARS,
} from "../lecture-prompts";

/* ═══════════════════════════ chunkTranscript ═══════════════════════════ */

describe("chunkTranscript — تقسيم التفريغ الطويل", () => {
  it("نص قصير بيرجع قطعة واحدة من غير تقطيع", () => {
    const text = "محاضرة قصيرة على العمليات الخطية.";
    const chunks = chunkTranscript(text, 10_000);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("⚠️ مفيش نص بيتضيع — الدمج بيرجّع النص كله", () => {
    // أهم اختبار في الملف: لو أي جزء اتقصّ أو اتنسي، الطالب هيفقد
    // محتوى من المحاضرة من غير أي indication.
    const paragraph = "النقطة الأولى في محاضرة Operations Research. ";
    const text = paragraph.repeat(120);
    const chunks = chunkTranscript(text, 1_000);

    expect(chunks.length).toBeGreaterThan(1);

    // الدمج بتقسيم على مسافة عشان الفواصل بين القطع ماتأثرش على
    // مقارنة المحتوى — اللي بيتأكد منه هو إن **مفيش كلمة ضايعة**.
    const rejoined = chunks.join("\n").replace(/\s+/g, " ").trim();
    const original = text.replace(/\s+/g, " ").trim();
    expect(rejoined.split(" ").filter(Boolean).length).toBe(
      original.split(" ").filter(Boolean).length,
    );
  });

  it("بيحترم الحد الأقصى للحجم في كل القطع", () => {
    const text = "جملة تجريبية طويلة كفاية. ".repeat(400);
    const max = 800;
    const chunks = chunkTranscript(text, max);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // مسموح للقطعة تتجاوز الحد بحدود جملة (أحسن من قطع جملة)، بس
      // المفروض تفضل قريبة منه مش مفتوحة.
      expect(chunk.length).toBeLessThanOrEqual(max * 1.5);
    }
  });

  it("بيقسّم عند حدود الجمل مش في نصها", () => {
    // القطع في نص جملة بيبوّخ المعنى وبيخلّي الموديل يكمّل آخر جملة
    // ناقصة من أول القطعة اللي بعده.
    const sentences: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      sentences.push(`النقطة رقم ${i} من المحاضرة explained clearly.`);
    }
    const chunks = chunkTranscript(sentences.join(" "), 400);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // كل قطعة لازم تبتدأ ببداية جملة كاملة.
      expect(chunk.trim()).toMatch(/^النقطة/);
    }
  });

  it("نص فاضي بيرجّع مصفوفة فاضية (مش قطعة فيها لا شيء)", () => {
    expect(chunkTranscript("", 1_000)).toEqual([]);
    expect(chunkTranscript("   \n  ", 1_000)).toEqual([]);
  });

  it("محاضرة متوسطة مش بتتقسّم بالحد الافتراضي", () => {
    const text = "سطر من التفريغ. ".repeat(500);
    expect(DEFAULT_CHUNK_CHARS).toBeGreaterThanOrEqual(12_000);
    expect(chunkTranscript(text, DEFAULT_CHUNK_CHARS)).toHaveLength(1);
  });
});

/* ═══════════════════════════ buildMessages ═══════════════════════════ */

describe("buildMessages — بنية الرسائل", () => {
  it("بيرسل رسالة نظام ورسالة مستخدم بالترتيب", () => {
    const messages = buildMessages({ kind: "summary", content: "نص المحاضرة" });

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("نص المحاضرة");
  });

  it("⚠️ برومبت الملخص بيطلب صراحةً إن الموديل ما يخترعش", () => {
    // السطر ده هو الفيصل بين ملخص مفيد وملخص أنيق وكاذب. لو اتشال من
    // البرومبت، الاختبار ده بيقع وميقفنا.
    const [system] = buildMessages({ kind: "summary", content: "x" });

    expect(system.content).toContain("ممنوع تماماً تخترع");
    expect(system.content).toContain("مش مذكور في المحاضرة");
  });

  it("⚠️ برومبت الشرح بيطلب صراحةً إن الموديل ما يخترعش", () => {
    const [system] = buildMessages({ kind: "explanation", content: "x" });

    expect(system.content).toContain("ممنوع تماماً تخترع");
  });

  it("الملخص بيمنع تكرار الجمل — مش اختصار أعمى", () => {
    const [system] = buildMessages({ kind: "summary", content: "x" });

    expect(system.content).toContain("تكرار الجمل");
    // والمفروض يطلب Markdown عشان الناتج يبقى مقروء في /lectures.
    expect(system.content).toContain("Markdown");
  });

  it("الشرح بيقول للموديل إنه مش يكرّر الملخص", () => {
    const [system] = buildMessages({ kind: "explanation", content: "x" });

    // ده الفرق الجوهري بين النوعين: ملخص ≠ شرح.
    expect(system.content).toContain("ما تكررش الملخص");
    expect(system.content).toContain("خطوة بخطوة");
  });

  it("برومبت الدمج بيقول إن المدخلات أجزاء من محاضرة واحدة", () => {
    const [system] = buildMessages({ kind: "synthesis", content: "ملاحظات" });

    expect(system.content).toContain("جزئية");
  });

  it("بيوضّح للموديل إن ده جزء من محاضرة طويلة", () => {
    // من غير التوضيح ده، الموديل ممكن يفتكر إن كل جزء محاضرة مستقلة
    // ويعامله لوحده — فبيطلع ناتج مجزّأ.
    const messages = buildMessages({
      kind: "summary",
      content: "جزء تاني",
      partLabel: "الثاني من ٣",
    });

    expect(messages[1].content).toContain("الجزء الثاني من ٣");
    expect(messages[1].content).toContain("محاضرة طويلة");
  });

  it("مفيش تسمية لما المحاضرة قطعة واحدة", () => {
    const messages = buildMessages({ kind: "summary", content: "نص" });

    expect(messages[1].content).toContain("هذا تفريغ محاضرة");
    expect(messages[1].content).not.toContain("من محاضرة طويلة");
  });

  it("مافيش أي مفتاح API في أي رسالة", () => {
    // حارس ضد تسريب إعدادات بالغلط جوه نصوص بتتبعت لمزوّد.
    for (const kind of ["summary", "explanation", "synthesis"] as const) {
      for (const message of buildMessages({ kind, content: "نص" })) {
        expect(message.content).not.toMatch(/sk-|sb_secret_|API_KEY/);
      }
    }
  });
});

