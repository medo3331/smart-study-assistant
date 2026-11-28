import { NextResponse, type NextRequest } from "next/server";

import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { FILE_BUCKET, verifyUploadedObject } from "@/lib/files/storage";
import { detectFileKind, extractTextFromFile } from "@/lib/extract-text";
import { syncMaterialToWorkspace } from "@/lib/ai/library-sync";

/* ==========================================================================
   📁 /api/files/complete — إقرار الرفع بعد ما الملف وصل التخزين
   ══════════════════════════════════════════════════════════════════════════

   POST JSON { fileId }
     → بيتأكد من الـ Storage نفسه إن الكائن موجود (ومفيش تزوير حجم)،
       وبعد كده بيحط stage='ready' — اللي بيخلي الملف يظهر في المكتبة.
   ========================================================================== */

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

    // قراءة الصف بالعميل (RLS) — لو مش ملكه مش هيظهر أصلاً.
    const { data: record, error: fetchError } = await supabase
      .from("files")
      .select("id, storage_path, stage")
      .eq("id", fileId)
      .maybeSingle();

    if (fetchError || !record) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "الملف غير موجود." } },
        { status: 404 },
      );
    }
    if (record.stage === "ready") {
      return NextResponse.json({ ok: true, alreadyReady: true });
    }

    const verified = await verifyUploadedObject(record.storage_path);
    if (!verified.exists) {
      return NextResponse.json(
        {
          error: {
            code: "UPLOAD_NOT_FOUND",
            message: "الملف لسه ماوصلش التخزين — جرّب ترفعه تاني.",
          },
        },
        { status: 409 },
      );
    }

    const privileged = createServiceClient();
    const { error: updateError } = await privileged
      .from("files")
      .update({
        stage: "ready",
        // الحجم الحقيقي من التخزين، مش من كلام المتصفح.
        file_size: verified.size,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileId);

    if (updateError) {
      console.error(`files/complete: فشل تحديث الحالة — ${updateError.message}`);
      return NextResponse.json(
        { error: { code: "UPDATE_FAILED", message: "الملف اترفع بس التسجيل متحدّثش. حاول تاني." } },
        { status: 502 },
      );
    }

    // 📚 دمج المكتبات — الملف بيتسجّل كمان كـ material في مساحة العمل
    //    (نفس مصدر الحقيقة اللي بيشوفه الـ AI) — best-effort: فشله ما يفشّلش الرفع.
    let materialSynced = false;
    try {
      const { data: meta } = await privileged
        .from("files")
        .select("profile_id, original_name, file_type")
        .eq("id", fileId)
        .maybeSingle();
      const metaRow = meta as { profile_id?: string; original_name?: string; file_type?: string } | null;
      if (metaRow?.profile_id && metaRow.original_name) {
        const { data: blobData } = await privileged.storage.from(FILE_BUCKET).download(record.storage_path);
        if (blobData) {
          const kind = detectFileKind(metaRow.file_type ?? "", metaRow.original_name);
          let content: string | null = null;
          if (kind === "pdf" || kind === "docx" || kind === "pptx" || kind === "text") {
            const f = new File([blobData], metaRow.original_name);
            content = await extractTextFromFile(f, {
              maxFileBytes: 50 * 1024 * 1024,
              maxImageBytes: 1024 * 1024,
              maxTextChars: 200_000,
            });
          }
          const sync = await syncMaterialToWorkspace(privileged, {
            userId: metaRow.profile_id,
            title: metaRow.original_name,
            fileType: metaRow.file_type ?? null,
            fileSize: verified.size,
            content,
          });
          materialSynced = sync.ok;
        }
      }
    } catch (e) {
      console.warn("files/complete: material sync failed (non-blocking):", e);
    }

    return NextResponse.json({ ok: true, size: verified.size, materialSynced });
  } catch (error) {
    console.error("files/complete:", error);
    return NextResponse.json(
      { error: { code: "UNKNOWN", message: "حصل خطأ غير متوقع. حاول تاني." } },
      { status: 500 },
    );
  }
}
