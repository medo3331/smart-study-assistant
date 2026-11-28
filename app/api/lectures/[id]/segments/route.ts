import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractSegments } from "@/lib/lesson/citations";

/* ==========================================================================
   ⏱ /api/lectures/[id]/segments — مقاطع التفريغ + وجود الصوت (المرحلة 24ب)
   ==========================================================================
   الدرس القديم (app/lesson/[dayId]) لما يبقى مربوط بتسجيل، محتاج يعرف:
   - هل التسجيل ده فيه ملف صوتي أصلاً (storage_path)؟
   - مقاطع التفريغ بتوقيتها — عشان مشغّل الاستوديو + «تتبّع» الشرح.

   مصادقة + ملكية عبر جلسة المستخدم و RLS — زي /audio بالظبط.
   ========================================================================== */

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "لازم تسجّل دخول الأول." } },
      { status: 401 },
    );
  }

  const { id } = await ctx.params;

  const { data: row, error } = await supabase
    .from("lectures")
    .select("title, storage_path, duration_seconds, transcript_data")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !row) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "التسجيل مش موجود." } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    title: typeof row.title === "string" && row.title ? row.title : "محاضرة",
    durationSeconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
    hasAudio: Boolean(row.storage_path),
    segments: extractSegments(row.transcript_data),
  });
}
