import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ==========================================================================
   ✏️ /api/lectures/[id]/transcript — حفظ النص المصحح (Phase 4-C)
   ========================================================================== */

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "لازم تسجّل دخول الأول." } },
      { status: 401 },
    );
  }

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  if (text.trim() === "") {
    return NextResponse.json(
      { success: false, error: { code: "EMPTY_TEXT", message: "النص فاضي." } },
      { status: 400 },
    );
  }
  if (text.length > 200_000) {
    return NextResponse.json(
      { success: false, error: { code: "TEXT_TOO_LONG", message: "النص طويل أوي." } },
      { status: 413 },
    );
  }

  // جلب transcript_data عشان نحدّث text داخله أيضاً (best-effort).
  const { data: row } = await supabase
    .from("lectures")
    .select("transcript_data")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const data = (row?.transcript_data ?? null) as Record<string, unknown> | null;
  if (data && typeof data === "object") data.text = text;

  const { error } = await supabase
    .from("lectures")
    .update({ transcript_text: text, transcript_data: data ?? { text } })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: "DB_WRITE_FAILED", message: "مقدرناش نحفظ النص. جرّب تاني." } },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true });
}