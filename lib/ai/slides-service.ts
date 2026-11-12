/* ==========================================================================
   🎬 خدمة توليد العروض — الطبقة المشتركة بين المستندات والمحاضرات
   ============================================================================

   ═══ ليه الطبقة دي موجودة ═══
   مسارين بيولّدوا عروض، والفرق بينهم **الوحدات بس**:

   ① **مستند مرفوع** (PDF/PPTX/DOCX) ⇒ الوحدات = صفحات/شرائح/فقرات
      والصفحات مخزّنة في `knowledge_base`.
   ② **محاضرة** (Audio/Video) ⇒ الوحدات = **مقاطع التفريغ** والتوقيت
      هو المرجع («دقيقة 12:30»).

   ⇒ كل حاجة تانية (التقطيع، التوليد، التحقق من المراجع، الكريديت،
   الحفظ، تصدير الـ 3 صيغ) **واحدة**. المساران بيستدعوا `generateDeck`
   وبيمرّروا له `pages` جاهزة.

   ═══ الكريديت ═══
   `creditRefId` ثابت لكل مصدر (مستند/محاضرة) ⇒ `reserve_ai_credit`
   idempotent على `p_ref_id` ⇒ **كريدت واحد** مهما كان عدد الأجزاء.
   ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";

import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "./ai-credit-guard";
import { consumeServiceQuota, refundServiceQuota } from "./service-registry";
import { runAiTask } from "./tasks/runner";
import {
  chunkPages,
  emptyDeckState,
  flattenDeck,
  generateDeckPart,
  SlidesError,
  type DeckSlide,
  type DeckState,
  type DocumentPage,
} from "./slides";
import { generateDeckFile, type DeckFormat } from "./slides-generator";

/** نوع الوحدة — بيحدّد الليبل المعروض («صفحة ٤» / «دقيقة 12:30»). */
export type DeckUnit = DeckState["source"]["unit"];

/** أقصى عدد أجزاء (حماية من المصادر العملاقة). */
export const MAX_DECK_PARTS = 40;

/**
 * ⚠️ **نوع المصدر** — بيحدّد تعليمات الـ prompt.
 *
 * `transcript` ⇒ المصدر تفريغ صوتي ⇒ لازم تنظيف الـ ASR + إعادة صياغة.
 * `document` ⇒ المصدر نص مكتوب.
 */
export type DeckSourceKind = "transcript" | "document";

/** الموديل اللي بنحجز الكريديت عليه. */
const CREDIT_MODEL = "openai/gpt-oss-120b";

export type GenerateDeckInput = {
  supabase: SupabaseClient;
  userId: string;
  /** الوحدات — جاهزة (الصفحات/المقاطع). */
  pages: DocumentPage[];
  /** نوع الوحدة — بيحدّد الليبل. */
  unit: DeckUnit;
  /**
   * ⚠️ **نوع المصدر** — `transcript` للمحاضرات (⇒ تعليمات تنظيف الـ
   *   ASR وإعادة الصياغة) و`document` للمستندات.
   */
  sourceKind?: DeckSourceKind;
  /** اسم المصدر (المادة/المحاضرة) — بيظهر في الـ footer. */
  fileName: string;
  /** عنوان العرض. */
  title: string;
  /** رقم الجزء المطلوب (اختياري) — `undefined` = أول جزء مش متولّد. */
  partIndex?: number;
  /** الـ deck المحفوظ (لو في) — عشان نكمّل عليه. */
  existingDeck: DeckState | null;
  /**
   * 🔑 مرجع الكريديت — **ثابت لكل مصدر**.
   *
   * مثال: `document_slides:<userId>:<docId>` · `lecture_slides:<userId>:<lectureId>`
   */
  creditRefId: string;
  /** صيغة التصدير — `undefined` = رد JSON (مش ملف). */
  format?: DeckFormat;
};

export type GenerateDeckResult = {
  deck: DeckState;
  slides: DeckSlide[];
  totalParts: number;
  readyParts: number;
  nextPending: number | undefined;
  quota: { remaining: number; limit: number };
};

/**
 * يولّد جزء واحد من العرض (أو يصدّر الملف).
 *
 * ⚠️ **ترتيب الحمايات** (مقصود):
 *   ① حدّ الباقة (Pro/Ultra) — قبل أي نداء.
 *   ② حارس الكروت — **قبل** أي نداء موديل.
 *   ③ نداء الموديل (واحد).
 *   ④ الحفظ.
 *
 * ⚠️ **الاسترجاع**: لو فشل **أي** جزء اتولّد ⇒ منعملش استرجاع (الكريديت
 *    ده اتصرف عليه فعلاً). الاسترجاع بس لو **مفيش** جزء اتولّد خالص.
 */
export async function generateDeck(
  input: GenerateDeckInput,
): Promise<GenerateDeckResult> {
  const {
    supabase,
    userId,
    pages,
    unit,
    fileName,
    title,
    existingDeck,
    creditRefId,
  } = input;

  if (pages.length === 0) {
    throw new SlidesError(
      "NO_PAGES",
      "مفيش محتوى مقروء نعمل منه عرض. تأكد إن الملف اتقرا.",
      422,
    );
  }

  // ① حدّ الباقة.
  const quota = await consumeServiceQuota(supabase, userId, "documents_slides");
  if (!quota.allowed) {
    throw new SlidesError(
      "QUOTA_EXCEEDED",
      quota.reasonAr ?? "الخدمة دي متاحة للمشتركين.",
      402,
    );
  }

  // ② خطة الأجزاء.
  const groups = chunkPages(pages);
  if (groups.length > MAX_DECK_PARTS) {
    throw new SlidesError(
      "TOO_MANY_PARTS",
      "المصدر ده طويل أوي. جرّب جزء منه.",
      422,
    );
  }

  // ⚠️ **الـ deck المحفوظ بيتقبل لو نفس عدد الأجزاء** — لوNtالمحتوى اتغيّر
  //    (مثلاً تفريغ اتعدّل) ⇒ الأجزاء اتغيّرت ⇒ نبدأ من جديد.
  const base: DeckState =
    existingDeck &&
    existingDeck.version === 1 &&
    Array.isArray(existingDeck.parts) &&
    existingDeck.parts.length === groups.length
      ? existingDeck
      : emptyDeckState({
          title,
          groups,
          source: {
            file_name: fileName,
            page_count: pages.length,
            unit,
          },
        });

  // ③ أي جزء؟
  const targetIndex =
    input.partIndex !== undefined
      ? input.partIndex
      : (base.parts.find((part) => part.status !== "ready")?.index ?? 0);

  if (targetIndex < 0 || targetIndex >= groups.length) {
    throw new SlidesError(
      "BAD_PART_INDEX",
      `الجزء ده مش موجود. المصدر ده فيه ${groups.length} أجزاء.`,
      400,
    );
  }

  // ④ حارس الكروت.
  const guard = await guardAiAccessAndReserve(supabase, userId, CREDIT_MODEL, {
    refId: creditRefId,
  });
  if (!guard.ok) {
    await refundServiceQuota(supabase, userId, "documents_slides");
    throw new SlidesError(
      "CREDIT_DENIED",
      "مفيش رصيد كافٍ لتوليد العرض.",
      402,
    );
  }

  // ⑤ التوليد (نداء واحد).
  const targetGroup = groups[targetIndex];
  // ⚠️ **حجم الجزء بالحروف** — بيتحسب للهدف فقط (مش للتقطيع).
  const groupChars = targetGroup.pages.reduce((sum, p) => sum + p.text.length + 1, 0);
  let generated;
  try {
    generated = await generateDeckPart({
      group: targetGroup,
      allPages: pages,
      totalParts: groups.length,
      unitLabel: unitLabelFor(unit),
      ...(input.sourceKind ? { sourceKind: input.sourceKind } : {}),
      // ⭐ **الهدف** — ١٢٠٠ حرف/شريحة (كل شريحة ≈ ٣ نقاط).
      slidesTarget: Math.max(1, Math.min(6, Math.round(groupChars / 1200))),
      deps: { runTask: runAiTask },
    });
  } catch (error) {
    await refundAiCreditIfNeeded(supabase, userId, guard.refId);
    await refundServiceQuota(supabase, userId, "documents_slides");
    throw error;
  }

  // ⑥ الحفظ.
  const nextState: DeckState = {
    ...base,
    title: base.title || title,
    total_parts: groups.length,
    parts: base.parts.map((part) =>
      part.index === targetIndex
        ? {
            ...part,
            status: "ready" as const,
            error: null,
            slides: generated.slides,
          }
        : part,
    ),
    source: base.source ?? {
      file_name: fileName,
      page_count: pages.length,
      unit,
    },
  };

  return {
    deck: nextState,
    slides: flattenDeck(nextState),
    totalParts: groups.length,
    readyParts: nextState.parts.filter((part) => part.status === "ready").length,
    nextPending: nextState.parts.find((part) => part.status !== "ready")?.index,
    quota: { remaining: quota.remaining, limit: quota.limit },
  };
}

/** الليبل المفرد للوحدة (بيتستخدم في البرومبت + في الشرح). */
export function unitLabelFor(unit: DeckUnit): string {
  if (unit === "slide") return "شريحة";
  if (unit === "paragraph") return "فقرة";
  if (unit === "segment") return "مقطع";
  return "صفحة";
}

/** يصدّر الـ deck كملف بالصيغة المطلوبة. */
export async function exportDeckFile(
  deck: DeckState,
  slides: DeckSlide[],
  format: DeckFormat,
): Promise<{ buffer: Buffer; filename: string; mimeType: string; size: number }> {
  return generateDeckFile({ format, state: deck, slides });
}
