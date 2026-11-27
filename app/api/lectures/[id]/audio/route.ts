import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSignedReadUrl, isStorageConfigured } from "@/lib/ai/transcription-storage";

/* ==========================================================================
   🎧 /api/lectures/[id]/audio — رابط استماع موقّع لتسجيل صاحبه فقط (Phase 23)
   ==========================================================================
   1) مصادقة + ملكية عبر جلسة المستخدم و RLS (select on public.lectures).
   2) رابط موقّع قصير العمر عبر service client — من غير ما نكشف الباكيت.
   ========================================================================== */

const SIGNED_URL_TTL_SECONDS = 3600;

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
    .select("storage_path, duration_seconds, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !row) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "التسجيل مش موجود." } },
      { status: 404 },
    );
  }
  if (!row.storage_path) {
    return NextResponse.json(
      { ok: false, error: { code: "NO_AUDIO", message: "التسجيل ده مالوش ملف صوتي محفوظ." } },
      { status: 404 },
    );
  }

  try {
    if (!isStorageConfigured()) {
      throw new Error("storage not configured");
    }
    const url = await createSignedReadUrl(row.storage_path);
    return NextResponse.json({
      ok: true,
      url,
      expiresIn: SIGNED_URL_TTL_SECONDS,
      durationSeconds: row.duration_seconds ?? null,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "SIGNED_URL_FAILED", message: "مقدرناش نجهّز الصوت. جرّب تاني." } },
      { status: 502 },
    );
  }
}
