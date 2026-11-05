"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createPlan, updatePlan, deletePlan, togglePlanActive } from "./plans-manage";
import type { PlanInput, PlanActionResult } from "./plans-manage";

type ActionResult = { ok: boolean; message: string; auditId?: string; error?: string };

async function getSessionActor(): Promise<{ userId: string; email: string | null } | { error: ActionResult }> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return { error: { ok: false, message: "غير مصرح: لازم تسجيل دخول", error: "unauthenticated" } };
  }
  return { userId: user.id, email: user.email ?? null };
}

function toResult(res: PlanActionResult): ActionResult {
  return { ok: res.ok, message: res.message, auditId: res.auditId || undefined, error: res.error || undefined };
}

function parseFeatures(raw: string): string[] {
  return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}

export async function createPlanFormAction(formData: FormData): Promise<ActionResult> {
  const actor = await getSessionActor();
  if ("error" in actor) return actor.error;

  const input: PlanInput = {
    plan_key: String(formData.get("plan_key") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    display_name_ar: String(formData.get("display_name_ar") ?? "").trim() || null,
    price: Number(formData.get("price")),
    original_price: formData.get("original_price") ? Number(formData.get("original_price")) : null,
    discount_percentage: formData.get("discount_percentage") ? Number(formData.get("discount_percentage")) : 0,
    credits_monthly: formData.get("credits_monthly") ? Number(formData.get("credits_monthly")) : 0,
    profile_limit: Number(formData.get("profile_limit")),
    messages_per_2h: Number(formData.get("messages_per_2h")),
    messages_daily: formData.get("messages_daily") ? Number(formData.get("messages_daily")) : null,
    messages_monthly: formData.get("messages_monthly") ? Number(formData.get("messages_monthly")) : null,
    uploads_daily: Number(formData.get("uploads_daily")),
    max_file_size_mb: Number(formData.get("max_file_size_mb")),
    file_types: String(formData.get("file_types") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    video_audio_exclusive: formData.get("video_audio_exclusive") === "on",
    trial_days: Number(formData.get("trial_days") ?? 0),
    is_active: formData.get("is_active") === "on",
    is_popular: formData.get("is_popular") === "on",
    features: parseFeatures(String(formData.get("features") ?? "")),
  };

  if (!input.plan_key || !input.name) {
    return { ok: false, message: "معرّف الخطة والاسم مطلوبان", error: "missing_fields" };
  }

  const res = await createPlan(input, actor.userId, actor.email);
  return toResult(res);
}

export async function updatePlanFormAction(formData: FormData): Promise<ActionResult> {
  const actor = await getSessionActor();
  if ("error" in actor) return actor.error;

  const planKey = String(formData.get("plan_key") ?? "").trim();
  const input: PlanInput = {
    plan_key: planKey,
    name: String(formData.get("name") ?? "").trim(),
    display_name_ar: String(formData.get("display_name_ar") ?? "").trim() || null,
    price: Number(formData.get("price")),
    original_price: formData.get("original_price") ? Number(formData.get("original_price")) : null,
    discount_percentage: formData.get("discount_percentage") ? Number(formData.get("discount_percentage")) : 0,
    credits_monthly: formData.get("credits_monthly") ? Number(formData.get("credits_monthly")) : 0,
    profile_limit: Number(formData.get("profile_limit")),
    messages_per_2h: Number(formData.get("messages_per_2h")),
    messages_daily: formData.get("messages_daily") ? Number(formData.get("messages_daily")) : null,
    messages_monthly: formData.get("messages_monthly") ? Number(formData.get("messages_monthly")) : null,
    uploads_daily: Number(formData.get("uploads_daily")),
    max_file_size_mb: Number(formData.get("max_file_size_mb")),
    file_types: String(formData.get("file_types") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    video_audio_exclusive: formData.get("video_audio_exclusive") === "on",
    trial_days: Number(formData.get("trial_days") ?? 0),
    is_active: formData.get("is_active") === "on",
    is_popular: formData.get("is_popular") === "on",
    features: parseFeatures(String(formData.get("features") ?? "")),
  };

  const res = await updatePlan(planKey, input, actor.userId, actor.email);
  return toResult(res);
}

export async function deletePlanFormAction(formData: FormData): Promise<ActionResult> {
  const actor = await getSessionActor();
  if ("error" in actor) return actor.error;
  const planKey = String(formData.get("plan_key") ?? "").trim();
  const res = await deletePlan(planKey, actor.userId, actor.email);
  return toResult(res);
}

export async function togglePlanActiveFormAction(formData: FormData): Promise<ActionResult> {
  const actor = await getSessionActor();
  if ("error" in actor) return actor.error;
  const planKey = String(formData.get("plan_key") ?? "").trim();
  const active = formData.get("active") === "true";
  const res = await togglePlanActive(planKey, active, actor.userId, actor.email);
  return toResult(res);
}
