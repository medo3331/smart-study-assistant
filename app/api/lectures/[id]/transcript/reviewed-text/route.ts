import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lectureId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "غير مصرح" } }, { status: 401 });

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : null;
  if (text === null) return NextResponse.json({ error: { code: "INVALID_BODY", message: "text required" } }, { status: 400 });

  const { error } = await supabase
    .from("lectures")
    .update({ transcript_reviewed_text: text, review_status: "completed", reviewed_at: new Date().toISOString() })
    .eq("id", lectureId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: { code: "DB_WRITE_FAILED", message: error.message } }, { status: 500 });
  return NextResponse.json({ success: true, reviewedText: text });
}