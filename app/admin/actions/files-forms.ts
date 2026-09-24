// ============================================================
// Phase 4.7 — غلاف نماذج الملفات (يتولى الهوية + إعادة التوجيه)
// هوية المنفّذ من الجلسة على السيرفر (requireAdminPermission) — مفيش أي
// مسار كلاينت. الفحص المزدوج (files.moderate) جوه files-manage.ts.
// ============================================================

"use server";

import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { updateFileClassification, softDeleteFile, restoreFile, type FileActionResult } from "./files-manage";

const BACK_KEYS = ["user", "type", "from", "to", "show", "page"] as const;

/** إجراء واحد لكل نماذج الصفحة: op=classify|delete|restore + حفظ الفلاتر back_*. */
export async function filesFormAction(formData: FormData): Promise<void> {
  "use server";
  const { user } = await requireAdminPermission("files.moderate");

  const op = String(formData.get("op") || "");
  const fileId = String(formData.get("file_id") || "");

  let r: FileActionResult;
  if (op === "classify") {
    r = await updateFileClassification(
      fileId,
      {
        classification: String(formData.get("classification") ?? ""),
        stage: String(formData.get("stage") ?? ""),
        grade: String(formData.get("grade") ?? ""),
        subject: String(formData.get("subject") ?? ""),
      },
      user.id,
      user.email ?? null
    );
  } else if (op === "delete") {
    r = await softDeleteFile(fileId, String(formData.get("reason") ?? ""), user.id, user.email ?? null);
  } else if (op === "restore") {
    r = await restoreFile(fileId, user.id, user.email ?? null);
  } else {
    r = { ok: false, message: "إجراء غير معروف" };
  }

  // بناء رابط العودة بنفس الفلاتر الحالية (قابل للمشاركة + pagination)
  const u = new URLSearchParams();
  for (const key of BACK_KEYS) {
    const v = String(formData.get(`back_${key}`) || "");
    if (v) u.set(key, v);
  }
  const base = u.toString() ? `/admin/files?${u.toString()}` : "/admin/files";
  redirect(`${base}${base.includes("?") ? "&" : "?"}${r.ok ? "success" : "error"}=${encodeURIComponent(r.message)}`);
}