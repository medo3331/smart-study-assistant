/**
 * 🎨 اختبار عرض مذكرة المحاضرة — Phase 4-A UI polish
 *
 * ═══ ليه الاختبارات source-based بدل DOM ═══
 * المشروع مافيش عنده testing-library ولا jsdom (vitest بـ
 * `environment: "node"`)، فمافيش طريقة render فعلية. بدل ما نضيف
 * اعتماديات جديدة لمهمة عرض، بنتحقق من **المصدر نفسه** — وده كافي
 * لأسئلة الأمان اللي إجاباتها «هل الكود ده فيه / مافيشوش».
 *
 * ⚠️ الاختبارات دي بتقرأ الملفات من القرص وقت التشغيل، فأي حد يضيف
 * `dangerouslySetInnerHTML` في العرض بيكسر الاختبار فوراً.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (relative: string) =>
  readFileSync(join(process.cwd(), relative), "utf8");

const CONTENT_SRC = read("components/lectures/LectureContent.tsx");
const NOTE_SRC = read("components/lectures/LectureNote.tsx");
const ACTIONS_SRC = read("components/lectures/LectureProcessActions.tsx");
const PAGE_SRC = read("app/lectures/page.tsx");

/**
 * ⚠️ شيل التعليقات قبل الفحص.
 *
 * سبب مهم: توثيق الملف نفسه بيذكر `dangerouslySetInnerHTML` و
 * `rehype-raw` **بالاسم** عشان يوثّق ليه مافيش استخدام ليهم. فلو فحصنا
 * المصدر الخام، الاختبار كان هيفشل على كلام التوثيق نفسه — وده اختبار
 * أعمى عن الحاجة.
 *
 * بعد التنضيف: لو حد كتب `dangerouslySetInnerHTML={...}` فعلاً، السطر
 * ده كود مش تعليق، فبيفضل مطابق والاختبار يقع — وده المطلوب.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const CODE = {
  LectureContent: stripComments(CONTENT_SRC),
  LectureNote: stripComments(NOTE_SRC),
  LectureProcessActions: stripComments(ACTIONS_SRC),
  lecturesPage: stripComments(PAGE_SRC),
} as const;

/* ═══════════════════════════ الأمان ═══════════════════════════ */

describe("أمان العرض — مافيش HTML خام", () => {
  it("⛔ مافيش dangerouslySetInnerHTML في أي ملف عرض", () => {
    // أهم اختبار في الملف: `dangerouslySetInnerHTML` مع محتوى مولّد
    // من الـ AI = ثغرة XSS مباشرة.
    for (const [name, code] of Object.entries(CODE)) {
      expect(code, `${name} فيه dangerouslySetInnerHTML`).not.toContain(
        "dangerouslySetInnerHTML",
      );
    }
  });

  it("⛔ مافيش rehype-raw (بيحوّل HTML لعناصر حقيقية)", () => {
    // `rehype-raw` هو اللي بيخلّي react-markdown ينفّذ HTML. من غيره
    // أي `<script>` بيتعامل كـ **نص** ويترسم حرفياً.
    for (const [name, code] of Object.entries(CODE)) {
      expect(code, `${name} فيه rehype-raw`).not.toMatch(/rehype-?raw/i);
    }
  });

  it("⛔ مافيش eval ولا innerHTML", () => {
    for (const [name, code] of Object.entries(CODE)) {
      expect(code, `${name} فيه eval`).not.toMatch(/\beval\s*\(/);
      expect(code, `${name} فيه innerHTML`).not.toContain("innerHTML");
    }
  });

  it("✅ بيستخدم react-markdown + remark-gfm (نفس مكتبات المشروع)", () => {
    // إعادة استخدام البنية الموجودة بدل إضافة مكتبة جديدة.
    expect(CODE.LectureContent).toContain("react-markdown");
    expect(CODE.LectureContent).toContain("remark-gfm");
  });

  it("✅ الروابط بتترفض إلا لو http/https/mailto", () => {
    // حماية من `javascript:alert(1)` جوه نص مولّد.
    expect(CODE.LectureContent).toMatch(/https\?:\|mailto:/);
    expect(CODE.LectureContent).toContain("isSafeHref");
  });

  it("✅ الروابط الخارجية فيها noopener", () => {
    // من غيرها الصفحة اللي بتفتح في تاب جديد تقدر توجّه النافذة الأصلية.
    expect(CODE.LectureContent).toContain("noopener");
  });

  it("✅ الصور بتترفض (رابط خارجي = تتبّع للطالب)", () => {
    expect(CODE.LectureContent).toMatch(/img:\s*\(/);
  });
});

/* ═══════════════════════ العناصر المدعومة ═══════════════════════ */

describe("العناصر اللي بيتعامل معاها العارض", () => {
  const cases: Array<[string, string]> = [
    ["عناوين", "h1:"],
    ["قوائم غير مرتبة", "ul:"],
    ["قوائم مرتبة", "ol:"],
    ["عنااصر القوائم", "li:"],
    ["غامق", "strong:"],
    ["مائل", "em:"],
    ["كال-أوت (ببساطة)", "blockquote:"],
    ["خط فاصل", "hr:"],
    ["كود", "code:"],
    ["بلوك كود", "pre:"],
    ["روابط", "a:"],
    ["جداول", "table:"],
  ];

  for (const [label, token] of cases) {
    it(`✅ ${label}`, () => {
      expect(CODE.LectureContent).toContain(token);
    });
  }
});


/* ═══════════════════════ RTL والقراءة ═══════════════════════ */

describe("RTL مختلط اللغة", () => {
  it("✅ الحاوية الأساسية RTL صراحة", () => {
    // مستقلة عن إعداد لغة الموقع: لو المستخدم حوّل الموقع لـ LTR،
    // المحتوى العربي لازم يفضل RTL.
    expect(CODE.LectureContent).toMatch(/dir="rtl"/);
  });

  it("✅ الكود LTR (المصطلحات التقنية ما تتقطعش)", () => {
    // `NP-hard` أو `O(n log n)` بيتقطعوا لو اتقروا RTL.
    const ltrCount = (CONTENT_SRC.match(/dir="ltr"/g) ?? []).length;
    expect(ltrCount).toBeGreaterThanOrEqual(2);
  });

  it("✅ عرض قراءة مريح للشرح (ch unit)", () => {
    // سطر عربي طويل بيبقى متعب لو اتمد على عرض الشاشة كله.
    expect(CODE.LectureContent).toContain("max-w-[68ch]");
  });

  it("✅ كلام الكود بيتكسّر (break-words) عشان مافيش overflow", () => {
    expect(CODE.LectureContent).toContain("break-words");
  });

  it("✅ بلوك الكود بيعمل سكرول أفقي مش يتمد", () => {
    expect(CODE.LectureContent).toMatch(/overflow-x-auto/);
  });
});

/* ═══════════ تمييز Summary عن Explanation ═══════════ */

describe("Summary وExplanation ليهم هوية بصرية مختلفة", () => {
  it("✅ النقطتين ليهم إعدادات عرض مختلفة", () => {
    expect(CODE.LectureContent).toMatch(/summary:\s*\{/);
    expect(CODE.LectureContent).toMatch(/explanation:\s*\{/);
    // كل واحد فيهم maxWidth مختلف — ده الفرق المحسوس على نص طويل.
    expect(CODE.LectureContent).toMatch(/max-w-\[68ch\]/);
  });

  it("✅ عناوين مختلفة فعلياً (مش نفس الكوبى)", () => {
    expect(CODE.LectureNote).toContain("ملخص المحاضرة");
    expect(CODE.LectureNote).toContain("شرح المحاضرة");
  });

  it("✅ كل قسم له هوية دلالية (aria-labelledby)", () => {
    expect(CODE.LectureNote).toContain("aria-labelledby");
    expect(CODE.LectureNote).toContain("<section");
  });

  it("✅ مافيش عناوين AI ثابتة متDupّسة جوه الـ Markdown", () => {
    // العناوين زي «📌 أهم الأفكار» لازم تيجي من ناتج الـ AI نفسه،
    // مش تكون مكتوبة في الكود.
    expect(CODE.LectureNote).not.toContain("أهم الأفكار");
    expect(CODE.LectureNote).not.toContain("مفاهيم مهمة");
  });
});

/* ═══════════════════════ البيانات ═══════════════════════ */

describe("البيانات — العرض بس، مافيش تعديل", () => {
  it("✅ مافيش كتابة على قاعدة البيانات في العرض", () => {
    for (const [name, src] of [
      ["LectureContent", CONTENT_SRC],
      ["LectureNote", NOTE_SRC],
      ["LectureProcessActions", ACTIONS_SRC],
    ] as const) {
      expect(src, `${name} فيه عملية كتابة`).not.toMatch(/\.update\(|\.insert\(|\.upsert\(/);
    }
  });

  it("✅ مافيش أي استدعاء API جديد في العرض", () => {
    // الـ endpoint اتضاف في Phase 4-A وخلاص. العرض بيستهلك النتيجة.
    for (const [name, src] of [
      ["LectureContent", CONTENT_SRC],
      ["LectureNote", NOTE_SRC],
    ] as const) {
      expect(src, `${name} فيه fetch`).not.toContain("fetch(");
    }
  });

  it("✅ التفريغ بيفضل نص خام (مش بيتلوّن بـ Markdown)", () => {
    // التفريغ نص كلام حرفي — تلميحه بيبوّبه. لازم يفضل <pre>.
    expect(CODE.lecturesPage).toContain("<pre");
    expect(CODE.lecturesPage).toContain("transcript_text");
  });

  it("✅ الصفحة بتعرض النتيجة عبر LectureNote", () => {
    expect(CODE.lecturesPage).toContain("LectureNote");
    expect(CODE.LectureProcessActions).toContain("LectureNote");
  });

  it("✅ نتيجة فاضية مابتكسرش الصفحة (conditional render)", () => {
    // `summary && ...` و `explanation && ...` — فاضي ببساطة ما يظهرش.
    expect(CODE.lecturesPage).toMatch(/lecture\.summary &&/);
    expect(CODE.lecturesPage).toMatch(/lecture\.explanation &&/);
  });
});
