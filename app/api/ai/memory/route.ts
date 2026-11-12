import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";

/**
 * 🔒 أنواع الذاكرة المسموحة (نفس قيد CHECK في db/ai-learning.sql).
 *
 * ⚠️ أمان (P0، 2026-11): بدون قائمة سماح، أي كلاينت يقدر يخزّن
 * `kind = "system_directive"` ويحقن تعليمات في الـprompt. الـPATCH/DELETE
 * بيرفضوا أي نوع خارج القائمة **قبل** أي كتابة.
 */
const MEMORY_KINDS = new Set([
  "weak_topic",
  "preferred_style",
  "recent_subject",
  "recent_lesson",
  "completed_topic",
  "common_mistake",
]);

/** يقصّ لأقصى ٣٠٠ حرف (مطابق لقيد CHECK) ويسطّح أي أسطر جديدة. */
function normalizeMemoryValue(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 300);
}

export async function GET() {
  const { user, supabase, response } = await requireUser("message");
  if (response) return response;

  const { data, error } = await supabase
    .from("ai_memories")
    .select("user_id, kind, value, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: { message: "تعذر تحميل الذاكرة." } }, { status: 500 });
  }

  return NextResponse.json({ memories: data ?? [] });
}

export async function DELETE(req: Request) {
  const { user, supabase, response } = await requireUser("message");
  if (response) return response;

  const body = await req.json().catch(() => null);
  const kind = typeof body?.kind === "string" ? body.kind : "";
  const value = typeof body?.value === "string" ? body.value : "";
  if (!MEMORY_KINDS.has(kind) || !value) {
    return NextResponse.json({ error: { message: "kind أو value غير صالح." } }, { status: 400 });
  }

  const { error } = await supabase
    .from("ai_memories")
    .delete()
    .eq("user_id", user.id)
    .eq("kind", kind)
    .eq("value", value);

  if (error) {
    return NextResponse.json({ error: { message: "تعذر حذف الذاكرة." } }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(req: Request) {
  const { user, supabase, response } = await requireUser("message");
  if (response) return response;

  const body = await req.json().catch(() => null);
  const kind = typeof body?.kind === "string" ? body.kind : "";
  const oldValue = typeof body?.oldValue === "string" ? body.oldValue.trim() : "";
  const newValue =
    typeof body?.newValue === "string" ? normalizeMemoryValue(body.newValue) : "";
  if (!MEMORY_KINDS.has(kind) || !oldValue || !newValue) {
    return NextResponse.json(
      { error: { message: "kind, oldValue, newValue مطلوبة وصالحة." } },
      { status: 400 }
    );
  }

  const { error: deleteError } = await supabase
    .from("ai_memories")
    .delete()
    .eq("user_id", user.id)
    .eq("kind", kind)
    .eq("value", oldValue);

  if (deleteError) {
    return NextResponse.json({ error: { message: "تعذر تعديل الذاكرة." } }, { status: 500 });
  }

  const { error: insertError } = await supabase
    .from("ai_memories")
    .insert({ user_id: user.id, kind, value: newValue, updated_at: new Date().toISOString() });

  if (insertError) {
    return NextResponse.json({ error: { message: "تعذر حفظ التعديل." } }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}