/* ==========================================================================
   Material Retrieval — bounded, ownership-filtered (Batch 4D.1)
   ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface MaterialSource {
  id: string;
  title: string;
  fileType: string | null;
  createdAt: string;
  contentLength: number;
}

export interface MaterialRetrievalOk {
  ok: true;
  material: {
    id: string;
    title: string;
    fileType: string | null;
    createdAt: string;
    content: string;
  };
}

export interface MaterialRetrievalFail {
  ok: false;
  code: "AUTH_REQUIRED" | "NOT_FOUND" | "EMPTY" | "DB_FAILED";
  message: string;
}

export type MaterialRetrievalResult = MaterialRetrievalOk | MaterialRetrievalFail;

const DEFAULT_MAX_CHARS = 8000;

function safeError(): string {
  return "تعذّر جلب محتوى الملف.";
}

export async function listEligibleMaterials(
  supabase: SupabaseClient,
  userId: string,
): Promise<MaterialSource[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("materials")
    .select("id, title, file_type, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) return [];
  const rows = (data ?? []) as Array<{
    id: string;
    title: string | null;
    file_type: string | null;
    content: string | null;
    created_at: string;
  }>;
  return rows
    .filter((r) => typeof r.content === "string" && r.content.trim().length > 0)
    .map((r) => ({
      id: r.id,
      title: (r.title ?? "ملف").trim() || "ملف",
      fileType: r.file_type,
      createdAt: r.created_at,
      contentLength: (r.content ?? "").length,
    }));
}

export async function retrieveMaterialContent(
  supabase: SupabaseClient,
  userId: string,
  materialId: string,
  maxChars: number = DEFAULT_MAX_CHARS,
): Promise<MaterialRetrievalResult> {
  if (!userId) {
    return { ok: false, code: "AUTH_REQUIRED", message: "سجّل دخول أولاً." };
  }
  if (!materialId) {
    return { ok: false, code: "NOT_FOUND", message: "لم يُحدد ملف." };
  }
  try {
    const { data, error } = await supabase
      .from("materials")
      .select("id, title, file_type, content, created_at")
      .eq("id", materialId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      return { ok: false, code: "DB_FAILED", message: safeError() };
    }
    if (!data) {
      return { ok: false, code: "NOT_FOUND", message: "الملف غير موجود." };
    }
    const row = data as {
      id: string;
      title: string | null;
      file_type: string | null;
      content: string | null;
      created_at: string;
    };
    const content = (row.content ?? "").trim();
    if (!content) {
      return { ok: false, code: "EMPTY", message: "الملف فارغ." };
    }
    const bound = content.slice(0, Math.max(256, maxChars));
    return {
      ok: true,
      material: {
        id: row.id,
        title: (row.title ?? "ملف").trim() || "ملف",
        fileType: row.file_type,
        createdAt: row.created_at,
        content: bound,
      },
    };
  } catch {
    return { ok: false, code: "DB_FAILED", message: safeError() };
  }
}
