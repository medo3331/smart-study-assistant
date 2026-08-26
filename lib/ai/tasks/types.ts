import type { AiChatMessage, AiProviderName, AiTaskType } from "../types";
import type { AiTokenUsage } from "../types";
import type { RouterAttempt } from "../routing";

/**
 * سياق المستخدم المصدر — بيتقرأ من الجلسة الحقيقية على السيرفر فقط.
 * الضيوف بيفضلوا بدون user، وكل الحقول اختيارية وممنوع تخمينها.
 */
export type AiUserContext = {
  userId?: string;
  role?: string;
  language?: string;
  educationLevel?: string;
  preferences?: Record<string, string>;
};

/** مدخل موحّد لأي مهمة AI عبر الطبقة المركزية. */
export type AiTaskInput = {
  messages: AiChatMessage[];
  options?: Record<string, unknown>;
  user?: AiUserContext;
};

/** تعريف مهمة AI — كل تدفق جديد بيتمثل بمدخل واحد في السجل. */
export type AiTaskDefinition = {
  id: AiTaskType;
  label: string;
  /** التدفقات الجاهزة فعليًا عبر /api/ai فقط هي اللي true هنا. */
  implemented: boolean;
  temperature: number;
  /**
   * يبني رسالة النظام الخاصة بالمهمة. بتُستخدم فقط لو مبعوت الطلب ما جابش
   * رسالة نظام خاصة بيه — رسالة نظام المتصل بتكسب دايمًا.
   */
  buildSystemPrompt?: (input: AiTaskInput) => string | null;
  /** فحص أخير لناتج الموديل قبل الرجوع — بيرمي لو الناتج غير صالح. */
  parseOutput?: (content: string) => string;
};

/** الناتج الموحّد لأي مهمة — نفس الشكل بغضّ النظر عن المزوّد المنفّذ. */
export type AiTaskResult = {
  task: AiTaskType;
  content: string;
  provider: AiProviderName;
  model: string;
  usage?: AiTokenUsage;
  /** موجود فقط لو حصل fallback فعلي أثناء التنفيذ. */
  fallback?: { attempts: RouterAttempt[] };
};
