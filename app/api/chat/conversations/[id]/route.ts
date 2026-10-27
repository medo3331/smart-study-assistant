import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { data: conv, error: cErr } = await supabase
    .from("chat_conversations")
    .select("id,title,created_at,updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
  if (!conv) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const { data: msgs, error: mErr } = await supabase
    .from("chat_messages")
    .select("id,role,content,created_at")
    .eq("conversation_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (mErr) return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, conversation: conv, messages: msgs ?? [] });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  let title = "";
  try {
    const body = await req.json();
    if (typeof body?.title === "string") title = body.title.trim().slice(0, 120);
  } catch {}
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });

  const { data, error } = await supabase
    .from("chat_conversations")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id,title,created_at,updated_at")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, conversation: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { error, count } = await supabase
    .from("chat_conversations")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!count) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
