import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { readFileUrl } from "@/lib/files/storage";
import { readQuotaSnapshot } from "@/lib/ai/quota-snapshot";

/* ==========================================================================
   📁 /api/files — مكتبة ملفات الطالب
   ══════════════════════════════════════════════════════════════════════════

   GET
     → ملفات المالك الجاهزة (stage='ready')، الأحدث أولاً.
       ملاحظة: صفوف 'uploading' مش بتظهر — الرفع مكتمل مش معناش حاجة.
   ========================================================================== */

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user || user.is_anonymous) {
      return NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "لازم تسجّل دخول الأول." } },
        { status: 401 },
      );
    }

    const { data, error } = await supabase
      .from("files")
      .select(
        "id, file_name, original_name, file_size, file_type, storage_path, created_at",
      )
      .eq("stage", "ready")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error(`files/list: ${error.message}`);
      return NextResponse.json(
        { error: { code: "LIST_FAILED", message: "مقدرناش نجيب ملفاتك. حاول تاني." } },
        { status: 502 },
      );
    }

    const snapshot = await readQuotaSnapshot(user.id, "upload");
    return NextResponse.json({
      ok: true,
      files: data ?? [],
      // 📊 رصيد الرفع اليومي — لشريط الاستهلاك في «ملفاتي».
      quota: { used: snapshot.used, limit: snapshot.limit, resetAt: snapshot.resetAt },
    });
  } catch (error) {
    console.error("files/list:", error);
    return NextResponse.json(
      { error: { code: "UNKNOWN", message: "حصل خطأ غير متوقع. حاول تاني." } },
      { status: 500 },
    );
  }
}

/** POST { fileId } → رابط قراءة موقّع (ساعة) لفتح أو تحميل الملف. */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user || user.is_anonymous) {
      return NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "لازم تسجّل دخول الأول." } },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => null)) as { fileId?: unknown } | null;
    const fileId = typeof body?.fileId === "string" ? body.fileId : "";
    if (!fileId) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "مفيش معرّف ملف." } },
        { status: 400 },
      );
    }

    const { data: record, error: fetchError } = await supabase
      .from("files")
      .select("id, storage_path, stage")
      .eq("id", fileId)
      .maybeSingle();

    if (fetchError || !record || record.stage !== "ready") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "الملف غير موجود أو لسه بيرفع." } },
        { status: 404 },
      );
    }

    const url = await readFileUrl(record.storage_path);
    return NextResponse.json({ ok: true, url });
  } catch (error) {
    console.error("files/url:", error);
    return NextResponse.json(
      { error: { code: "UNKNOWN", message: "حصل خطأ غير متوقع. حاول تاني." } },
      { status: 500 },
    );
  }
}
