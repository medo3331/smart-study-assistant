"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";
import { recordAuditLog } from "@/app/admin/actions/audit-log-record";

const FREE_KEY = "billing_free_period_enabled";
const PAY_KEY = "billing_payments_enabled";

function safeBool(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  const s = String(raw).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

export async function readBillingSettings() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("app_settings").select("key,value").in("key", [FREE_KEY, PAY_KEY]);
    if (error || !data || data.length === 0) {
      return { freePeriodEnabled: true, paymentsEnabled: false, source: "default" };
    }
    const byKey = new Map((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
    const freeRaw = byKey.get(FREE_KEY) ?? null;
    const freeExplicit = freeRaw !== null;
    return {
      freePeriodEnabled: freeExplicit ? safeBool(freeRaw) : true,
      paymentsEnabled: safeBool(byKey.get(PAY_KEY) ?? null),
      source: "db",
    };
  } catch {
    return { freePeriodEnabled: true, paymentsEnabled: false, source: "fallback-safe" };
  }
}

export async function updateBillingSettings(
  input: { freePeriodEnabled?: boolean; paymentsEnabled?: boolean }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) throw new Error("غير مصرح");

  // Phase 1.5 — إغلاق فجوة أمنية: كانت بتقبل أي مستخدم عنده entitlement
  // "premium" كبديل عن فحص الدور، يعني أي مشترك مدفوع يقدر يقلب إعدادات
  // الفواتير العامة للمنصة كلها. دلوقتي: صلاحية plans.manage فقط
  // (Owner حسب ADMIN_PERMISSION_MAP) + تسجيل إجباري في audit_log.
  const allowed = await hasPermission(supabase, user.id, user.email ?? null, "plans.manage");
  if (!allowed) {
    await recordAuditLog({
      actor: user.id,
      actor_email: user.email ?? null,
      action: "plans.manage",
      resource_type: "billing_settings",
      resource_id: "app_settings",
      details: { reason: "forbidden", attempted: input },
      result: "FAIL",
    }).catch(() => {});
    throw new Error("غير مصرح — صلاحية plans.manage مطلوبة (Owner فقط)");
  }

  const freeVal = input.freePeriodEnabled === undefined ? true : Boolean(input.freePeriodEnabled);
  const payVal = input.paymentsEnabled === undefined ? false : Boolean(input.paymentsEnabled);

  try {
    // PRIVILEGED server-only client — bypasses RLS, server-only, never exported to browser
    const privileged = createServiceClient();
    for (const [key, value] of [[FREE_KEY, String(freeVal)], [PAY_KEY, String(payVal)]]) {
      const { error } = await privileged.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }).select();
      if (error) throw new Error("فشل الحفظ: " + error.message);
    }
    await recordAuditLog({
      actor: user.id,
      actor_email: user.email ?? null,
      action: "plans.manage",
      resource_type: "billing_settings",
      resource_id: "app_settings",
      details: { freePeriodEnabled: freeVal, paymentsEnabled: payVal },
      result: "PASS",
    }).catch(() => {});
    return { ok: true, freePeriodEnabled: freeVal, paymentsEnabled: payVal };
  } catch (e: any) {
    await recordAuditLog({
      actor: user.id,
      actor_email: user.email ?? null,
      action: "plans.manage",
      resource_type: "billing_settings",
      resource_id: "app_settings",
      details: { reason: "db_write_failed", error: e?.message || String(e) },
      result: "FAIL",
    }).catch(() => {});
    throw new Error("خطأ في حفظ الإعدادات: " + (e?.message || String(e)));
  }
}
