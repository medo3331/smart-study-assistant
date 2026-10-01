import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { generateLectureDocument, type ExportFormat } from "@/lib/lectures/lecture-document";

/* ==========================================================================
   📤 /api/lectures/[id]/export — تصدير الشرح PDF / DOCX
   ═══════════════════════════════════════════════════════════════════════

   GET /api/lectures/[id]/export?format=pdf|docx

   ═══ الأمان — نفس نموذج `/process` حرفياً ═══
     1. جلسة؟ لو لأ → 401.
     2. قراءة المحاضرة بـ `id` + `user_id` من الجلسة.
        `user_id` **مش** بيتقرا من الـ query — لا من الـ body ولا من الـ URL.
     3. شرط تاني `.eq("user_id", user.id)` فوق RLS: طبقتان مستقلتين.
     4. محاضرة مش موجودة/مش بتاعتك → 404 (مش 403، عشان مانكشفش إن الـ id
        موجود أصلاً — نفس السبب في الراوت التاني).
     5. مافيش شرح؟ → 422 برسالة واضحة.

   ⚠️ **read-only**: الراوت ده **مافيش فيه أي write**. مافيش `.update` ولا
   `.insert` — التصدير بيقرأ ويولّد وخلاص. `transcript_text` و
   `summary` و `explanation` و `flashcards` و `mcqs` كلها بتفضل زي ما هي.

   ⚠️ مافيش لوج للمحتوى: بنطبع الكود والطول بس، **مش** نص المحاضرة.
   ═══════════════════════════════════════════════════════════════════════ */

/** أقصى مدة: تحميل الخط العربي من CDN + توليد PDF. */
export const maxDuration = 60;

const FORMATS: Record<string, ExportFormat> = { pdf: "pdf", docx: "docx" };

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    // ── ١) المصادقة ──
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

    // ── ٢) الصيغة ──
    const url = new URL(request.url);
    const rawFormat = url.searchParams.get("format") ?? "pdf";
    const format = FORMATS[rawFormat];
    if (!format) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "BAD_FORMAT", message: "الصيغة لازم تكون pdf أو docx." },
        },
        { status: 400 },
      );
    }

    const { id } = await ctx.params;

    // ── ٣) القراءة بفلتر الملكية (طبقة ثانية فوق RLS) ──
    const { data: lecture, error: readError } = await supabase
      .from("lectures")
      .select("id, title, original_filename, explanation")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (readError) {
      console.error(`lectures/export: فشل القراءة [${readError.code ?? "no-code"}]`);
      return NextResponse.json(
        {
          success: false,
          error: { code: "DB_READ_FAILED", message: "مقدرناش نقرأ المحاضرة. جرّب تاني." },
        },
        { status: 500 },
      );
    }

    if (!lecture) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "LECTURE_NOT_FOUND", message: "مفيش محاضرة بالـ id ده في حسابك." },
        },
        { status: 404 },
      );
    }

    // ── ٤) لازم يكون فيه شرح ──
    const explanation =
      typeof lecture.explanation === "string" ? lecture.explanation.trim() : "";
    if (explanation === "") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NO_EXPLANATION",
            message: "لا يوجد شرح لهذه المحاضرة بعد.",
          },
        },
        { status: 422 },
      );
    }

    // ── ٥) التوليد ──
    const title = (lecture.title ?? lecture.original_filename ?? "محاضرة").trim();
    const document = await generateLectureDocument(format, { title, explanation });

    // ⚠️ لوج تشخيصي بدون محتوى: الاسم والطول بس.
    console.log(`lectures/export: ${format} ok bytes=${document.buffer.length}`);

    return new NextResponse(new Uint8Array(document.buffer), {
      status: 200,
      headers: {
        "Content-Type": document.mimeType,
        // ⚠️ `attachment` + اسم مُنقّى: يمنع المتصفح من عرض الملف inline
        // أو تهريب أي محارف في الـ header.
        "Content-Disposition": `attachment; filename="${document.filename}"`,
        "Content-Length": String(document.buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("lectures/export: خطأ أثناء التوليد", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "EXPORT_FAILED",
          message: "حدث خطأ أثناء تجهيز الملف. حاول مرة أخرى.",
        },
      },
      { status: 500 },
    );
  }
}