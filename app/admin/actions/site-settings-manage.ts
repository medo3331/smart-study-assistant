"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";
import { validateSiteSettings } from "@/lib/settings/validation";
import { recordAuditLog } from "./audit-log-record";

/**
 * حفظ إعدادات المنصة (Phase B1.6).
 *
 * ⚠️ الصلاحية `admins.manage` = Owner فقط (نفس بوابة صفحة /admin/settings).
 * التحقّق يحدث **قبل** أي كتابة، وكل تعديل يُسجَّل في `audit_log`.
 */

export type SiteSettingsActionResult = {
  ok: boolean;
  message: string;
  error?: string;
};

const ACTION = "admins.manage";
const RESOURCE_TYPE = "site_settings";

async function getSessionActor(): Promise<
  { userId: string; email: string | null } | { error: SiteSettingsActionResult }
> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return {
      error: { ok: false, message: "غير مصرح: لازم تسجيل دخول", error: "unauthenticated" },
    };
  }
  return { userId: user.id, email: user.email ?? null };
}

export async function saveSiteSettings(
  formData: FormData
): Promise<SiteSettingsActionResult> {
  try {
    const actor = await getSessionActor();
    if ("error" in actor) return actor.error;

    const db = createServiceClient();

    const allowed = await hasPermission(db, actor.userId, actor.email, ACTION);
    if (!allowed) {
      await recordAuditLog({
        actor: actor.userId,
        actor_email: actor.email,
        action: ACTION,
        resource_type: RESOURCE_TYPE,
        resource_id: RESOURCE_TYPE,
        details: { op: "update", reason: "authorization_denied" },
        result: "BLOCKED",
      });
      return {
        ok: false,
        message: "غير مصرح: إعدادات المنصة لمالك المنصة فقط",
        error: "authorization_denied",
      };
    }

    const check = validateSiteSettings({
      whatsappNumber: String(formData.get("whatsapp_number") ?? ""),
      whatsappTemplate: String(formData.get("whatsapp_template") ?? ""),
      defaultCurrency: String(formData.get("default_currency") ?? ""),
      subscriptionDurations: String(formData.get("subscription_durations") ?? ""),
    });

    if (!check.ok) {
      await recordAuditLog({
        actor: actor.userId,
        actor_email: actor.email,
        action: ACTION,
        resource_type: RESOURCE_TYPE,
        resource_id: RESOURCE_TYPE,
        details: { op: "update", reason: "validation_failed", errors: check.errors },
        result: "FAIL",
      });
      return {
        ok: false,
        message: "بيانات غير صالحة: " + check.errors.join(" · "),
        error: "validation_failed",
      };
    }

    const now = new Date().toISOString();
    const rows = Object.entries(check.normalized).map(([key, value]) => ({
      key,
      value,
      updated_by: actor.userId,
      updated_at: now,
    }));

    const { error } = await db
      .from("site_settings")
      .upsert(rows, { onConflict: "key" });

    if (error) {
      await recordAuditLog({
        actor: actor.userId,
        actor_email: actor.email,
        action: ACTION,
        resource_type: RESOURCE_TYPE,
        resource_id: RESOURCE_TYPE,
        details: { op: "update", reason: "db_upsert_failed", error: error.message },
        result: "FAIL",
      });
      return {
        ok: false,
        message: "فشل حفظ الإعدادات: " + error.message,
        error: "db_error",
      };
    }

    const auditRes = await recordAuditLog({
      actor: actor.userId,
      actor_email: actor.email,
      action: ACTION,
      resource_type: RESOURCE_TYPE,
      resource_id: RESOURCE_TYPE,
      details: {
        op: "update",
        keys: Object.keys(check.normalized),
        whatsapp_number: check.normalized.whatsapp_number,
        default_currency: check.normalized.default_currency,
        subscription_durations: check.normalized.subscription_durations,
      },
      result: "PASS",
    });

    return {
      ok: true,
      message: `تم حفظ إعدادات المنصة${auditRes.id ? ` (audit ${String(auditRes.id).slice(0, 8)})` : ""}`,
    };
  } catch (error) {
    return {
      ok: false,
      message: "خطأ غير متوقع: " + (error instanceof Error ? error.message : String(error)),
      error: "unexpected",
    };
  }
}
