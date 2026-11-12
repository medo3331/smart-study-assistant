// ============================================================
// EPIC Phase 4.7 — Files moderation (classification + soft-delete)
// Server-side: files.moderate re-checked here + audit_log PASS/FAIL/BLOCKED
// ============================================================

"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import { requireAdminActor, ActionAuthError } from "@/lib/admin/action-guard";
import type { ActorContext } from "@/lib/policy";

export interface FileActionResult {
  ok: boolean;
  message: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MANUAL_SQL_HINT = "عمود deleted_at غير موجود — نفّذ db/12-files-deleted-at.sql يدويًا (manual run #12)";

/**
 * فحص files.moderate على السيرفر (إخفاء الزر في الصفحة مجرد UX) + BLOCKED audit.
 *
 * ⚠️ أمان (P0، 2026-11): كانت بتاخد actorId/actorEmail من المتصل — انتحال.
 * دلوقتي الهوية من الجلسة عبر `requireAdminActor("files.moderate")`.
 */
async function requireModerate(
  fileId: string,
  op: string
): Promise<{ ok: true; actor: ActorContext } | { ok: false; result: FileActionResult }> {
  try {
    const { actor } = await requireAdminActor("files.moderate");
    return { ok: true, actor };
  } catch (e) {
    if (e instanceof ActionAuthError) {
      await recordAuditLog({
        actor: null,
        actor_email: null,
        action: "files.moderate",
        resource_type: "file",
        resource_id: fileId,
        details: { op, reason: "permission_denied", cause: e.code },
        result: "BLOCKED",
      });
      return { ok: false, result: { ok: false, message: "غير مصرح: تحتاج صلاحية files.moderate" } };
    }
    throw e;
  }
}

/**
 * فحص وجود عمود deleted_at (SQL #12 اليدوي) — بقراءة تجريبية.
 * لو العمود ناقص PostgREST بيرجع خطأ بنص واضح ونتعامل معاه بصراحة
 * (لا زر حذف يوهم، لا PASS مزيف).
 */
async function probeDeletedAtColumn(): Promise<{ ok: boolean; reason: string | null }> {
  const db = createServiceClient();
  const { error } = await db.from("files").select("id, deleted_at").limit(1);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, reason: null };
}

/** تعديل تصنيف ملف (classification/stage/grade/subject) — قبل/بعد في audit. */
export async function updateFileClassification(
  fileIdRaw: string,
  fields: { classification?: string; stage?: string; grade?: string; subject?: string }
): Promise<FileActionResult> {
  const fileId = (fileIdRaw || "").trim();

  if (!UUID_RE.test(fileId)) {
    return { ok: false, message: "معرّف ملف غير صالح" };
  }
  const gate = await requireModerate(fileId, "classify");
  if (!gate.ok) return gate.result;

  const auditBase = {
    actor: gate.actor.userId,
    actor_email: gate.actor.userEmail,
    action: "files.moderate" as const,
    resource_type: "file",
    resource_id: fileId,
  };

  // تنظيف: نص فارغ = NULL، حد أقصى 120 حرف (لا نستقبل بيانات ضخمة)
  const clean = (v: unknown): string | null => {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) return null;
    return s.slice(0, 120);
  };
  const next = {
    classification: clean(fields.classification),
    stage: clean(fields.stage),
    grade: clean(fields.grade),
    subject: clean(fields.subject),
  };

  try {
    const db = createServiceClient();
    const { data: beforeRow } = await db
      .from("files")
      .select("id, file_name, classification, stage, grade, subject, deleted_at")
      .eq("id", fileId)
      .maybeSingle();

    if (!beforeRow) {
      await recordAuditLog({ ...auditBase, details: { op: "classify", reason: "file_not_found" }, result: "FAIL" });
      return { ok: false, message: "الملف غير موجود" };
    }

    const { error } = await db.from("files").update(next).eq("id", fileId);
    if (error) {
      await recordAuditLog({ ...auditBase, details: { op: "classify", reason: "update_failed", error: error.message }, result: "FAIL" });
      return { ok: false, message: "فشل حفظ التصنيف: " + error.message };
    }

    const before = {
      classification: (beforeRow as any).classification,
      stage: (beforeRow as any).stage,
      grade: (beforeRow as any).grade,
      subject: (beforeRow as any).subject,
    };
    await recordAuditLog({
      ...auditBase,
      details: { op: "classify", file_name: (beforeRow as any).file_name, before, after: next },
      result: "PASS",
    });
    return { ok: true, message: `تم حفظ تصنيف "${(beforeRow as any).file_name}"` };
  } catch (e: any) {
    await recordAuditLog({ ...auditBase, details: { op: "classify", reason: "unexpected_error", error: e?.message || String(e) }, result: "FAIL" });
    return { ok: false, message: "خطأ غير متوقع: " + (e?.message || String(e)) };
  }
}
/** soft-delete ملف (deleted_at = now) — يتطلب SQL #12 اليدوي. */
export async function softDeleteFile(
  fileIdRaw: string,
  reasonRaw: string
): Promise<FileActionResult> {
  const fileId = (fileIdRaw || "").trim();
  const reason = (reasonRaw || "").trim().slice(0, 200) || "من لوحة التحكم";

  if (!UUID_RE.test(fileId)) {
    return { ok: false, message: "معرّف ملف غير صالح" };
  }
  const gate = await requireModerate(fileId, "soft_delete");
  if (!gate.ok) return gate.result;

  const auditBase = {
    actor: gate.actor.userId,
    actor_email: gate.actor.userEmail,
    action: "files.moderate" as const,
    resource_type: "file",
    resource_id: fileId,
  };

  try {
    const db = createServiceClient();

    const probe = await probeDeletedAtColumn();
    if (!probe.ok) {
      await recordAuditLog({ ...auditBase, details: { op: "soft_delete", reason: "deleted_at_column_missing", error: probe.reason }, result: "FAIL" });
      return { ok: false, message: MANUAL_SQL_HINT };
    }

    const { data: row } = await db
      .from("files")
      .select("id, file_name, original_name, profile_id, file_type, deleted_at")
      .eq("id", fileId)
      .maybeSingle();
    if (!row) {
      await recordAuditLog({ ...auditBase, details: { op: "soft_delete", reason: "file_not_found" }, result: "FAIL" });
      return { ok: false, message: "الملف غير موجود" };
    }
    if ((row as any).deleted_at) {
      await recordAuditLog({ ...auditBase, details: { op: "soft_delete", reason: "already_deleted" }, result: "FAIL" });
      return { ok: false, message: "الملف محذوف مسبقًا" };
    }

    const { error } = await db.from("files").update({ deleted_at: new Date().toISOString() }).eq("id", fileId);
    if (error) {
      await recordAuditLog({ ...auditBase, details: { op: "soft_delete", reason: "update_failed", error: error.message }, result: "FAIL" });
      return { ok: false, message: "فشل الحذف: " + error.message };
    }

    await recordAuditLog({
      ...auditBase,
      details: {
        op: "soft_delete",
        file_name: (row as any).file_name,
        original_name: (row as any).original_name,
        profile_id: (row as any).profile_id,
        file_type: (row as any).file_type,
        reason,
      },
      result: "PASS",
    });
    return { ok: true, message: `تم حذف "${(row as any).file_name}" (قابل للاسترجاع)` };
  } catch (e: any) {
    await recordAuditLog({ ...auditBase, details: { op: "soft_delete", reason: "unexpected_error", error: e?.message || String(e) }, result: "FAIL" });
    return { ok: false, message: "خطأ غير متوقع: " + (e?.message || String(e)) };
  }
}
/** استرجاع ملف محذوف (deleted_at = null) — نفس حماية/audit الحذف. */
export async function restoreFile(
  fileIdRaw: string
): Promise<FileActionResult> {
  const fileId = (fileIdRaw || "").trim();

  if (!UUID_RE.test(fileId)) {
    return { ok: false, message: "معرّف ملف غير صالح" };
  }
  const gate = await requireModerate(fileId, "restore");
  if (!gate.ok) return gate.result;

  const auditBase = {
    actor: gate.actor.userId,
    actor_email: gate.actor.userEmail,
    action: "files.moderate" as const,
    resource_type: "file",
    resource_id: fileId,
  };

  try {
    const db = createServiceClient();

    const probe = await probeDeletedAtColumn();
    if (!probe.ok) {
      await recordAuditLog({ ...auditBase, details: { op: "restore", reason: "deleted_at_column_missing", error: probe.reason }, result: "FAIL" });
      return { ok: false, message: MANUAL_SQL_HINT };
    }

    const { data: row } = await db.from("files").select("id, file_name, deleted_at").eq("id", fileId).maybeSingle();
    if (!row) {
      await recordAuditLog({ ...auditBase, details: { op: "restore", reason: "file_not_found" }, result: "FAIL" });
      return { ok: false, message: "الملف غير موجود" };
    }
    if (!(row as any).deleted_at) {
      await recordAuditLog({ ...auditBase, details: { op: "restore", reason: "not_deleted" }, result: "FAIL" });
      return { ok: false, message: "الملف ليس محذوفًا أصلًا" };
    }

    const { error } = await db.from("files").update({ deleted_at: null }).eq("id", fileId);
    if (error) {
      await recordAuditLog({ ...auditBase, details: { op: "restore", reason: "update_failed", error: error.message }, result: "FAIL" });
      return { ok: false, message: "فشل الاسترجاع: " + error.message };
    }

    await recordAuditLog({
      ...auditBase,
      details: { op: "restore", file_name: (row as any).file_name, restored_from_deleted_at: (row as any).deleted_at },
      result: "PASS",
    });
    return { ok: true, message: `تم استرجاع "${(row as any).file_name}"` };
  } catch (e: any) {
    await recordAuditLog({ ...auditBase, details: { op: "restore", reason: "unexpected_error", error: e?.message || String(e) }, result: "FAIL" });
    return { ok: false, message: "خطأ غير متوقع: " + (e?.message || String(e)) };
  }
}