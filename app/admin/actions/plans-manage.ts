"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { resolveActor } from "@/lib/policy";
import { recordAuditLog } from "./audit-log-record";
import { hasPermission } from "@/lib/auth-roles";
import { validatePlanInput } from "@/lib/plans/validation";

export interface PlanInput {
  plan_key: string;
  name: string;
  display_name_ar?: string | null;
  price: number;
  original_price?: number | null;
  discount_percentage?: number | null;
  /** Phase B1 — الكريدت الشهري للباقة (db/27). */
  credits_monthly?: number | null;
  profile_limit: number;
  messages_per_2h: number;
  /** Phase B1 — الحدود اليومية/الشهرية الموجودة في subscription_plans. */
  messages_daily?: number | null;
  messages_monthly?: number | null;
  uploads_daily: number;
  max_file_size_mb: number;
  file_types?: string[] | null;
  video_audio_exclusive?: boolean;
  trial_days?: number;
  is_active?: boolean;
  is_popular?: boolean;
  features: string[];
}

export interface PlanActionResult {
  ok: boolean;
  message: string;
  auditId?: string | null;
  error?: string | null;
}

const ACTION = "plans.manage";

async function guard(actorId: string, actorEmail: string | null, resourceId: string, details: Record<string, unknown>) {
  const db = createServiceClient();
  const actor = await resolveActor(db, actorId, actorEmail);
  const allowed = await hasPermission(db, actorId, actorEmail, "plans.manage");
  if (!allowed) {
    await recordAuditLog({
      actor: actorId,
      actor_email: actorEmail,
      action: ACTION,
      resource_type: "plan",
      resource_id: resourceId,
      details: { ...details, rejected_by: actorId, status: "blocked_attempt" },
      result: "BLOCKED",
    });
    return { ok: false as const, denied: true as const, db, actor };
  }
  return { ok: true as const, denied: false as const, db, actor };
}

export async function listPlans(actorId: string, actorEmail: string | null) {
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("subscription_plans")
      .select("plan_key, name, display_name_ar, price, original_price, discount_percentage, credits_monthly, profile_limit, messages_per_2h, messages_daily, messages_monthly, uploads_daily, max_file_size_mb, file_types, video_audio_exclusive, trial_days, is_active, is_popular, features")
      .order("plan_key", { ascending: true });
    if (error) throw error;
    return { ok: true, data: data ?? [], error: null };
  } catch (e: any) {
    return { ok: false, data: [], error: e?.message || String(e) };
  }
}
export async function createPlan(input: PlanInput, actorId: string, actorEmail: string | null): Promise<PlanActionResult> {
  try {
    const g = await guard(actorId, actorEmail, input.plan_key, { op: "create", plan_key: input.plan_key });
    if (g.denied) return { ok: false, message: "غير مصرح: إدارة الخطط متاحة لـ Owner فقط", error: "authorization_denied", auditId: null };

    // تحقّق خادم قبل أي كتابة — أي طلب يمكن أن يصل بدون النموذج.
    const check = validatePlanInput(input);
    if (!check.ok) {
      await recordAuditLog({ actor: actorId, actor_email: actorEmail, action: ACTION, resource_type: "plan", resource_id: input.plan_key, details: { op: "create", reason: "validation_failed", errors: check.errors }, result: "FAIL" });
      return { ok: false, message: "بيانات غير صالحة: " + check.errors.join(" · "), error: "validation_failed", auditId: null };
    }

    const { error } = await g.db.from("subscription_plans").insert({
      plan_key: input.plan_key,
      name: input.name,
      display_name_ar: input.display_name_ar ?? null,
      price: input.price,
      original_price: input.original_price ?? null,
      discount_percentage: input.discount_percentage ?? 0,
      credits_monthly: input.credits_monthly ?? 0,
      profile_limit: input.profile_limit,
      messages_per_2h: input.messages_per_2h,
      messages_daily: input.messages_daily ?? 20,
      messages_monthly: input.messages_monthly ?? 300,
      uploads_daily: input.uploads_daily,
      max_file_size_mb: input.max_file_size_mb,
      file_types: input.file_types ?? null,
      video_audio_exclusive: input.video_audio_exclusive ?? false,
      trial_days: input.trial_days ?? 0,
      is_active: input.is_active ?? true,
      is_popular: input.is_popular ?? false,
      features: input.features ?? [],
    });

    if (error) {
      await recordAuditLog({ actor: actorId, actor_email: actorEmail, action: ACTION, resource_type: "plan", resource_id: input.plan_key, details: { op: "create", reason: "db_insert_failed", error: error.message }, result: "FAIL" });
      return { ok: false, message: "فشل إضافة الخطة: " + error.message, error: error.message, auditId: null };
    }

    if (input.is_popular) {
      await g.db.from("subscription_plans").update({ is_popular: false }).neq("plan_key", input.plan_key).eq("is_popular", true);
    }

    const auditRes = await recordAuditLog({ actor: actorId, actor_email: actorEmail, action: ACTION, resource_type: "plan", resource_id: input.plan_key, details: { op: "create", plan_key: input.plan_key, price: input.price }, result: "PASS" });
    return { ok: true, message: `تم إضافة الخطة (${input.plan_key})`, auditId: auditRes.id || null };
  } catch (e: any) {
    return { ok: false, message: "خطأ غير متوقع: " + (e?.message || String(e)), error: String(e), auditId: null };
  }
}

export async function updatePlan(planKey: string, input: PlanInput, actorId: string, actorEmail: string | null): Promise<PlanActionResult> {
  try {
    const g = await guard(actorId, actorEmail, planKey, { op: "update", plan_key: planKey });
    if (g.denied) return { ok: false, message: "غير مصرح: إدارة الخطط متاحة لـ Owner فقط", error: "authorization_denied", auditId: null };

    const check = validatePlanInput(input);
    if (!check.ok) {
      await recordAuditLog({ actor: actorId, actor_email: actorEmail, action: ACTION, resource_type: "plan", resource_id: planKey, details: { op: "update", reason: "validation_failed", errors: check.errors }, result: "FAIL" });
      return { ok: false, message: "بيانات غير صالحة: " + check.errors.join(" · "), error: "validation_failed", auditId: null };
    }

    const { error } = await g.db.from("subscription_plans").update({
      name: input.name,
      display_name_ar: input.display_name_ar ?? null,
      price: input.price,
      original_price: input.original_price ?? null,
      discount_percentage: input.discount_percentage ?? 0,
      credits_monthly: input.credits_monthly ?? 0,
      profile_limit: input.profile_limit,
      messages_per_2h: input.messages_per_2h,
      messages_daily: input.messages_daily ?? 20,
      messages_monthly: input.messages_monthly ?? 300,
      uploads_daily: input.uploads_daily,
      max_file_size_mb: input.max_file_size_mb,
      file_types: input.file_types ?? null,
      video_audio_exclusive: input.video_audio_exclusive ?? false,
      trial_days: input.trial_days ?? 0,
      is_active: input.is_active ?? true,
      is_popular: input.is_popular ?? false,
      features: input.features ?? [],
    }).eq("plan_key", planKey);

    if (error) {
      await recordAuditLog({ actor: actorId, actor_email: actorEmail, action: ACTION, resource_type: "plan", resource_id: planKey, details: { op: "update", reason: "db_update_failed", error: error.message }, result: "FAIL" });
      return { ok: false, message: "فشل تحديث الخطة: " + error.message, error: error.message, auditId: null };
    }

    if (input.is_popular) {
      await g.db.from("subscription_plans").update({ is_popular: false }).neq("plan_key", planKey).eq("is_popular", true);
    }

    const auditRes = await recordAuditLog({ actor: actorId, actor_email: actorEmail, action: ACTION, resource_type: "plan", resource_id: planKey, details: { op: "update", price: input.price, discount: input.discount_percentage }, result: "PASS" });
    return { ok: true, message: `تم تحديث الخطة (${planKey})`, auditId: auditRes.id || null };
  } catch (e: any) {
    return { ok: false, message: "خطأ غير متوقع: " + (e?.message || String(e)), error: String(e), auditId: null };
  }
}

export async function deletePlan(planKey: string, actorId: string, actorEmail: string | null): Promise<PlanActionResult> {
  try {
    const g = await guard(actorId, actorEmail, planKey, { op: "delete", plan_key: planKey });
    if (g.denied) return { ok: false, message: "غير مصرح: إدارة الخطط متاحة لـ Owner فقط", error: "authorization_denied", auditId: null };

    const { count } = await g.db.from("subscription_activations").select("id", { count: "exact", head: true }).eq("plan_key", planKey);
    if (count && count > 0) {
      await recordAuditLog({ actor: actorId, actor_email: actorEmail, action: ACTION, resource_type: "plan", resource_id: planKey, details: { op: "delete", reason: "has_activations", count }, result: "FAIL" });
      return { ok: false, message: "لا يمكن حذف الخطة لوجود تفعيلات مرتبطة بها. عطّلها بدلاً من ذلك.", error: "has_activations", auditId: null };
    }

    const { error } = await g.db.from("subscription_plans").delete().eq("plan_key", planKey);
    if (error) {
      await recordAuditLog({ actor: actorId, actor_email: actorEmail, action: ACTION, resource_type: "plan", resource_id: planKey, details: { op: "delete", reason: "db_delete_failed", error: error.message }, result: "FAIL" });
      return { ok: false, message: "فشل حذف الخطة: " + error.message, error: error.message, auditId: null };
    }
    const auditRes = await recordAuditLog({ actor: actorId, actor_email: actorEmail, action: ACTION, resource_type: "plan", resource_id: planKey, details: { op: "delete" }, result: "PASS" });
    return { ok: true, message: `تم حذف الخطة (${planKey})`, auditId: auditRes.id || null };
  } catch (e: any) {
    return { ok: false, message: "خطأ غير متوقع: " + (e?.message || String(e)), error: String(e), auditId: null };
  }
}

export async function togglePlanActive(planKey: string, active: boolean, actorId: string, actorEmail: string | null): Promise<PlanActionResult> {
  try {
    const g = await guard(actorId, actorEmail, planKey, { op: "toggle_active", plan_key: planKey, target: active });
    if (g.denied) return { ok: false, message: "غير مصرح", error: "authorization_denied", auditId: null };
    const { error } = await g.db.from("subscription_plans").update({ is_active: active }).eq("plan_key", planKey);
    if (error) {
      await recordAuditLog({ actor: actorId, actor_email: actorEmail, action: ACTION, resource_type: "plan", resource_id: planKey, details: { op: "toggle_active", reason: "db_update_failed", error: error.message }, result: "FAIL" });
      return { ok: false, message: "فشل التحديث: " + error.message, error: error.message, auditId: null };
    }
    const auditRes = await recordAuditLog({ actor: actorId, actor_email: actorEmail, action: ACTION, resource_type: "plan", resource_id: planKey, details: { op: "toggle_active", is_active: active }, result: "PASS" });
    return { ok: true, message: `تم ${active ? "تفعيل" : "تعطيل"} الخطة (${planKey})`, auditId: auditRes.id || null };
  } catch (e: any) {
    return { ok: false, message: "خطأ غير متوقع: " + (e?.message || String(e)), error: String(e), auditId: null };
  }
}

