import { NextResponse, type NextRequest } from "next/server";

import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { deleteObject } from "@/lib/files/storage";

/* ==========================================================================
   📁 /api/files/[id] — DELETE
   ══════════════════════════════════════════════════════════════════════════

   DELETE → حذف الملف من التخزين + الصف. بالعميل (RLS) للتحقق من الملكية،
   وبالخدمة المميزة للحذف الفعلي.
   ========================================================================== */

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user || user.is_anonymous) {
      return NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "لازم تسجّل دخول الأول." } },
        { status: 401 },
      );
    }

    const { id } = await params;
    const { data: record, error: fetchError } = await supabase
      .from("files")
      .select("id, storage_path")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !record) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "الملف غير موجود." } },
        { status: 404 },
      );
    }

    await deleteObject(record.storage_path);

    const privileged = createServiceClient();
    const { error: deleteError } = await privileged.from("files").delete().eq("id", id);
    if (deleteError) {
      console.error(`files/delete: ${deleteError.message}`);
      return NextResponse.json(
        { error: { code: "DELETE_FAILED", message: "فشل حذف الملف. حاول تاني." } },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("files/delete:", error);
    return NextResponse.json(
      { error: { code: "UNKNOWN", message: "حصل خطأ غير متوقع. حاول تاني." } },
      { status: 500 },
    );
  }
}
