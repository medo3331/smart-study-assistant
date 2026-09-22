"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import { hasPermission } from "@/lib/auth-roles";

export interface ModelUpdateInput {
  modelId: string;
  enabled?: boolean;
  provider?: string;
  displayName?: string;
  accessTier?: string; // free / gated / unknown
}

export interface ModelUpdateResult {
  ok: boolean;
  message: string;
  auditId?: string | null;
  error?: string | null;
}

/**
 * بوابة الصلاحية الموحّدة لكل أفعال صفحة الموديلات (Phase 2):
 * نفس نمط المرحلة 1 المؤكد — هوية المنفّذ بتيجي من الجلسة على السيرفر (الغلاف
 * في ai-models-form-action.ts) والفحص بـ hasPermission("models.manage")
 * (Owner-only حسب ADMIN_PERMISSION_MAP) مش بأي قيمة من المتصفح.
 * أي رفض بيتسجل BLOCKED في audit_log.
 */
async function requireModelsManage(
  privileged: ReturnType<typeof createServiceClient>,
  adminUserId: string,
  adminEmail: string | null,
  modelId: string,
  details: Record<string, unknown>
): Promise<ModelUpdateResult | null> {
  const allowed = await hasPermission(privileged, adminUserId, adminEmail, "models.manage");
  if (allowed) return null;
  await recordAuditLog({
    actor: adminUserId,
    actor_email: adminEmail,
    action: "models.manage",
    resource_type: "model",
    resource_id: modelId,
    details: { ...details, rejected_by: adminUserId, status: "blocked_attempt" },
    result: "BLOCKED",
  });
  return { ok: false, message: "غير مصرح: إدارة النماذج متاحة لـ Owner فقط", error: "authorization_denied", auditId: null };
}

export async function toggleModelStatus(modelId: string, enabled: boolean, adminUserId: string, adminEmail: string | null): Promise<ModelUpdateResult> {
  try {
    const privileged = createServiceClient();
    const denied = await requireModelsManage(privileged, adminUserId, adminEmail, modelId, { model_id: modelId, enabled_target: enabled });
    if (denied) return denied;
    const { error } = await privileged.from("ai_models").update({ enabled: enabled, updated_at: new Date().toISOString() }).eq("model_id", modelId);
    if (error) {
      await recordAuditLog({ actor: adminUserId, actor_email: adminEmail, action: "models.manage", resource_type: "model", resource_id: modelId, details: { enabled_target: enabled, reason: "db_update_failed" }, result: "FAIL" });
      return { ok: false, message: "فشل تحديث الموديل: " + error.message, error: error.message, auditId: null };
    }
    const auditRes = await recordAuditLog({ actor: adminUserId, actor_email: adminEmail, action: "models.manage", resource_type: "model", resource_id: modelId, details: { enabled_target: enabled, status: enabled ? "enabled" : "disabled" }, result: "PASS" });
    return { ok: true, message: `تم ${enabled ? "تفعيل" : "تعطيل"} الموديل (${modelId})`, auditId: auditRes.id || null };
  } catch (e: any) {
    return { ok: false, message: "خطأ غير متوقع: " + (e?.message || String(e)), error: String(e), auditId: null };
  }
}

/** تغيير أولوية/ترتيب الموديل في الاختيار (1-99 — الأصغر يتجرّب الأول). بيتطبق فعليًا في lib/ai/routing.ts عبر getRuntimePriority. */
export async function updateModelPriority(modelId: string, priority: number, adminUserId: string, adminEmail: string | null): Promise<ModelUpdateResult> {
  try {
    if (!Number.isInteger(priority) || priority < 1 || priority > 99) {
      return { ok: false, message: "الأولوية لازم تكون رقم صحيح بين 1 و 99", error: "invalid_priority", auditId: null };
    }
    const privileged = createServiceClient();
    const denied = await requireModelsManage(privileged, adminUserId, adminEmail, modelId, { model_id: modelId, priority_target: priority });
    if (denied) return denied;
    const { error } = await privileged.from("ai_models").update({ priority, updated_at: new Date().toISOString() }).eq("model_id", modelId);
    if (error) {
      await recordAuditLog({ actor: adminUserId, actor_email: adminEmail, action: "models.manage", resource_type: "model", resource_id: modelId, details: { priority_target: priority, reason: "db_update_failed" }, result: "FAIL" });
      return { ok: false, message: "فشل تحديث الأولوية: " + error.message, error: error.message, auditId: null };
    }
    const auditRes = await recordAuditLog({ actor: adminUserId, actor_email: adminEmail, action: "models.manage", resource_type: "model", resource_id: modelId, details: { priority_target: priority }, result: "PASS" });
    return { ok: true, message: `تم تحديث أولوية (${modelId}) إلى ${priority}`, auditId: auditRes.id || null };
  } catch (e: any) {
    return { ok: false, message: "خطأ غير متوقع: " + (e?.message || String(e)), error: String(e), auditId: null };
  }
}

/** حد استخدام يومي لكل موديل (null = بلا حد). بيتفرض فعليًا في الراوتر عبر lib/ai/model-state.ts. يحتاج db/ai-models-priority-limits.sql. */
export async function updateModelDailyLimit(modelId: string, dailyLimit: number | null, adminUserId: string, adminEmail: string | null): Promise<ModelUpdateResult> {
  try {
    if (dailyLimit !== null && (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100000)) {
      return { ok: false, message: "الحد اليومي لازم يكون رقم صحيح بين 1 و 100000 أو فاضي (بلا حد)", error: "invalid_daily_limit", auditId: null };
    }
    const privileged = createServiceClient();
    const denied = await requireModelsManage(privileged, adminUserId, adminEmail, modelId, { model_id: modelId, daily_limit_target: dailyLimit });
    if (denied) return denied;
    const { error } = await privileged.from("ai_models").update({ daily_limit: dailyLimit, updated_at: new Date().toISOString() }).eq("model_id", modelId);
    if (error) {
      await recordAuditLog({ actor: adminUserId, actor_email: adminEmail, action: "models.manage", resource_type: "model", resource_id: modelId, details: { daily_limit_target: dailyLimit, reason: "db_update_failed" }, result: "FAIL" });
      return { ok: false, message: "فشل تحديث الحد اليومي: " + error.message, error: error.message, auditId: null };
    }
    const auditRes = await recordAuditLog({ actor: adminUserId, actor_email: adminEmail, action: "models.manage", resource_type: "model", resource_id: modelId, details: { daily_limit_target: dailyLimit ?? "unlimited" }, result: "PASS" });
    return { ok: true, message: dailyLimit === null ? `تم إزالة الحد اليومي عن (${modelId})` : `تم ضبط الحد اليومي لـ(${modelId}) على ${dailyLimit}`, auditId: auditRes.id || null };
  } catch (e: any) {
    return { ok: false, message: "خطأ غير متوقع: " + (e?.message || String(e)), error: String(e), auditId: null };
  }
}
