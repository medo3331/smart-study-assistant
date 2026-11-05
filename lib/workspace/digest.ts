import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lightweight workspace metadata digest (~150-300 tokens).
 * NO file content. Only names, counts, dates.
 * Injected into system prompt on every message.
 */
export async function getWorkspaceDigest(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  // 3 parallel lightweight queries (indexed on user_id)
  const [materialsRes, lecturesRes, chatsRes] = await Promise.all([
    supabase
      .from("materials")
      .select("id, title, file_type, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("lectures")
      .select("id, title, original_filename, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("chat_conversations")
      .select("id, title, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(3),
  ]);

  const materials = materialsRes.data ?? [];
  const lectures = lecturesRes.data ?? [];
  const chats = chatsRes.data ?? [];

  // Empty workspace → no digest needed
  if (materials.length === 0 && lectures.length === 0) {
    return null;
  }

  // Exact counts (fast head:true queries)
  const [materialsCount, lecturesCount, chatsCount] = await Promise.all([
    supabase.from("materials").select("*", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("lectures").select("*", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("chat_conversations").select("*", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  const lines: string[] = ["=== مساحة عمل الطالب (بيانات وصفية فقط) ==="];

  if (materials.length > 0) {
    const titles = materials.map(m =>
      `"${truncate(m.title, 60)}" (${m.file_type ?? "file"}، ${formatDate(m.created_at)})`
    );
    lines.push(`- الملفات: ${materialsCount.count ?? materials.length} | آخرها: ${titles.join(" · ")}`);
  } else {
    lines.push(`- الملفات: 0`);
  }

  if (lectures.length > 0) {
    const titles = lectures.map(l =>
      `"${truncate(l.title ?? l.original_filename ?? "بدون عنوان", 60)}" (${l.status}، ${formatDate(l.created_at)})`
    );
    lines.push(`- المحاضرات: ${lecturesCount.count ?? lectures.length} | آخرها: ${titles.join(" · ")}`);
  } else {
    lines.push(`- المحاضرات: 0`);
  }

  lines.push(`- المحادثات: ${chatsCount.count ?? chats.length}${chats[0]?.title ? ` | آخرها: "${truncate(chats[0].title, 60)}"` : ""}`);

  lines.push("");
  lines.push("=== تعليمات ===");
  lines.push("- لا تفترض محتوى أي مصدر. الأسماء فقط.");
  lines.push("- لو الطالب طلب شرح/تلخيص/اقتباس، استخدم أداة جلب المصدر (workspace source context).");
  lines.push("- لو ما فيش مصدر مطابق، قل: 'مش لاقي في محاضراتك/ملفاتك'.");

  return lines.join("\n");
}

function truncate(s: string | null | undefined, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().split("T")[0];
}