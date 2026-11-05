"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@supabase/ssr";

import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";
import { validateManualGrant, expiryFromDays } from "@/lib/credits/grants";
import { recordAuditLog } from "./audit-log-record";

/**
 * منح كريدت يدوي من لوحة الأدمن (Phase B2.4).
 *
 * ⚠️ الصلاحية: `credits.manage` = Owner فقط (نفس خريطة auth-roles).
 * ⚠️ التحقق يحدث **قبل** الـ RPC، وكل محاولة (نجحت/فشلت/رُفضت) تُسجَّل
 * في `admin_audit_log` عبر `recordAuditLog`.
 */

export type GrantActionState = {
  ok: boolean;
  message: string;
  grantId?: string | null;
  error?: string;
};

const ACTION = "credits.manage";
const RESOURCE_TYPE = "credit_grant";

async function getSessionActor(): Promise<
  { userId: string; email: string | null } | { error: GrantActionState }
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

function mapDbError(message: string): string {
  if (message.includes("credit_grants_user_id_fkey")) {
    return "المستخدم غير موجود (user_id غير مسجّل في auth.users)";
  }
  if (message.includes("grant_credits: forbidden")) {
    return "المنح متاح من السيرفر فقط";
  }
  if (message.includes("p_amount")) return "المبلغ غير صالح";
  if (message.includes("p_expires_at")) return "تاريخ الانتهاء غير صالح";
  return message;
}

export async function grantCreditsAction(formData: FormData): Promise<GrantActionState> {
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
        resource_id: null,
        details: { op: "manual_grant", reason: "authorization_denied" },
        result: "BLOCKED",
      });
      return {
        ok: false,
        message: "غير مصرح: منح الكريدت متاح لمالك المنصة فقط",
        error: "authorization_denied",
      };
    }

    const check = validateManualGrant({
      userId: String(formData.get("user_id") ?? ""),
      amount: Number(formData.get("amount")),
      source: String(formData.get("source") ?? ""),
      expiresInDays: Number(formData.get("expires_in_days")),
      notes: String(formData.get("notes") ?? ""),
    });

    if (!check.ok) {
      await recordAuditLog({
        actor: actor.userId,
        actor_email: actor.email,
        action: ACTION,
        resource_type: RESOURCE_TYPE,
        resource_id: String(formData.get("user_id") ?? "") || null,
        details: { op: "manual_grant", reason: "validation_failed", errors: check.errors },
        result: "FAIL",
      });
      return {
        ok: false,
        message: "بيانات غير صالحة: " + check.errors.join(" · "),
        error: "validation_failed",
      };
    }

    const expiresAt = expiryFromDays(check.value.expiresInDays);

    const { data, error } = await db.rpc("grant_credits", {
      p_user_id: check.value.userId,
      p_amount: check.value.amount,
      p_expires_at: expiresAt,
      p_source: check.value.source,
      p_notes: check.value.notes,
    });

    if (error) {
      await recordAuditLog({
        actor: actor.userId,
        actor_email: actor.email,
        action: ACTION,
        resource_type: RESOURCE_TYPE,
        resource_id: check.value.userId,
        details: { op: "manual_grant", reason: "rpc_failed", error: error.message },
        result: "FAIL",
      });
      return { ok: false, message: mapDbError(error.message), error: "rpc_failed" };
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | { grant_id?: string; amount?: number; expires_at?: string }
      | null;

    await recordAuditLog({
      actor: actor.userId,
      actor_email: actor.email,
      action: ACTION,
      resource_type: RESOURCE_TYPE,
      resource_id: check.value.userId,
      details: {
        op: "manual_grant",
        grant_id: row?.grant_id ?? null,
        amount: check.value.amount,
        source: check.value.source,
        expires_at: row?.expires_at ?? expiresAt,
        notes: check.value.notes,
      },
      result: "PASS",
    });

    revalidatePath("/admin/grants");

    return {
      ok: true,
      message: `تم منح ${check.value.amount} كريدت بنجاح (تنتهي ${new Date(expiresAt).toLocaleDateString("ar-EG")})`,
      grantId: row?.grant_id ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      message: "خطأ غير متوقع: " + (error instanceof Error ? error.message : String(error)),
      error: "unexpected",
    };
  }
}
