/* ==========================================================================
   🧱 بنية النص الخام — دوال صافية بلا أي deps
   ═════════════════════════════════════════════════════════════════════════════

   **سيرفر بس. نصوص بصلصال.** مافيش `fetch` ولا `process.env` ولا استيراد ثقيل
   (`unpdf`/`mammoth`/jszip) — الملف ده قابل للاختبار الصافي وبيتستورد من أي مكان
   من غير ما يشيل معاه أي dependency.

   ════ ليه الملف ده موجود أصلاً ════
   الاستخراج (`lib/extract-text.ts`) بيرجّع **نص خام**: سطور PDF مكسورة بصرياً،
   وعناوين DOCX بتضيع مع `extractRawText`. القرار إن الـ «فهم البنية» يحصل
   **وقت التقسيم** مش وقت الاستخراج، لأن:
   • الاستخراج عنده invariant موثّق (سلوك `extractTextFromFile` مابتتغيّرش) و4
     مستهلكين معتمدين عليه.
   • التقسيم (`chunkTranscript`) هو المدخل الوحيد للموديل — تحسين البنية هنا
     بيوصل لكل أنواع الملفات مرة واحدة (PDF وDOCX وصوت وتفريغ).

   ⚠️ كل الدوال هنا **صافية وبدون حالة** — نفس المدخل = نفس المخرج دايماً.
   ═════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ **لعيون الكشف عن العناوين — heuristics محافظة عمداً.**
 *
 * false negative (عنوان ما ااتكشفتش) = أقل ضرر: الجزء بيروح في قطعة عادية.
 * false positive (سطر عادي ااتعامل كعنوان) = قطع غلط في نص سليم — أسوأ.
 *
 * علشان كده القواعد بترجّح الكفة: السطر لازم يكون قصير + مفيهوش نهاية جملة،
 * غير كده مايتكشفش حتى لو فيه كلمة مفتاحية.
 */

/** أقصى طول لسطر يُقبل كعنوان — العناوين الحقيقية قصيرة، والجمل لأ. */
const MAX_HEADING_LINE_CHARS = 60;

// ⚠️ `\b` مبيشتغلش مع العربي (الحروف العربية مش `\w`) — فبنستخدم
// negative lookahead: الكلمة المفتاحية مايبقاش بعدها حرف تاني («الفصلية»
// مش عنوان). للاتيني `\b` سليم.

/**
 * كلمة مفتاحية + **رقم أو ترتيب** — نمط العناوين الحقيقي في الملازم
 * («الفصل الأول»، «المحاضرة 5»، «الباب الثالث»).
 *
 * ⚠️ ده أهم سطر ضد الـ false positive: جملة عادية بتبدأ بـ «الفصل اللي
 * فاتت…» مش هتطابق — لازم ترتيب صريح بعد الكلمة.
 */
const HEADING_KEYWORD_ORDINAL =
  /^(?:الفصل|الباب|الجزء|الوحدة|المحور|القسم|الموضوع|المحاضرة|المادة)\s+(?:\d+|[\u0660-\u0669]+|الأول|الأولى|الثاني|الثانية|الثالث|الثالثة|الرابع|الرابعة|الخامس|الخامسة|السادس|السادسة|السابع|السابعة|الثامن|الثامنة|التاسع|التاسعة|العاشر|العاشرة|الأخير|الأخيرة)(?![\u0621-\u064A])/;

/** أقسام ختامية/افتتاحية ثابتة اسمها كافي — مالهاش ترتيب في الغالب. */
const HEADING_KEYWORD_BARE =
  /^(?:المراجع|الملخص|التمهيد|المقدمة|الخاتمة)(?![\u0621-\u064A])/;

/** الكلمات المفتاحية اللاتينية — `\b` سليم هنا. */
const HEADING_KEYWORD_LATIN = /^(?:chapter|section|unit|part|lecture|topic)\b/i;

/** علامات نهاية الجملة — سطر بينتهي بواحدة منها مش عنوان. */
const SENTENCE_END = /[.!؟?،؛;:]$/;

/** بادئة عنصر قائمة — سطر القائمة مش عنوان حتى لو قصير. */
const LIST_START = /^([-*•·]|\d+[.)]|[أ-ي][-)])\s+/;

/**
 * هل السطر ده عنوان قسم؟
 *
 * ⚠️ **القواعد بالترتيب** (أول قاعدة بتطابق بتحسم):
 * 1. Markdown heading (`#` …) → عنوان دايماً — إشارة صريحة من المصدر.
 * 2. سطر أطول من الحد أو بينتهي بعلامة جملة أو بيبدأ بقائمة → مش عنوان.
 * 3. بداية كلمة مفتاحية (الفصل/Chapter/…) أو ALL-CAPS لاتيني قصير → عنوان.
 */
export function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return false;

  if (/^#{1,6}\s+/.test(trimmed)) return true;

  if (
    trimmed.length > MAX_HEADING_LINE_CHARS ||
    SENTENCE_END.test(trimmed) ||
    LIST_START.test(trimmed)
  ) {
    return false;
  }

  if (
    HEADING_KEYWORD_ORDINAL.test(trimmed) ||
    HEADING_KEYWORD_BARE.test(trimmed) ||
    HEADING_KEYWORD_LATIN.test(trimmed)
  ) {
    return true;
  }

  // ALL-CAPS لاتيني قصير («CARDIOVASCULAR SYSTEM») — نمط شائع في الملازم
  // الإنجليزية. لازم حروف كبيرة فعلية عشان الأرقام وحدها مايتكشفوش.
  const letters = trimmed.replace(/[^a-zA-Z]/g, "");
  if (
    letters.length >= 3 &&
    letters === letters.toUpperCase() &&
    trimmed.length <= MAX_HEADING_LINE_CHARS &&
    !/[a-z]/.test(trimmed)
  ) {
    return true;
  }

  return false;
}

/**
 * بيقسّم النص لـ «أقسام» عند سطور العناوين — **والعنوان بيفضل أول سطر في
 * قطعته** (العنوان من غير جسمه مالوش قيمة للموديل).
 *
 * النص قبل أول عنوان بيكوّن قسم لوحده (المقدمة غالباً)، والأقسام الفاضية
 * بتترمي. لو مافيش عناوين خالص → قسم واحد = النص كله.
 */
export function splitHeadingSections(text: string): string[] {
  const lines = text.split("\n");
  const sections: string[] = [];
  let current: string[] = [];

  const flush = () => {
    const joined = current.join("\n").trim();
    if (joined !== "") sections.push(joined);
    current = [];
  };

  for (const line of lines) {
    if (current.length > 0 && isHeadingLine(line)) {
      flush();
    }
    current.push(line);
  }
  flush();

  return sections;
}

/**
 * بيفكّ «الكسر البصري» في سطور الـ PDF: الملازم المستخرجة بتيجي سطر لكل سطر
 * طباعة، فالجملة الواحدة بتبقى مقسّمة على 3 سطور — وده بيخرّب التقسيم عند
 * «حدود الجمل» (الحدود بتبقى عند كل سطر مكسور مش عند نهاية الجملة الحقيقية).
 *
 * ⚠️ **محافظ عمداً**: بيدمج سطر باللي بعده بس لو السطر **مش** منتهي بعلامة
 * جملة، والاتنين مش عناوين، والسطر الجاي مش قائمة. الفقرات (`\n{2,}`)
 * مابتتلمسش خالص — فطول النص ومواضع الفقرات بتفضل زي ما هي.
 */
export function unwrapHardWraps(text: string): string {
  const paragraphs = text.split(/\n{2,}/);

  const unwrapped = paragraphs.map((paragraph) => {
    const lines = paragraph.split("\n");
    const merged: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      const previous = merged[merged.length - 1];
      const canMerge =
        previous !== undefined &&
        previous !== "" &&
        trimmed !== "" &&
        !SENTENCE_END.test(previous) &&
        // ⚠️ القائمة بتعمل حد من الاتجاهين: مابنلزقش سطر بعد عنصر قائمة
        //    (بيبوّضها) ومابنلزقش عنصر قائمة بعد سطر.
        !LIST_START.test(previous) &&
        !LIST_START.test(trimmed) &&
        !isHeadingLine(previous) &&
        !isHeadingLine(trimmed);

      if (canMerge) {
        merged[merged.length - 1] = `${previous} ${trimmed}`;
      } else {
        merged.push(trimmed);
      }
    }
    return merged.join("\n");
  });

  return unwrapped.join("\n\n");
}

/** أقل طول مفيد للـ overlap — أقل من كده سياق بلا قيمة، فنسيبه خالص. */
const MIN_OVERLAP_CHARS = 30;

/**
 * بيرجّع «ذيل» مكوّن من **جمل كاملة** من نهاية النص، طوله ≤ الميزانية —
 * ده اللي بيتحط في بداية القطعة اللي بعدها (overlap).
 *
 * ⚠️ **ليه جمل كاملة مش قص أعمى**: قطعة بتبدأ بنص جملة بتبوّخ الموديل وبيكمّل
 * الجملة الناقصة من معلوماته العامة (نفس سبب القواعد في `GROUNDING_RULES`).
 * ولو حتى آخر جملة أكبر من الميزانية → نرجّع فاضي، مش نقص جملة.
 */
export function sentenceSuffixForOverlap(text: string, budget: number): string {
  if (budget < MIN_OVERLAP_CHARS) return "";

  const sentences = text.split(/(?<=[.!؟?،؛])\s+/);
  let suffix = "";
  for (let i = sentences.length - 1; i >= 0; i -= 1) {
    const candidate = sentences[i].length + (suffix === "" ? 0 : suffix.length + 1);
    if (candidate > budget) break;
    // ⚠️ بنلزق بـ `\n` مش مسافة — نفس أسلوب الكاسكاد في تلزيق القطع،
    //    فالذيل بيبقى حرفياً موجود في آخر القطعة السابقة.
    suffix = suffix === "" ? sentences[i] : `${sentences[i]}\n${suffix}`;
  }

  return suffix.length >= MIN_OVERLAP_CHARS ? suffix.trim() : "";
}
