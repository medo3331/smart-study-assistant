"use server";

import { toggleModelStatus, updateModelPriority, updateModelDailyLimit } from "./ai-models";

type ActionResult = { ok: boolean; message: string; auditId?: string; error?: string };

/**
 * 🔒 غلاف الـform actions لصفحة الموديلات.
 *
 * ⚠️ تحصين (المرحلة 1 + P0 2026-11): النسخة القديمة كانت بتقرأ
 * `admin_user_id` / `admin_email` من الـFormData — ودي قيم يتحكم فيها المتصفح.
 * بعدها بقى الغلاف بيقرأ الهوية من الجلسة ويمرّرها كباراميتر للـaction — وده
 * كمان كان قابل للتزوير لو حد نادى الـaction مباشرة.
 *
 * دلوقتي: **الـactions نفسها** (ai-models.ts) هي اللي بتقرأ الجلسة عبر
 * `requireAdminActor("models.manage")`. الغلاف هنا بيحوّل الفورم بس.
 */

function toResult(res: { ok: boolean; message: string; auditId?: string | null; error?: string | null }): ActionResult {
  return { ok: res.ok, message: res.message, auditId: res.auditId || undefined, error: res.error || undefined };
}

export async function toggleModelFormAction(formData: FormData): Promise<ActionResult> {
  const modelId = String(formData.get("model_id") ?? "").trim();
  const enabledTarget = formData.get("target_enabled") === "true";

  if (!modelId) {
    return { ok: false, message: "معرّف الموديل مطلوب", error: "missing_model_id" };
  }

  const res = await toggleModelStatus(modelId, enabledTarget);
  return toResult(res);
}

/** تغيير أولوية الموديل (1-99) — كتابة حقيقية في ai_models + audit. */
export async function updateModelPriorityFormAction(formData: FormData): Promise<ActionResult> {
  const modelId = String(formData.get("model_id") ?? "").trim();
  const priority = Number(String(formData.get("priority") ?? "").trim());

  if (!modelId) return { ok: false, message: "معرّف الموديل مطلوب", error: "missing_model_id" };
  if (!Number.isInteger(priority) || priority < 1 || priority > 99) {
    return { ok: false, message: "الأولوية لازم تكون رقم صحيح بين 1 و 99", error: "invalid_priority" };
  }

  const res = await updateModelPriority(modelId, priority);
  return toResult(res);
}

/** ضبط/إزالة الحد اليومي لكل موديل — فاضي أو 0 = بلا حد. كتابة حقيقية + audit. */
export async function updateModelLimitFormAction(formData: FormData): Promise<ActionResult> {
  const modelId = String(formData.get("model_id") ?? "").trim();
  const raw = String(formData.get("daily_limit") ?? "").trim();
  const dailyLimit = raw === "" || raw === "0" ? null : Number(raw);

  if (!modelId) return { ok: false, message: "معرّف الموديل مطلوب", error: "missing_model_id" };
  if (dailyLimit !== null && (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100000)) {
    return { ok: false, message: "الحد اليومي لازم يكون رقم صحيح بين 1 و 100000 أو فاضي (بلا حد)", error: "invalid_daily_limit" };
  }

  const res = await updateModelDailyLimit(modelId, dailyLimit);
  return toResult(res);
}
