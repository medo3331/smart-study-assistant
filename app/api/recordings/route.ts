import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ==========================================================================
   🎙️ /api/recordings — قائمة التسجيلات الصوتية المحفوظة للطالب (Phase 23)
   ==========================================================================
   تُستخدم في «مكتبتي» جوّه المساعد الموحّد — نفس فكرة /api/files لكن على
   جدول `lectures`. قائمة خفيفة: معرف + عنوان + مدة فقط.
   ========================================================================== */

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "لازم تسجّل دخول الأول." } },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("lectures")
    .select("id, title, original_filename, duration_seconds, created_at")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .not("transcript_text", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { error: { code: "DB_READ_FAILED", message: "مقدرناش نجيب تسجيلاتك دلوقتي." } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    recordings: (data ?? []).map((r: {
      id: string;
      title: string | null;
      original_filename: string | null;
      duration_seconds: number | null;
      created_at: string;
    }) => ({
      id: r.id,
      title: r.title || r.original_filename || "تسجيل صوتي",
      duration_seconds: r.duration_seconds,
      created_at: r.created_at,
    })),
  });
}
