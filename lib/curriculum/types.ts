/* ==========================================================================
   Curriculum Builder — العقد المشترك

   الأنواع والثوابت دي بتتشارك بين الـ API والـ Wizard (المرحلة الجاية).
   مفيش أي منطق AI هنا — بيانات وعقد فقط، عشان الاختبارات والواجهة
   يعتمدوا على نفس المصدر بدل ما كل ملف يكرر الحدود.
   ========================================================================== */

export type CurriculumLevel = "beginner" | "intermediate" | "advanced";

export const CURRICULUM_LEVELS: readonly CurriculumLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
] as const;

/** حدود الطلب الواحد. التوسيع بيستخدم نفس الحدود على عدد الدروس الإضافية. */
export const CURRICULUM_MIN_LESSONS = 3;
export const CURRICULUM_MAX_LESSONS = 50;

/** كل نداء AI بيغطي 10 دروس على الأكثر — ده أساس التسعير والدفعات. */
export const CURRICULUM_BATCH_SIZE = 10;

export const CURRICULUM_MAX_FOCUS_TOPICS = 10;
export const CURRICULUM_MAX_FOCUS_TOPIC_CHARS = 80;
export const CURRICULUM_MAX_SUBJECT_CHARS = 120;
export const CURRICULUM_MAX_CATEGORY_CHARS = 80;
export const CURRICULUM_MAX_PERSONA_CONTEXT_CHARS = 1200;
export const CURRICULUM_MAX_DESCRIPTION_CHARS = 500;

export interface CurriculumDay {
  day: number;
  title: string;
  topic: string;
  description: string;
}

export interface CurriculumGenerationInput {
  subject: string;
  category: string;
  level: CurriculumLevel;
  lessonCount: number;
  focusTopics: string[];
  personaContext: string;
  /** رقم أول درس — 1 للتوليد الجديد، و max(day_number)+1 للتوسيع. */
  startDay?: number;
  /** موضوعات موجودة مسبقاً — التوسيع ما يكرّرهاش. */
  existingTopics?: string[];
}

export interface CurriculumGenerationMeta {
  /** العدد اللي المستخدم طلبه. */
  requested: number;
  /** العدد اللي اتولّد فعلاً — لازم يساوي requested. */
  generated: number;
  level: CurriculumLevel;
  focusTopics: string[];
  /** عدد نداءات الإثراء (بدون نداء الـ outline). */
  batches: number;
  /** رقم درس المراجعة النهائية — دايمًا آخر درس. */
  reviewDay: number;
}

export interface CurriculumGenerationResult {
  course: {
    subject: string;
    level: CurriculumLevel;
    lessonCount: number;
  };
  days: CurriculumDay[];
  meta: CurriculumGenerationMeta;
}

/**
 * خطأ التوليد. `retryable` بتفرّق بين:
 *   - رد الموديل شكلُه غلط / عدد ناقص → نعيد المحاولة مرة واحدة.
 *   - المادة نفسها غير واضحة → مفيش فايدة من إعادة المحاولة.
 *
 * `status` هو كود HTTP اللي الراوت بيرجّعه للكلاينت.
 */
export class CurriculumGenerationError extends Error {
  readonly retryable: boolean;
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    options: { retryable: boolean; status?: number; code?: string }
  ) {
    super(message);
    this.name = "CurriculumGenerationError";
    this.retryable = options.retryable;
    this.status = options.status ?? 502;
    this.code = options.code ?? (options.retryable ? "GENERATION_RETRYABLE" : "GENERATION_FAILED");
  }
}
