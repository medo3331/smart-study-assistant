"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import { requireAdminActor, ActionAuthError } from "@/lib/admin/action-guard";
import type { ActorContext } from "@/lib/policy";

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
 * بوابة الصلاحية الموحّدة لكل أفعال صفحة الموديلات.
 *
 * ⚠️ أمان (P0، 2026-11): النسخة القديمة كانت بتاخد `adminUserId`/`adminEmail`
 * من المتصل وتبني عليهما فحص "models.manage" (Owner-only) — يعني انتحال
 * شخصية المالك عبر باراميتر. دلوقتي الهوية من الجلسة فقط.
 *
 * أي رفض بيتسجل BLOCKED بهوية `null` (مش الهوية اللي العميل بعتها).
 */
async function requireModelsManage(
  modelId: string,
  details: Record<string, unknown>
): Promise<{ ok: true; actor: ActorContext } | { ok: false; result: ModelUpdateResult }> {
  try {
    const { actor } = await requireAdminActor("models.manage");
    return { ok: true, actor };
  } catch (e) {
    if (e instanceof ActionAuthError) {
      await recordAuditLog({
        actor: null,
        actor_email: null,
        action: "models.manage",
        resource_type: "model",
        resource_id: modelId,
        details: { ...details, status: "blocked_attempt", cause: e.code },
        result: "BLOCKED",
      });
      return {
        ok: false,
        result: {
          ok: false,
          message: "غير مصرح: إدارة النماذج متاحة لـ Owner فقط",
          error: "authorization_denied",
          auditId: null,
        },
      };
    }
    throw e;
  }
}

export async function toggleModelStatus(modelId: string, enabled: boolean): Promise<ModelUpdateResult> {
  try {
    const gate = await requireModelsManage(modelId, { model_id: modelId, enabled_target: enabled });
    if (!gate.ok) return gate.result;
    const adminUserId = gate.actor.userId!;
    const adminEmail = gate.actor.userEmail;

    const privileged = createServiceClient();
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
export async function updateModelPriority(modelId: string, priority: number): Promise<ModelUpdateResult> {
  try {
    if (!Number.isInteger(priority) || priority < 1 || priority > 99) {
      return { ok: false, message: "الأولوية لازم تكون رقم صحيح بين 1 و 99", error: "invalid_priority", auditId: null };
    }
    const gate = await requireModelsManage(modelId, { model_id: modelId, priority_target: priority });
    if (!gate.ok) return gate.result;
    const adminUserId = gate.actor.userId!;
    const adminEmail = gate.actor.userEmail;

    const privileged = createServiceClient();
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
export async function updateModelDailyLimit(modelId: string, dailyLimit: number | null): Promise<ModelUpdateResult> {
  try {
    if (dailyLimit !== null && (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100000)) {
      return { ok: false, message: "الحد اليومي لازم يكون رقم صحيح بين 1 و 100000 أو فاضي (بلا حد)", error: "invalid_daily_limit", auditId: null };
    }
    const gate = await requireModelsManage(modelId, { model_id: modelId, daily_limit_target: dailyLimit });
    if (!gate.ok) return gate.result;
    const adminUserId = gate.actor.userId!;
    const adminEmail = gate.actor.userEmail;

    const privileged = createServiceClient();
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
