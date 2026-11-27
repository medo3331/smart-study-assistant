import type { SupabaseClient } from "@supabase/supabase-js";

/* ==========================================================================
   دمج المكتبات — مصدر الحقيقة الموحّد للملفات هو مساحة العمل (materials).
   أي رفع من أي مدخل (الشات / مكتبة الملفات / مساحة العمل) بيتسجّل هنا كمان،
   فالـ AI والمكتبة يشوفوا نفس الملفات من غير مكانين منفصلين.
   ========================================================================== */

export interface MaterialSyncInput {
  userId: string;
  title: string;
  fileType: string | null;
  fileSize?: number | null;
  content: string | null;
}

export type MaterialSyncResult =
  | { ok: true; id: string; merged: boolean }
  | { ok: false; reason: string };

const MAX_MATERIAL_CHARS = 200_000;

/** تطبيع العنوان للمقارنة — يشيل الامتداد ويوحّد المسافات والحالة. */
export function normalizeMaterialTitle(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/\.(pdf|docx?|pptx|txt|md|csv|json)$/i, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/**
 * دمج best-effort: لو فيه مادة بنفس العنوان نكمّل الناقص (المحتوى/النوع/الحجم)
 * بدل التكرار، وإلا ننشئ مادة جديدة. الفشل مش بيمنع الرفع الأصلي.
 */
export async function syncMaterialToWorkspace(
  supabase: SupabaseClient,
  input: MaterialSyncInput,
): Promise<MaterialSyncResult> {
  const normalizedTitle = normalizeMaterialTitle(input.title) || "ملف";
  const content = (input.content ?? "").slice(0, MAX_MATERIAL_CHARS).trim();
  try {
    const { data: existing, error: fetchError } = await supabase
      .from("materials")
      .select("id, title, content")
      .eq("user_id", input.userId)
      .limit(500);
    if (fetchError) return { ok: false, reason: fetchError.message };

    const match = (existing ?? []).find(
      (r: { title?: string | null }) => normalizeMaterialTitle(r.title) === normalizedTitle,
    );
    if (match) {
      const patch: Record<string, unknown> = {};
      if (content && !(match.content ?? "").trim()) patch.content = content;
      if (input.fileType) patch.file_type = input.fileType;
      if (typeof input.fileSize === "number" && input.fileSize > 0) patch.file_size = input.fileSize;
      if (Object.keys(patch).length === 0) return { ok: true, id: match.id, merged: true };
      const { error: updateError } = await supabase.from("materials").update(patch).eq("id", match.id);
      if (updateError) return { ok: false, reason: updateError.message };
      return { ok: true, id: match.id, merged: true };
    }

    const { data: inserted, error: insertError } = await supabase
      .from("materials")
      .insert({
        user_id: input.userId,
        title: input.title.trim().slice(0, 200) || "ملف",
        file_type: input.fileType,
        file_size: typeof input.fileSize === "number" && input.fileSize > 0 ? input.fileSize : null,
        content: content || "",
      })
      .select("id")
      .single();
    if (insertError || !inserted) {
      return { ok: false, reason: insertError?.message ?? "insert failed" };
    }
    return { ok: true, id: inserted.id, merged: false };
  } catch (e) {
    return { ok: false, reason: (e as Error)?.message ?? "unknown" };
  }
}
