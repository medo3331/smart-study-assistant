// ============================================================
// EPIC-3 — Subscription Management (View / Extend / Revoke)
// ============================================================

"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import { getAdminRole, isOwnerEmail } from "@/lib/auth-roles";

export interface SubscriptionStatus {
  user_id: string;
  user_email: string | null;
  user_display_name: string | null;
  user_code: string | null;
  public_user_code: string | null;
  current_plan_key: string | null;
  current_plan_name: string | null;
  activation_id: string | null;
  activation_created_at: string | null;
  activation_duration_days: number | null;
  activation_note: string | null;
  activation_activated_by: string | null;
  entitlement_expires_at: string | null;
  entitlement_kind: string | null;
  entitlement_value: string | null;
  messages_24h: number;
  uploads_today: number;
  quota_updated_at: string | null;
}

export async function getSubscriptionStatus(userIdOrCode: string): Promise<SubscriptionStatus | null> {
  const supabase = createServiceClient();
  try {
    // Try by UUID first
    let userRow: any = null;
    try {
      const { data } = await supabase.from("profiles").select("id, email, display_name, public_user_code").eq("id", userIdOrCode.trim()).maybeSingle();
      if (data) userRow = data;
    } catch {}

    // If not found, try by user_code (MAG-XXX-XXXX)
    if (!userRow) {
      const { data: codeRow } = await supabase.from("user_codes").select("user_id, code, is_active").eq("code", userIdOrCode.trim()).maybeSingle();
      if (codeRow) {
        const { data: profileData } = await supabase.from("profiles").select("id, email, display_name, public_user_code").eq("id", (codeRow as any).user_id).maybeSingle();
        if (profileData) userRow = { ...profileData, user_code: (codeRow as any).code };
      }
    }

    if (!userRow) return null;

    const userId = userRow.id;
    const userEmail = userRow.email;
    const userName = userRow.display_name;

    // Get current entitlement (plan)
    const { data: entitlementRow } = await supabase
      .from("entitlements")
      .select("kind, value, expires_at, metadata")
      .eq("user_id", userId)
      .eq("kind", "plan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get latest activation
    const { data: activationRow } = await supabase
      .from("subscription_activations")
      .select("id, user_code, user_id, plan_key, duration_days, activated_by, note, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get plan info
    let planName = "Free";
    const planKey = (entitlementRow as any)?.value || (activationRow as any)?.plan_key || "free";
    const { data: planData } = await supabase.from("subscription_plans").select("name, display_name_ar").eq("plan_key", planKey).maybeSingle();
    if (planData) planName = (planData as any).display_name_ar || (planData as any).name || planKey;

    // Get quota usage (simplified — real quota tracking requires additional logic)
    const { data: quotaRow } = await supabase.from("subscription_quotas").select("messages_24h, uploads_today, updated_at").eq("user_id", userId).maybeSingle();

    return {
      user_id: userId,
      user_email: userEmail,
      user_display_name: userName,
      user_code: (userRow as any).user_code || null,
      public_user_code: (userRow as any).public_user_code || null,
      current_plan_key: planKey,
      current_plan_name: planName,
      activation_id: (activationRow as any)?.id || null,
      activation_created_at: (activationRow as any)?.created_at || null,
      activation_duration_days: (activationRow as any)?.duration_days || null,
      activation_note: (activationRow as any)?.note || null,
      activation_activated_by: (activationRow as any)?.activated_by || null,
      entitlement_expires_at: (entitlementRow as any)?.expires_at || null,
      entitlement_kind: (entitlementRow as any)?.kind || null,
      entitlement_value: (entitlementRow as any)?.value || null,
      messages_24h: (quotaRow as any)?.messages_24h || 0,
      uploads_today: (quotaRow as any)?.uploads_today || 0,
      quota_updated_at: (quotaRow as any)?.updated_at || null,
    };
  } catch (e: any) {
    console.error("[subscription-manage] Error:", e?.message || e);
    return null;
  }
}

// ============================================================
// Phase 4.5 — تمديد اشتراك فعلي (كتب في subscription_activations
// + تمديد entitlements.expires_at + تسجيل audit_log إلزامي)
// ============================================================

export interface ExtendSubscriptionResult {
  ok: boolean;
  message: string;
  previousExpiry: string | null;
  newExpiry: string | null;
  entitlementExtended: boolean;
}

/**
 * تمديد اشتراك مستخدم — نفس درجة حماية activateSubscription: **Owner فقط**
 * (أي محاولة أخرى → BLOCKED صريح في audit_log مش مجرد رفض).
 *
 * المنطق (وقت التشغيل = الحين):
 * 1. فحص الدور: role === "owner" || isOwnerEmail — وإلا audit BLOCKED.
 * 2. تحديد المستخدم: UUID في profiles أو كود MAG في user_codes.
 * 3. لازم يبقى عند آخر تفعيل غير ملغٍ — مفيش اشتراك = FAIL صريح
 *    ("تمديد" مش "تفعيل جديد" — التفعيل شغله activateSubscription).
 * 4. الانتهاء السابق = latest.created_at + latest.duration_days (الجدول مالهوش
 *    عمود expires_at — الانتهاء محسوب، راجع db/epic2-admin-rbac-audit-schema.sql).
 * 5. صف التفعيل الجديد: duration_days = المتبقي (بصفر لو انتهى) + أيام التمديد.
 * 6. entitlements النشط: expires_at موجود = + أيام التمديد؛ NULL = امتياز دائم
 *    بدون تغيير (مُوثّق)؛ مفيش اشتراك نشط = بدون اختراع (entitlement_extended=false).
 * 7. audit_log: subscriptions.manage بالتفاصيل (old/new expiry + activation id).
 */
export async function extendSubscription(
  userIdOrCode: string,
  durationDays: number,
  note: string | null,
  adminUserId: string,
  adminEmail: string | null = null
): Promise<ExtendSubscriptionResult> {
  const lookup = (userIdOrCode || "").trim();
  const extraDays = Math.floor(durationDays);
  const auditBase = {
    actor: adminUserId,
    actor_email: adminEmail,
    action: "subscriptions.manage" as const,
    resource_type: "subscription",
    resource_id: lookup || null,
  };

  if (!lookup || !Number.isFinite(extraDays) || extraDays < 1 || extraDays > 365) {
    await recordAuditLog({
      ...auditBase,
      details: { op: "extend", lookup, duration_days: durationDays, reason: "invalid_input" },
      result: "FAIL",
    });
    return { ok: false, message: "بيانات غير صالحة: الكود/UUID أو المدة (1–365 يوم)", previousExpiry: null, newExpiry: null, entitlementExtended: false };
  }

  try {
    // ── 1) حماية Owner-only (نفس activateSubscription — مش مجرد إخفاء زر)
    const supabaseClient = createServiceClient();
    const role = await getAdminRole(supabaseClient, adminUserId, adminEmail);
    const isActualOwner = role === "owner" || isOwnerEmail(adminEmail ?? null);
    if (!isActualOwner) {
      await recordAuditLog({
        ...auditBase,
        details: { op: "extend", lookup, duration_days: extraDays, rejected_by: adminUserId, reason: "non_owner_attempt_rejected" },
        result: "BLOCKED",
      });
      return { ok: false, message: "غير مصرح: تمديد الاشتراكات متاح لـ Owner فقط", previousExpiry: null, newExpiry: null, entitlementExtended: false };
    }

    const db = createServiceClient();

    // ── 2) تحديد المستخدم: UUID ثم كود
    let userRow: { id: string; code: string | null } | null = null;
    const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lookup);
    if (uuidOk) {
      const { data } = await db.from("profiles").select("id, public_user_code").eq("id", lookup).maybeSingle();
      if (data) userRow = { id: (data as any).id, code: (data as any).public_user_code || null };
    }
    if (!userRow) {
      const { data: codeRow } = await db.from("user_codes").select("code, user_id, is_active").eq("code", lookup).maybeSingle();
      if (codeRow && (codeRow as any).is_active) {
        userRow = { id: (codeRow as any).user_id, code: (codeRow as any).code };
      }
    }
    if (!userRow) {
      await recordAuditLog({
        ...auditBase,
        details: { op: "extend", lookup, reason: "user_not_found_or_code_inactive" },
        result: "FAIL",
      });
      return { ok: false, message: "المستخدم غير موجود أو الكود غير نشط", previousExpiry: null, newExpiry: null, entitlementExtended: false };
    }
    // ── 3) آخر تفعيل غير ملغٍ (لازم يوجد — التمديد مش تفعيل جديد)
    const { data: latest } = await db
      .from("subscription_activations")
      .select("id, user_code, plan_key, duration_days, created_at, note")
      .eq("user_id", userRow.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latest) {
      await recordAuditLog({
        ...auditBase,
        resource_id: userRow.code || userRow.id,
        details: { op: "extend", user_id: userRow.id, reason: "no_active_activation_to_extend" },
        result: "FAIL",
      });
      return { ok: false, message: "مفيش اشتراك نشط يُمدَّد — فعّل اشتراك أولًا (التفعيل اليدوي بالأسفل)", previousExpiry: null, newExpiry: null, entitlementExtended: false };
    }

    // يجب أن يملك كودًا (subscription_activations.user_code FK NOT NULL)
    const userCode = userRow.code || (latest as any).user_code;
    if (!userCode) {
      await recordAuditLog({
        ...auditBase,
        resource_id: userRow.id,
        details: { op: "extend", user_id: userRow.id, reason: "user_has_no_user_code" },
        result: "FAIL",
      });
      return { ok: false, message: "المستخدم مالهوش user_code مرتبط (مطلوب لصف التفعيل)", previousExpiry: null, newExpiry: null, entitlementExtended: false };
    }

    // ── 4) الانتهاء السابق = created_at + duration_days
    const prevCreated = new Date((latest as any).created_at as string);
    const prevExpiryMs = prevCreated.getTime() + (latest as any).duration_days * 86400_000;
    const nowMs = Date.now();
    const remainingDays = prevExpiryMs > nowMs ? Math.ceil((prevExpiryMs - nowMs) / 86400_000) : 0;
    const newDuration = remainingDays + extraDays;
    const newExpiryMs = nowMs + newDuration * 86400_000;
    const previousExpiryIso = new Date(prevExpiryMs).toISOString();
    const newExpiryIso = new Date(newExpiryMs).toISOString();

    // ── 5) صف التفعيل الجديد (التسجيل داخل subscription_activations زي ما طُلب)
    const extendNote = `تمديد +${extraDays} يوم (متبقٍ ${remainingDays}) — ${note || "من لوحة التحكم"}`;
    const { data: newRow, error: insertErr } = await db
      .from("subscription_activations")
      .insert({
        user_code: userCode,
        user_id: userRow.id,
        plan_key: (latest as any).plan_key,
        duration_days: newDuration,
        activated_by: adminUserId,
        note: extendNote,
      })
      .select("id")
      .single();

    if (insertErr) {
      await recordAuditLog({
        ...auditBase,
        resource_id: userCode,
        details: { op: "extend", user_id: userRow.id, plan_key: (latest as any).plan_key, reason: "insert_failed", error: insertErr.message },
        result: "FAIL",
      });
      return { ok: false, message: "فشل تسجيل التمديد: " + insertErr.message, previousExpiry: previousExpiryIso, newExpiry: null, entitlementExtended: false };
    }
    // ── 6) تمديد entitlement النشط (best-effort موثّق — مش اختراع امتيازات)
    let entitlementExtended = false;
    let entitlementNote = "no_active_entitlement";
    const { data: ent } = await db
      .from("entitlements")
      .select("id, value, expires_at")
      .eq("user_id", userRow.id)
      .eq("kind", "plan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ent) {
      if ((ent as any).expires_at == null) {
        // امتياز دائم (expires_at NULL) — التمديد ما لهش معنى، بدون تغيير
        entitlementNote = "permanent_entitlement_unchanged";
      } else {
        const entMs = new Date((ent as any).expires_at as string).getTime();
        const baseMs = entMs > nowMs ? entMs : nowMs; // من الانتهاء الحالي أو من الآن لو انتهى
        const targetIso = new Date(baseMs + extraDays * 86400_000).toISOString();
        const { error: updErr } = await db
          .from("entitlements")
          .update({ expires_at: targetIso })
          .eq("id", (ent as any).id);
        if (!updErr) {
          entitlementExtended = true;
          entitlementNote = `extended:${(ent as any).expires_at}→${targetIso}`;
        } else {
          entitlementNote = "update_failed:" + updErr.message;
        }
      }
    }

    // ── 7) audit PASS بالتفاصيل الكاملة
    const audit = await recordAuditLog({
      ...auditBase,
      resource_id: userCode,
      details: {
        op: "extend",
        user_id: userRow.id,
        plan_key: (latest as any).plan_key,
        previous_activation_id: (latest as any).id,
        new_activation_id: (newRow as any)?.id || null,
        extra_days: extraDays,
        remaining_days: remainingDays,
        new_duration_days: newDuration,
        previous_expiry: previousExpiryIso,
        new_expiry: newExpiryIso,
        entitlement_extended: entitlementExtended,
        entitlement_note: entitlementNote,
        note: note || null,
      },
      result: "PASS",
    });

    return {
      ok: true,
      message: `تم التمديد ${extraDays} يوم — الانتهاء من ${previousExpiryIso.slice(0, 10)} إلى ${newExpiryIso.slice(0, 10)}${entitlementExtended ? " + تمديد entitlement" : ` (${entitlementNote})`}${audit.error ? " — ⚠️ فشل تسجيل audit" : ""}`,
      previousExpiry: previousExpiryIso,
      newExpiry: newExpiryIso,
      entitlementExtended,
    };
  } catch (e: any) {
    await recordAuditLog({
      ...auditBase,
      details: { op: "extend", lookup, reason: "unexpected_error" },
      result: "FAIL",
    });
    return { ok: false, message: "خطأ غير متوقع أثناء التمديد", previousExpiry: null, newExpiry: null, entitlementExtended: false };
  }
}
