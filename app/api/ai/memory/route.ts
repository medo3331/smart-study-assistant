import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";

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
  if (!kind || !value) {
    return NextResponse.json({ error: { message: "kind و value مطلوبان." } }, { status: 400 });
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
  const oldValue = typeof body?.oldValue === "string" ? body.oldValue : "";
  const newValue = typeof body?.newValue === "string" ? body.newValue.trim().slice(0, 300) : "";
  if (!kind || !oldValue || !newValue) {
    return NextResponse.json({ error: { message: "kind, oldValue, newValue مطلوبة." } }, { status: 400 });
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