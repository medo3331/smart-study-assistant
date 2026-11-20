// ============================================================
// EPIC-2 / Subscriptions — Manual Activation (Server Action)
// Created 2026-09-19 — requires DB tables: user_codes, subscription_plans, subscription_activations, audit_log
// ============================================================

"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/admin/audit-log-record";
import { isUuid } from "@/lib/credits/grants";
import { requireAdminActor } from "@/lib/admin/action-guard";

export interface SubscriptionActivationInput {
  recipientUserId?: string; // canonical UUID from profiles/auth.users
  email?: string;          // البريد الإلكتروني — يُحلّ لـ UUID سيرفر-side (يُفضّل)
  userCode?: string;       // MAG-XXXX (اختياري، للتوافق مع الاستدعاءات القديمة)
  planKey: string;           // free | pro | ultra
  durationDays: number;      // 1..365 days
  note?: string;             // admin note (payment method, etc.)
}

export interface SubscriptionActivationResult {
  ok: boolean;
  message: string;
  activationId?: string | null;
  auditId?: string | null;
  userId?: string | null;
  error?: string | null;
}

/** تفعيل اشتراك يدوي عبر User Code — يسجل في subscription_activations + audit_log */
export async function activateSubscription(
  input: SubscriptionActivationInput
): Promise<SubscriptionActivationResult> {
  try {
    // ⚠️ الهوية من الجلسة. قبل كده كانت adminUserId/adminEmail باراميترات،
    // فأي حد يبعت id المالك ويعدّي فحص الـOwner.
    const { actor } = await requireAdminActor("subscriptions.manage");
    const adminUserId = actor.userId!;
    const adminEmail = actor.userEmail;

    // Effective subscriptions.manage includes Owner/Admin; the server guard is authoritative.
    if (!actor.isOwner && actor.role !== "admin") {
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "subscriptions.manage",
        resource_type: "subscription",
        resource_id: input.recipientUserId?.trim() ?? input.userCode?.trim() ?? null,
        details: { user_id: input.recipientUserId?.trim() ?? null, user_code: input.userCode?.trim() ?? null, plan_key: input.planKey, rejected_by: adminUserId, reason: "role_not_allowed" },
        result: "BLOCKED",
      });
      return { ok: false, message: "غير مصرح: دورك لا يسمح بإدارة الاشتراكات", error: "authorization_denied_role", activationId: null, auditId: null, userId: null };
    }

    const privileged = createServiceClient();
    if (!["free", "pro", "ultra"].includes(input.planKey) || !Number.isInteger(input.durationDays) || input.durationDays < 1 || input.durationDays > 365) {
      return { ok: false, message: "بيانات غير صالحة: اختر خطة معتمدة ومدة من 1 إلى 365 يومًا", error: "invalid_input" };
    }

    // UUID is canonical. Email and MAG codes remain compatibility lookup options.
    const recipientEmail = (input.email ?? "").trim().toLowerCase();
    let recipientUserId: string | null = null;
    let recipientCode: string | null = null;

    if (input.recipientUserId) {
      const requestedId = input.recipientUserId.trim();
      if (!isUuid(requestedId)) return { ok: false, message: "معرّف المستخدم ليس UUID صالحًا", error: "invalid_user_id" };
      const { data: profileRow } = await privileged.from("profiles").select("id, public_user_code").eq("id", requestedId).maybeSingle();
      if (profileRow) {
        recipientUserId = String((profileRow as { id: string }).id);
        recipientCode = (profileRow as { public_user_code?: string | null }).public_user_code ?? null;
      }
    }

    if (!recipientUserId && recipientEmail) {
      const { data: profileRow } = await privileged
        .from("profiles")
        .select("id, public_user_code")
        .eq("email", recipientEmail)
        .maybeSingle();
      recipientUserId = (profileRow as { id?: string } | null)?.id ?? null;
      recipientCode = (profileRow as { public_user_code?: string | null } | null)?.public_user_code ?? null;
      if (!recipientUserId) {
        try {
          let page = 1;
          const perPage = 200;
          while (!recipientUserId) {
            const { data } = await privileged.auth.admin.listUsers({ page, perPage });
            const users = data?.users ?? [];
            recipientUserId = users.find((u) => (u.email ?? "").toLowerCase() === recipientEmail)?.id ?? null;
            if (!users.length || users.length < perPage) break;
            page++;
            if (page > 50) break;
          }
        } catch { }
      }
    }
    if (!recipientUserId && input.userCode) {
      const { data: codeRow } = await privileged.from("user_codes").select("user_id, code, is_active").eq("code", input.userCode.trim()).maybeSingle();
      if (codeRow && (codeRow as { is_active?: boolean }).is_active) {
        recipientUserId = (codeRow as { user_id?: string }).user_id ?? null;
        recipientCode = (codeRow as { code?: string }).code ?? input.userCode.trim();
      }
      if (!recipientUserId) {
        const { data: byPublic } = await privileged.from("profiles").select("id, public_user_code").eq("public_user_code", input.userCode.trim()).maybeSingle();
        recipientUserId = (byPublic as { id?: string } | null)?.id ?? null;
        recipientCode = (byPublic as { public_user_code?: string | null } | null)?.public_user_code ?? null;
      }
    }
    if (recipientUserId && input.recipientUserId && recipientUserId !== input.recipientUserId.trim()) {
      await recordAuditLog({ actor: adminUserId, actor_email: adminEmail, action: "subscriptions.manage", resource_type: "subscription", resource_id: recipientUserId, details: { requested_user_id: input.recipientUserId, resolved_user_id: recipientUserId, reason: "recipient_id_mismatch" }, result: "BLOCKED" });
      return { ok: false, message: "تعذر التحقق من تطابق المستخدم", error: "recipient_id_mismatch" };
    }
    if (!input.recipientUserId && recipientUserId && input.userCode && recipientCode && recipientCode !== input.userCode.trim()) {
      await recordAuditLog({ actor: adminUserId, actor_email: adminEmail, action: "subscriptions.manage", resource_type: "subscription", resource_id: recipientUserId, details: { user_id: recipientUserId, user_code: input.userCode.trim(), reason: "recipient_code_mismatch" }, result: "BLOCKED" });
      return { ok: false, message: "كود المستخدم لا يطابق الحساب المحدد", error: "recipient_code_mismatch" };
    }

    if (!recipientUserId) {
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "subscriptions.manage",
        resource_type: "subscription",
        resource_id: (recipientEmail || input.userCode?.trim()) ?? null,
        details: {
          recipient_email: recipientEmail || null,
          user_code: input.userCode?.trim() || null,
          plan_key: input.planKey,
          reason: "recipient_not_found",
        },
        result: "FAIL",
      });
      return {
        ok: false,
        message: recipientEmail
          ? `الإيميل غير موجود: ${recipientEmail}`
          : input.userCode
            ? `كود المستخدم غير موجود: ${input.userCode.trim()}`
            : "حدد المستلم: البريد الإلكتروني أو كود المستخدم",
        error: "recipient_not_found",
        activationId: null,
        auditId: null,
        userId: null,
      };
    }

    const userId = recipientUserId;

    // subscription_activations.user_code has a real FK; resolve a code linked to the UUID.
    const requestedCode = input.recipientUserId ? "" : (input.userCode ?? "").trim();
    let codeQuery = privileged.from("user_codes").select("code, user_id, is_active").eq("user_id", userId).eq("is_active", true);
    if (requestedCode) codeQuery = codeQuery.eq("code", requestedCode);
    const { data: codeRow, error: codeError } = await codeQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (codeError || !codeRow?.code || codeRow.user_id !== userId) {
      await recordAuditLog({ actor: adminUserId, actor_email: adminEmail, action: "subscriptions.manage", resource_type: "subscription", resource_id: userId, details: { user_id: userId, user_code: requestedCode || recipientCode, reason: requestedCode ? "invalid_or_inactive_user_code" : "recipient_has_no_active_user_code" }, result: "FAIL" });
      return { ok: false, message: requestedCode ? "كود المستخدم غير موجود أو غير نشط لهذا الحساب" : "لا يوجد كود MAG نشط مرتبط بهذا الحساب", error: requestedCode ? "invalid_user_code" : "user_code_required" };
    }
    const activationCode = String(codeRow.code);

    // 2. Verify plan exists
    const { data: planRow, error: planError } = await privileged
      .from("subscription_plans")
      .select("plan_key, name, profile_limit, messages_per_2h, uploads_daily, max_file_size_mb, video_audio_exclusive, is_active")
      .eq("plan_key", input.planKey)
      .eq("is_active", true)
      .single();

    if (planError || !planRow) {
      return { ok: false, message: "الخطة غير موجودة أو غير نشطة", error: "invalid_plan" };
    }

    // 3. Check for existing active subscription (optional: allow multiple or extend)
    // Per spec: manual activation creates a new activation record.
    // We'll insert a new one (manual override) — if user wants to extend, they can do it manually via admin note.

    // 4. Insert activation record
    const { data: activationData, error: activationError } = await privileged
      .from("subscription_activations")
      .insert({
        user_code: activationCode,
        user_id: userId,
        plan_key: input.planKey,
        duration_days: input.durationDays,
        activated_by: adminUserId,
        note: input.note || "تفعيل يدوي عبر لوحة التحكم",
      })
      .select("id")
      .single();

    if (activationError) {
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "subscriptions.manage",
        resource_type: "subscription",
        resource_id: userId,
        details: { user_id: userId, user_code: activationCode, plan_key: input.planKey, duration_days: input.durationDays, reason: "db_insert_failed" },
        result: "FAIL",
      });
      return { ok: false, message: "فشل تسجيل التفعيل: " + activationError.message, error: activationError.message, activationId: null };
    }

    const activationId = (activationData as any)?.id || null;

    // ── Insert entitlement so quota-check & profile reflect the new plan ──
    try {
      const expiresAt = new Date(Date.now() + (input.durationDays || 0) * 86400_000).toISOString();
      // Revoke any prior active plan entitlements
      await privileged.from("entitlements").update({ expires_at: new Date().toISOString() }).eq("user_id", userId).eq("kind", "plan").is("expires_at", null);
      await privileged.from("entitlements").update({ expires_at: new Date().toISOString() }).eq("user_id", userId).eq("kind", "plan").gt("expires_at", new Date().toISOString());
      await privileged.from("entitlements").insert({ user_id: userId, kind: "plan", value: input.planKey, expires_at: expiresAt });
      // Keep quota table in sync so plan limits reflect the new plan immediately.
      try {
        await privileged.from("subscription_quotas").upsert(
          {
            user_id: userId,
            plan_key: input.planKey,
            messages_24h: 0,
            uploads_today: 0,
            last_reset_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      } catch (qErr) {
        console.warn("activateSubscription quota upsert failed:", qErr);
      }
    } catch (entErr) {
      console.warn("activateSubscription entitlement insert failed:", entErr);
    }

    // 5. Audit PASS
    const auditResult = await recordAuditLog({
      actor: adminUserId,
      actor_email: adminEmail,
      action: "subscriptions.manage",
      resource_type: "subscription",
      resource_id: userId,
      details: {
        user_id: userId,
        user_code: activationCode,
        plan_key: input.planKey,
        duration_days: input.durationDays,
        note: input.note || "تفعيل يدوي عبر لوحة التحكم",
        activation_record_id: activationId,
      },
      result: "PASS",
    });

    return {
      ok: true,
      message: `تم تفعيل اشتراك ${planRow?.name || input.planKey} لمدة ${input.durationDays} يوم للمستخدم ${userId.slice(0, 8)}`,
      activationId: activationId,
      auditId: auditResult.id,
      userId: userId,
    };
  } catch (e: any) {
    return { ok: false, message: "خطأ غير متوقع أثناء التفعيل", error: e?.message || String(e), activationId: null };
  }
}
