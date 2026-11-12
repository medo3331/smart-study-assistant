"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import { requireAdminActor, ActionAuthError } from "@/lib/admin/action-guard";

export interface RegenerateCodeResult {
  ok: boolean;
  message: string;
  newCode?: string;
  auditId?: string | null;
  error?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANONICAL_CODE_RE = /^MAG-[A-Z0-9]{3}-[A-Z0-9]{4}$/i;

/**
 * 🔄 توليد/إعادة توليد public_user_code (MAG-XXX-XXXX) — المرحلة 3 (QR).
 *
 * قرارات موثقة في EPIC_AUDIT_REPORT.md › Phase 3:
 * - مفيش generator جديد ولا identifier موازٍ: بنصفّر العمود (null) والـDB
 *   trigger `set_public_user_code` (db/epic6-user-code.sql — BEFORE INSERT OR
 *   UPDATE يملأ NULL/''، ومؤكد موجود في الـDB الحية) بيولّد بالمولّد الكنسي
 *   `generate_public_user_code()`. مصدر واحد للتنسيق.
 * - ممنوع للمستخدم العادي توليد/تغيير كوده بنفسه: الفحص هنا server-side
 *   بـ hasPermission("users.regenerate_code") والهوية بتتقرأ من الجلسة في
 *   الغلاف (user-code-form-action.ts) — مفيش أي مسار عميل.
 * - كل نتيجة (PASS/FAIL/BLOCKED) بتتسجل في audit_log بـ action="qr_regenerate".
 */
export async function regenerateUserPublicCode(
  targetUserId: string
): Promise<RegenerateCodeResult> {
  // ⚠️ الهوية من الجلسة — كانت بتاخد adminUserId/adminEmail من المتصل،
  // فأي حد يقدر يبعت id المالك ويعدّي الفحص.
  let ctx;
  try {
    ctx = await requireAdminActor("users.regenerate_code");
  } catch (e) {
    if (e instanceof ActionAuthError) {
      return { ok: false, message: e.message, auditId: null, error: e.code };
    }
    throw e;
  }

  const adminUserId = ctx.actor.userId!;
  const adminEmail = ctx.actor.userEmail;
  const service = createServiceClient();

  if (!UUID_RE.test(targetUserId)) {
    return { ok: false, message: "معرّف مستخدم غير صالح", error: "invalid_user_id" };
  }

  // 2) قراءة الكود الحالي (للـaudit) + التأكد أن المستخدم موجود
  const { data: profile, error: readError } = await service
    .from("profiles")
    .select("id, public_user_code")
    .eq("id", targetUserId)
    .maybeSingle();

  if (readError || !profile) {
    const audit = await recordAuditLog({
      actor: adminUserId,
      actor_email: adminEmail,
      action: "qr_regenerate",
      resource_type: "user",
      resource_id: targetUserId,
      details: { reason: "user_not_found", db_error: readError?.message ?? null },
      result: "FAIL",
    });
    return { ok: false, message: "المستخدم غير موجود في profiles", auditId: audit.id, error: "user_not_found" };
  }

  const oldCode = (profile.public_user_code as string | null) ?? null;

  // 3) التفريغ → الـtrigger الكنسي يولّد كود جديد (BEFORE UPDATE يملأ NULL/'')
  const { error: updateError } = await service
    .from("profiles")
    .update({ public_user_code: null })
    .eq("id", targetUserId);

  if (updateError) {
    // احتمال تصادم UNIQUE مهمل (~1 من 78 مليار تركيبة) — بيظهر هنا كخطأ DB واضح
    const audit = await recordAuditLog({
      actor: adminUserId,
      actor_email: adminEmail,
      action: "qr_regenerate",
      resource_type: "user",
      resource_id: targetUserId,
      details: { old_code: oldCode, db_error: updateError.message },
      result: "FAIL",
    });
    return { ok: false, message: `فشل التوليد من الداتابيز: ${updateError.message}`, auditId: audit.id, error: "db_error" };
  }

  // 4) قراءة الكود الجديد للتأكيد + التحقق من الصيغة الكنسية
  const { data: after } = await service
    .from("profiles")
    .select("public_user_code")
    .eq("id", targetUserId)
    .maybeSingle();

  const newCode = (after?.public_user_code as string | null) ?? null;
  if (!newCode || !CANONICAL_CODE_RE.test(newCode)) {
    const audit = await recordAuditLog({
      actor: adminUserId,
      actor_email: adminEmail,
      action: "qr_regenerate",
      resource_type: "user",
      resource_id: targetUserId,
      details: { old_code: oldCode, reason: "trigger_did_not_generate", received: newCode },
      result: "FAIL",
    });
    return {
      ok: false,
      message: "التحديث تم لكن الكود الجديد لم يُولَّد بالصيغة الكنسية — تأكد أن SQL #5 (db/epic6-user-code.sql) مطبّق",
      auditId: audit.id,
      error: "generation_missing",
    };
  }

  // 5) PASS — مسجّل بالكود القديم والجديد
  const audit = await recordAuditLog({
    actor: adminUserId,
    actor_email: adminEmail,
    action: "qr_regenerate",
    resource_type: "user",
    resource_id: targetUserId,
    details: { old_code: oldCode, new_code: newCode },
    result: "PASS",
  });
  return { ok: true, message: `تم توليد كود جديد: ${newCode}`, newCode, auditId: audit.id };
}
