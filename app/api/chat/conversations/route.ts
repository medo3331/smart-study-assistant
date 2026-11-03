import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("chat_conversations")
    .select("id,title,created_at,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, conversations: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  let title = "محادثة جديدة";
  try {
    const body = await req.json();
    if (typeof body?.title === "string" && body.title.trim()) title = body.title.trim().slice(0, 120);
  } catch {}
  const { data, error } = await supabase
    .from("chat_conversations")
    .insert({ user_id: user.id, title })
    .select("id,title,created_at,updated_at")
    .single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || "create_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, conversation: data });
}
