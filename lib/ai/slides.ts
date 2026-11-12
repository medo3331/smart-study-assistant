/* ==========================================================================
   🎨 توليد العرض التقديمي — Phase 5
   ============================================================================

   **سيرفر بس.** الدخول من الراوت بس.

   ═══ نفس آلة «الشرح المكثف» بالظبط ═══
   - الـ anchor = **رقم الوحدة** (صفحة/شريحة/فقرة) اللي إحنا منحناه.
   - نداء لكل جزء (مجموعة وحدات) **بالتوازي** ⇒ جوه حدّ الـ TPM.
   - **٤ طبقات تحقق** على المرجع.
   - **كريدت واحد للمستند** (مرجع ثابت ⇒ `already_existed`).

   ═══ الفرق الوحيد عن «الشرح المكثف» ═══
   الـ anchor هنا **رقم صفحة** (مش توقيت) ⇒ طبقة «sanity الوقت» بتتحوّل
   لـ «الرقم جوه المدى [1..pageCount]» — وهي أضيق بكتير.

   ═══ ليه الـ state جزء جزء ═══
   التوليد on-demand (قرار): الطالب يولّد جزء، يشوفه، وبعدين يطلب
   التاني ⇒ التقدّم بيتحفظ والـ refresh مبيضيّعشش حاجة.
   ========================================================================== */

import type { AiTaskInput } from "./tasks/types";
import {
  AiStructuredOutputError,
  expectArray,
  expectObject,
  expectString,
  extractJson,
  rejectUnknownKeys,
} from "./structured";
import {
  buildSlidesMessages,
  MAX_BULLETS_PER_SLIDE,
  MAX_BULLET_CHARS,
  MAX_HEADING_CHARS,
  MAX_QUOTE_CHARS,
  MAX_SLIDES_PER_PART,
  SLIDES_MAX_TOKENS,
  SLIDES_PART_CHARS,
} from "./slides-prompts";

/* ═══════════════════════════ الأنواع ═══════════════════════════ */

/** وحدة مستخرجة (صفحة/شريحة/فقرة). */
export type DocumentPage = {
  /** 1-based. */
  number: number;
  text: string;
};

/** نقطة في شريحة — ومعها مرجعها. */
export type DeckBullet = {
  text: string;
  /**
   * رقم الوحدة (1-based) اللي الجملة جاية منها.
   *
   * ⚠️ `null` = المرجع ما تقدرش يتحقَّق منه (الموديل غلط) ⇒ النقطة
   *    بتظهر **من غير** شارة مصدر.
   */
  page: number | null;
  /** الاقتباس الحرفي (للتحقق فقط — مش بيتخزَّن). */
  quote?: string;
};

/** شريحة واحدة. */
export type DeckSlide = {
  heading: string;
  bullets: DeckBullet[];
  /** سطر إضافي للمُقدِّم. */
  notes?: string;
};

/** جزء من العرض (وحدة التوليد). */
export type DeckPart = {
  index: number;
  status: "ready" | "pending" | "failed";
  /** أرقام الوحدات اللي في الجزء ده. */
  pages: number[];
  slides: DeckSlide[];
  error: string | null;
};

/** الحالة الكاملة (بتتخزَّن في `documents.deck`). */
export type DeckState = {
  version: 1;
  title: string;
  subtitle?: string;
  total_parts: number;
  parts: DeckPart[];
  source: {
    file_name: string;
    page_count: number;
    unit: "page" | "slide" | "paragraph";
  };
};

/** خطأ معروف للراوت يترجمه لـ HTTP + رسالة عربية آمنة. */
export class SlidesError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "SlidesError";
    this.code = code;
    this.status = status;
  }
}

/* ═══════════════════════════ تقسيم الوحدات لأجزاء ═══════════════════════════ */

/** مجموعة وحدات (جزء توليد). */
export type PageGroup = {
  index: number;
  pages: DocumentPage[];
};

/**
 * يقسّم الوحدات لأجزاء توليد.
 *
 * ⚠️ **ليه مش عدد ثابت من الصفحات**: الصفحات متفاوتة في الحجم (صفحة
 *    نصها ٢٠٠ حرف وصفحة ٤٠٠٠). التقسيم بالحروف هو اللي بيحافظ على
 *    ميزانية الـ prompt.
 */
export function chunkPages(
  pages: DocumentPage[],
  maxChars: number = SLIDES_PART_CHARS,
): PageGroup[] {
  if (pages.length === 0) return [];
  const limit = Math.max(1, maxChars);

  const groups: PageGroup[] = [];
  let current: DocumentPage[] = [];
  let chars = 0;

  for (const page of pages) {
    const cost = page.text.length + 1;
    if (current.length > 0 && chars + cost > limit) {
      groups.push({ index: groups.length, pages: current });
      current = [page];
      chars = cost;
      continue;
    }
    current.push(page);
    chars += cost;
  }
  if (current.length > 0) groups.push({ index: groups.length, pages: current });

  return groups;
}

/* ═══════════════════════════ التحقق ═══════════════════════════ */

/** عتبة قبول الاقتباس (نفس «الشرح المكثف»). */
export const QUOTE_OVERLAP_THRESHOLD = 0.6;

/**
 * تطبيع عربي للمطابقة — نفس قاعدة «الشرح المكثف»:
 * توحيد الهمزات والتاء المربوطة والألف المقصورة، وشيل التشكيل
 * والتطويل والترقيم، وضمّ المسافات.
 *
 * ⚠️ **المسفات بتتبقى** — لأننا بنقارن **كلمات** مش نص كامل.
 */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[؟?!.،,:؛;"«»()[\]{}'"`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** نسبة تداخل الاقتباس مع نص الصفحة. */
export function quoteOverlap(quote: string, pageText: string): number {
  const quoteTokens = normalizeForMatch(quote).split(" ").filter(Boolean);
  if (quoteTokens.length === 0) return 0;
  const pageTokens = new Set(normalizeForMatch(pageText).split(" ").filter(Boolean));
  if (pageTokens.size === 0) return 0;

  let shared = 0;
  for (const token of quoteTokens) {
    if (pageTokens.has(token)) shared += 1;
  }
  return shared / quoteTokens.length;
}

/**
 * يقرا رقم الصفحة من أي شكل بيرجعه الموديل.
 *
 * ⚠️ **ليه مش رقم وخلاص**: الموديل بينسخ الـ anchor **زي ما هو** في
 *    البرومبت (`[P12]`)، فبيرجّع `"P12"` (نص) مش `12` (رقم). ولو
 *    رفضنا النص كان **كل** المراجع مرفوضة ⇒ الميزة مبتشتغلش خالص.
 *
 * ⇒ بنقبل: رقم (`12`) · نص رقمي (`"12"`) · نص بعلامة P (`"P12"` · `"p 12"`).
 */
export function parsePageNumber(value: unknown): number | null {
  // ⚠️ الأرقام 1-based ⇒ صفر مرفوض (رقم الصفحة الأول = 1).
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value !== "string") return null;
  const match = /^\s*[Pp]?\s*(\d+)\s*$/.exec(value);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * يتحقق من رد الموديل لجزء واحد.
 *
 * ⚠️ **٤ طبقات** (زي «الشرح المكثف»):
 *   ١) الشكل — strict (أي مفتاح مش متوقّع = رفض الجزء كله).
 *   ٢) `page` جوه **مدى الجزء ده** بالظبط (set-membership صارم).
 *   ٣) `quote` لازم يكون فعلاً في نص الصفحة ⇒ (٢) تمنع الاختراع،
 *      و(٣) تمنع «قال كلام صفحة تانية».
 *   ٤) `page` جوه [1..pageCount] الكلي.
 *
 * ⚠️ **المرجع الغلط بيشيل الـ chip بس** (مش النقطة) — النقطة فايدة
 *    واللي ناقصها الثقة في المصدر.
 */
export function validateSlidesPart(
  value: unknown,
  group: PageGroup,
  allPages: DocumentPage[],
): { slides: DeckSlide[]; rejected: number; total: number } {
  const obj = expectObject(value);
  rejectUnknownKeys(obj, ["slides"], "slides");

  const rawSlides = expectArray(obj.slides);
  if (rawSlides.length > MAX_SLIDES_PER_PART) {
    throw new AiStructuredOutputError("Too many slides");
  }

  const groupNumbers = new Set(group.pages.map((p) => p.number));
  const pageByNumber = new Map(allPages.map((p) => [p.number, p.text]));

  const slides: DeckSlide[] = [];
  let rejected = 0;
  let total = 0;

  for (const rawSlide of rawSlides) {
    const slideObj = expectObject(rawSlide);
    rejectUnknownKeys(slideObj, ["heading", "bullets", "notes"], "slide");

    const heading = expectString(slideObj.heading, "heading");
    if (heading.length > MAX_HEADING_CHARS) {
      throw new AiStructuredOutputError("Slide heading is too long");
    }

    const rawBullets = expectArray(slideObj.bullets);
    if (rawBullets.length > MAX_BULLETS_PER_SLIDE) {
      throw new AiStructuredOutputError("Too many bullets in a slide");
    }

    const bullets: DeckBullet[] = [];
    for (const rawBullet of rawBullets) {
      total += 1;
      const bulletObj = expectObject(rawBullet);
      rejectUnknownKeys(bulletObj, ["text", "page", "quote"], "bullet");

      const text = expectString(bulletObj.text, "text");
      if (text.length > MAX_BULLET_CHARS) {
        throw new AiStructuredOutputError("Bullet text is too long");
      }

      // ٢) `page` جوه مدى الجزء ده.
      //    ⚠️ `parsePageNumber` بيقبل `12` و `"12"` و `"P12"` — الموديل
      //    بينسخ الـ anchor من البرومبت بالحرف.
      const page = parsePageNumber(bulletObj.page);
      if (page === null || !groupNumbers.has(page)) {
        rejected += 1;
        bullets.push({ text, page: null });
        continue;
      }

      // ٣) الاقتباس لازم يكون من الصفحة نفسها.
      const quote = typeof bulletObj.quote === "string" ? bulletObj.quote.trim() : "";
      const pageText = pageByNumber.get(page) ?? "";
      if (
        quote === "" ||
        quote.length > MAX_QUOTE_CHARS ||
        quoteOverlap(quote, pageText) < QUOTE_OVERLAP_THRESHOLD
      ) {
        rejected += 1;
        bullets.push({ text, page: null });
        continue;
      }

      // ٤) الرقم جوه المدى الكلي (مفروض مضمون بالطبقة ٢، بس ده
      //    الفحصOSH الأخير).
      if (page < 1 || page > allPages.length) {
        rejected += 1;
        bullets.push({ text, page: null });
        continue;
      }

      bullets.push({ text, page, quote });
    }

    if (bullets.length > 0) {
      const notes =
        typeof slideObj.notes === "string" && slideObj.notes.trim() !== ""
          ? slideObj.notes.trim().slice(0, MAX_HEADING_CHARS)
          : undefined;
      slides.push({ heading, bullets, ...(notes ? { notes } : {}) });
    }
  }

  return { slides, rejected, total };
}

/* ═══════════════════════════ التوليد ═══════════════════════════ */

/** اعتمادات قابلة للحقن — في الاختبارات بنمرّر mock. */
export type SlidesDeps = {
  runTask: (task: "chat", input: AiTaskInput) => Promise<{ content: string; model?: string }>;
};

/** نتيجة توليد جزء واحد. */
export type DeckPartResult = {
  slides: DeckSlide[];
  model: string;
  aiCalls: number;
};

/**
 * يولّد **جزء واحد** من العرض.
 *
 * ⚠️ **نداء واحد** — وده اللي بيحمي من حدّ الـ TPM (نفس قرار
 *    «الشرح المكثف» بعد ما اكتشفنا الـ 429).
 */
export async function generateDeckPart(input: {
  group: PageGroup;
  allPages: DocumentPage[];
  totalParts: number;
  unitLabel: string;
  deps: SlidesDeps;
}): Promise<DeckPartResult> {
  const { group, allPages, totalParts, unitLabel, deps } = input;

  const response = await deps.runTask("chat", {
    messages: buildSlidesMessages({
      pages: group.pages,
      partIndex: group.index,
      totalParts,
      unitLabel,
    }),
    // ⚠️ **السقف لازم** — موديل gpt-oss استدلال، ومن غيره المزوّد بيحط
    //    سقف افتراضي صغير فالموديل بيصرفه كله على التفكير ويطلع
    //    `content` فاضي ⇒ 502 «no assistant content».
    options: { temperature: 0.3, maxTokens: SLIDES_MAX_TOKENS },
  });

  const parsed = parseJsonPayload(response.content);
  const validated = validateSlidesPart(parsed, group, allPages);

  const rejectionRate = validated.total === 0 ? 1 : validated.rejected / validated.total;
  if (rejectionRate > 0.3) {
    throw new SlidesError(
      "PART_INVALID",
      "الجزء ده اتولّد بس مراجعه مقدرناش نتحقق منها. جرّب تاني.",
      502,
    );
  }

  return { slides: validated.slides, model: response.model ?? "", aiCalls: 1 };
}

/**
 * يستخرج JSON من رد الموديل.
 *
 * ⚠️ **متسامح**: الرد ممكن يبقى في ```json fence أو فيه كلام قبل الـ
 *    JSON. `extractJson` بيلاقي أول كائن **متوازن** (وبيعدّي الـ
 *    strings صح) — وده المساعد الموجود في المشروع أصلاً.
 */
export function parseJsonPayload(content: string): unknown {
  const trimmed = content.trim();
  if (trimmed === "") {
    throw new AiStructuredOutputError("Empty model response");
  }
  return extractJson(trimmed);
}

/* ═══════════════════════════ تركيب العرض ═══════════════════════════ */

/** يجمع شرائح كل الأجزاء بالترتيب (الأجزاء الجاهزة بس). */
export function flattenDeck(state: DeckState): DeckSlide[] {
  return state.parts
    .filter((part) => part.status === "ready")
    .sort((a, b) => a.index - b.index)
    .flatMap((part) => part.slides);
}

/** حالة Deck جديدة (كل الأجزاء pending). */
export function emptyDeckState(input: {
  title: string;
  subtitle?: string;
  groups: PageGroup[];
  source: DeckState["source"];
}): DeckState {
  return {
    version: 1,
    title: input.title,
    ...(input.subtitle ? { subtitle: input.subtitle } : {}),
    total_parts: input.groups.length,
    parts: input.groups.map((group) => ({
      index: group.index,
      status: "pending" as const,
      pages: group.pages.map((p) => p.number),
      slides: [],
      error: null,
    })),
    source: input.source,
  };
}
