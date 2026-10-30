"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";
import { recordAuditLog } from "@/app/admin/actions/audit-log-record";

export async function updatePlanLimits(input: {
  planKey: string;
  displayNameAr?: string;
  profileLimit?: number;
  messagesPer2h?: number;
  uploadsDaily?: number;
  maxFileSizeMB?: number;
  fileTypes?: string;
  videoAudioExclusive?: boolean;
  priceMonthly?: number;
  currency?: string;
  trialDays?: number;
  isActive?: boolean;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) throw new Error("غير مصرح");

  const allowed = await hasPermission(supabase, user.id, user.email ?? null, "plans.manage");
  if (!allowed) {
    await recordAuditLog({
      actor: user.id,
      actor_email: user.email ?? null,
      action: "plans.manage",
      resource_type: "plan",
      resource_id: input.planKey,
      details: { reason: "forbidden", attempted: input },
      result: "FAIL",
    }).catch(() => {});
    throw new Error("غير مصرح — صلاحية plans.manage مطلوبة (Owner فقط)");
  }

  const fileTypesArray = String(input.fileTypes ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const privileged = createServiceClient();
  try {
    const { error } = await privileged
      .from("subscription_plans")
      .update({
        display_name_ar: input.displayNameAr,
        profile_limit: input.profileLimit,
        messages_per_2h: input.messagesPer2h,
        uploads_daily: input.uploadsDaily,
        max_file_size_mb: input.maxFileSizeMB,
        file_types: fileTypesArray.length ? fileTypesArray : undefined,
        video_audio_exclusive: input.videoAudioExclusive,
         price_monthly: input.priceMonthly,
         currency: input.currency,
        trial_days: input.trialDays,
        is_active: input.isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("plan_key", input.planKey);

    if (error) throw new Error("فشل الحفظ: " + error.message);

    await recordAuditLog({
      actor: user.id,
      actor_email: user.email ?? null,
      action: "plans.manage",
      resource_type: "plan",
      resource_id: input.planKey,
      details: input,
      result: "PASS",
    }).catch(() => {});

    return { ok: true };
  } catch (e: any) {
    await recordAuditLog({
      actor: user.id,
      actor_email: user.email ?? null,
      action: "plans.manage",
      resource_type: "plan",
      resource_id: input.planKey,
      details: { reason: "db_write_failed", error: e?.message || String(e) },
      result: "FAIL",
    }).catch(() => {});
    throw new Error("خطأ في حفظ الخطة: " + (e?.message || String(e)));
  }
}