"use server";

import { toggleModelStatus } from "./ai-models";

export async function toggleModelFormAction(formData: FormData): Promise<{ ok: boolean; message: string; auditId?: string; error?: string }> {
  const modelId = formData.get("model_id") as string;
  const enabledTarget = formData.get("target_enabled") === "true";
  const adminId = (formData.get("admin_user_id") as string) || "";
  const adminEmail = (formData.get("admin_email") as string) || null;
  const res = await toggleModelStatus(modelId, enabledTarget, adminId, adminEmail);
  return {
    ok: res.ok,
    message: res.message,
    auditId: res.auditId || undefined,
    error: res.error || undefined,
  };
}
