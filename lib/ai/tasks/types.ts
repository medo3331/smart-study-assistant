import type { AiUsageContext } from "../usage-context";

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
  /**
   * \ud83e\udde1 \u0633\u064a\u0627\u0642 \u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u0645\u0646\u0637\u0642\u064a (Phase 5-C4).
   *
   * \u26a0\ufe0f **\u0627\u0644\u0647\u0648\u064a\u0629 \u0628\u062a\u062c\u064a \u0641\u064a \u0627\u0644\u0631\u0648\u0627\u062a\u060c \u0645\u0634 \u0647\u0646\u0627.** \u0623\u0635\u0644 \u0645\u0646 \u062e\u0627\u0631\u062c\u061b
   *   \u0644\u0648 \u0645\u0646 `runner` \u0625\u0644\u0647 \u064a\u0648\u0644\u0651\u062f UUID\u060c \u0644\u0623\u0646\u0647 \u0645\u0627\u0641\u064a\u0634\u0634 \u0628\u0639\u062f \u0646\u0642\u0627\u0637 \u0627\u0644\u0637\u0644\u0628.
   */
  usage?: AiUsageContext;
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
