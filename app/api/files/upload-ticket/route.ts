import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/api-guard";
import {
  FileStorageError,
  MAX_FILE_BYTES,
  createFileUploadTicket,
  fileCategory,
} from "@/lib/files/storage";
import { checkSubscriptionQuota, refundSubscriptionQuota } from "@/lib/ai/quota-check";
import { resolveActor } from "@/lib/policy";
import { createServiceClient } from "@/lib/supabase/admin";

/* ==========================================================================
   📁 /api/files/upload-ticket — تذكرة رفع ملف مذاكرة
   ══════════════════════════════════════════════════════════════════════════

   POST JSON { filename, size }
     → فحص (تسجيل دخول + كوتة + نوع + حجم) ثم:
       ① صف في `files` (stage='uploading') — المالك هو الطالب
       ② تذكرة رفع موقّعة (presigned PUT) على مسار واحد

   المتصفح بعدها يرفع الملف **مباشرة** للـ Storage — الملف عمره ما بيلمس
   الفانكشن، فمفيش حد 4.5 ميجا بتاع Vercel.
   ========================================================================== */

export async function POST(request: NextRequest) {
  try {
    const { user, supabase, response: authError } = await requireUserSafe();
    if (authError) return authError;

    const limited = await checkRateLimit(`file-upload:${user.id}`, 20, 60_000, "message");
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) as
      | { filename?: unknown; size?: unknown }
      | null;
    const filename = typeof body?.filename === "string" ? body.filename.trim() : "";
    const size = typeof body?.size === "number" ? body.size : NaN;
    if (!filename || !Number.isFinite(size)) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "طلب غير صالح — مفيش اسم أو حجم ملف." } },
        { status: 400 },
      );
    }

    const actor = await resolveActor(supabase, user.id, user.email ?? null);
    const quota = await checkSubscriptionQuota(user.id, "upload", actor.isOwner);
    if (!quota.allowed) {
      return NextResponse.json(
        { error: { code: "QUOTA_EXCEEDED", message: quota.reasonAr ?? "تم تجاوز حد الخدمة." } },
        { status: 429 },
      );
    }

    // فحص مبكر للنوع — الحقيقي بيحصل تاني في التذكرة.
    if (!fileCategory(filename)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_FILE_TYPE",
            message: "نوع الملف غير مدعوم. المسموح: PDF, Word, نص, صور, فيديو, صوت.",
          },
        },
        { status: 400 },
      );
    }

    const category = fileCategory(filename)!;
    if (size > MAX_FILE_BYTES[category]) {
      const mb = Math.round(MAX_FILE_BYTES[category] / (1024 * 1024));
      return NextResponse.json(
        { error: { code: "FILE_TOO_LARGE", message: `حجم الملف كبير أوي. أقصى مسموح ${mb} ميجا.` } },
        { status: 413 },
      );
    }

    const ticket = await createFileUploadTicket({ userId: user.id, filename, size });

    // صف الملف — file_type لازم من قائمة القيد، فبنخزن الفئة مش الامتداد.
    const privileged = createServiceClient();
    const { data: row, error: insertError } = await privileged
      .from("files")
      .insert({
        profile_id: user.id,
        file_name: filename,
        original_name: filename,
        file_size: size,
        file_type: category,
        storage_path: ticket.path,
        stage: "uploading",
      })
      .select("id")
      .single();

    if (insertError || !row) {
      await refundSubscriptionQuota(user.id, "upload", quota.idempotencyKey);
      console.error(`files: فشل تسجيل الملف — ${insertError?.message}`);
      return NextResponse.json(
        { error: { code: "RECORD_FAILED", message: "فشل تسجيل الملف. حاول تاني." } },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      fileId: row.id as string,
      path: ticket.path,
      signedUrl: ticket.signedUrl,
      token: ticket.token,
    });
  } catch (error) {
    if (error instanceof FileStorageError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error("files/upload-ticket:", error);
    return NextResponse.json(
      { error: { code: "UNKNOWN", message: "حصل خطأ غير متوقع. حاول تاني." } },
      { status: 500 },
    );
  }
}

/** نفس حماية requireUser بس بترجع الـ response مباشرة بدون استثناء. */
async function requireUserSafe() {
  const { requireUser } = await import("@/lib/api-guard");
  return requireUser("message");
}
