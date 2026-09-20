"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import { getAdminRole, isOwnerEmail } from "@/lib/auth-roles";

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

export async function toggleModelStatus(modelId: string, enabled: boolean, adminUserId: string, adminEmail: string | null): Promise<ModelUpdateResult> {
  try {
    const privileged = createServiceClient();
    const role = await getAdminRole(privileged, adminUserId, adminEmail);
    const isActualOwner = role === "owner" || isOwnerEmail(adminEmail ?? null);
    if (!isActualOwner) {
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "models.manage",
        resource_type: "model",
        resource_id: modelId,
        details: { model_id: modelId, enabled_target: enabled, rejected_by: adminUserId, status: "blocked_attempt" },
        result: "BLOCKED",
      });
      return { ok: false, message: "غير مصرح: إدارة النماذج متاحة لـ Owner فقط", error: "authorization_denied_non_owner", auditId: null };
    }
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
