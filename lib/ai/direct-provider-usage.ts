/**
 * 📡 قاسدة الاستخدام لمسارات النادمة مباشرة — Phase 5-C4
 * ════════════════════════════════════════════════════════════════════════
 *
 * 🎯 ليه المستاعد هنا؟
 *   6 مسارات (+ `/api/demo`) بنادياس الراوتر مباشرة، وبينادوا الراوتر
 *   `completeChatInner` المُقيس تمامً، فنادك بيستخدموا ال boundary المشترك،
 *   ولاستطلع انقاس هم في 7 places.
 *
 *   ⚠️ **لانحاسب من الكود** — المستاعد مخاطب نس عند اتناكب
 *   `groq.chat.completions.create(...)`، وهو حد **provider attempt**.
 *
 * ═══ القواعد ═══════════════════════════════════════════════════
 *  1. بينادي منففتح بيناء **نادء provider** — عدما مهم التكرار ماحدش
 *     تعديليًا ومليف سطر لاحقً.
 *  2. بيندع مابين في الكود المودود — مابين بالمحتج مطلوب.
 *  3. بيدور القدرة عبر ال feature و goalLevel و source — لا تكرار لأي route.
 *
 * ⚠️ **انتباه مهم:** 4 من المسارات داخلاً بيفوتور تدوير
 *   على أكثر مفاتح («loop over apiKeys»). انتباه التيسير:
 *   «attemptNo is always 0» — القاعدة المقفولة
 *   (attempt احد = event واحد) تطلب عددد الضعاط. لكل دورة في اللوب ينادى
 *   request حقيقي بصاب — من تسجيلها!
 */

import { recordAiUsage, type UsageStatus } from "./usage-accounting";
import { scheduleUsageRecording } from "./usage-scheduler";
import type { AiUsageContext } from "./usage-context";

/** الكامل المنتقل حول واحد — مادين من القاعدة. */
export type DirectProviderUsage = {
  /** سياق الطلب المنطقي — بتيتكون باخت هوية الطلب. */
  usage: AiUsageContext;
  /** الفيشر الدلايي (chat / demo / plan / ...). */
  feature: string;
  /** رقم المحاولة جوه الطلب — 0 للأولى. */
  attemptNo?: number;
  provider: string;
  model?: string | null;
  status: UsageStatus;
  /** /api/demo = 0; everyone else = 1 per real attempt. */
  units?: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  latencyMs?: number | null;
  diagnostics?: Record<string, unknown>;
};

/**
 * 📍 يسجّل محاولة provider واحدة بالجدولة الدائمة (مابعد الرد).
 *
 * ⚠️ **بترجع `Promise<void>` — لازم المستدعي يعملها `await`:**
 *   المسجّل بقى `await`-based في C4.1 عشان الضمانة تكون **حقيقية**
 *   (الـ insert يخلص قبل ما الدالة ترجع). لو رجعنا void هنا، الـ promise
 *   بيبقى floating وبتضيع الكتابة على السيرفر المجمّد — نفس bug الـ
 *   `after()` بالظبط.
 *
 * ⚠️ الخطأ **مابترميش أبدًا**: `scheduleUsageRecording` بتمسكه جواها،
 *   فالطلب الأصلي مش بيتأثر (قاعدة "مفيش path يفشل").
 */
export async function recordDirectProviderAttempt(input: DirectProviderUsage): Promise<void> {
  const { usage, feature } = input;
  await scheduleUsageRecording(() =>
    recordAiUsage({
      userId: usage.userId ?? null,
      feature,
      operationId: usage.operationId,
      idempotencyKey: usage.idempotencyKey,
      attemptNo: input.attemptNo ?? 0,
      provider: input.provider,
      model: input.model ?? null,
      status: input.status,
      units: input.units ?? 1,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      latencyMs: input.latencyMs,
      metadata: { source: usage.source, ...usage.diagnostics, ...input.diagnostics },
    }),
  );
}

/**
 * ⏱️ يقاس زمن مللي بدائة منطقية — استخداعه بين الجراء.
 *
 * ⚠️ تمسك: `await` مابيش هنا — مابيشش يدخل على صفر صفر
 * مقابيس صفر حقيقيًا.
 */
export function startProviderAttempt(): () => number {
  const startedAt = Date.now();
  return () => Date.now() - startedAt;
}
