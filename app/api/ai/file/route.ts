/**
 * /api/ai/file — توليد الملفات القابلة للتحميل (PDF / Word / Excel / PPT)
 *
 * بيرجّع الملف نفسه كـ binary stream مع Content-Disposition،
 * فالكلاينت يقدر يحمّله مباشرة من غير تخزين وسيط.
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import {
  generateFile,
  type FileContent,
  type FileType,
} from "@/lib/ai/file-generator";
import {
  consumeServiceQuota,
  refundServiceQuota,
  type AiServiceId,
} from "@/lib/ai/service-registry";

const VALID_TYPES: FileType[] = ["pdf", "docx", "xlsx", "pptx"];
const VALID_CONTENT: FileContent[] = ["summary", "quiz", "study_plan", "report", "flashcards"];

/** أقصى حجم مقبول لـ JSON البيانات — حماية من حمولات ضخمة. */
const MAX_DATA_JSON_CHARS = 200_000;

export async function POST(req: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: { message: "جسم الطلب غير صالح." } }, { status: 400 });
    }

    const type = body.type as FileType;
    const content = body.content as FileContent;
    const title = String(body.title ?? "").trim().slice(0, 200);
    const data = body.data;

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: { message: `نوع الملف غير مدعوم: ${String(type)}` } },
        { status: 400 }
      );
    }
    if (!VALID_CONTENT.includes(content)) {
      return NextResponse.json(
        { error: { message: `نوع المحتوى غير مدعوم: ${String(content)}` } },
        { status: 400 }
      );
    }
    if (title.length < 3) {
      return NextResponse.json(
        { error: { message: "اكتب عنوانًا للملف (٣ أحرف على الأقل)." } },
        { status: 400 }
      );
    }
    if (!data || typeof data !== "object") {
      return NextResponse.json(
        { error: { message: "لازم تبعت بيانات المحتوى (data)." } },
        { status: 400 }
      );
    }
    if (JSON.stringify(data).length > MAX_DATA_JSON_CHARS) {
      return NextResponse.json(
        { error: { message: "حجم البيانات أكبر من المسموح." } },
        { status: 400 }
      );
    }

    // حد الخدمة اليومي حسب الباقة (كل نوع ملف خدمة مستقلة)
    const quota = await consumeServiceQuota(supabase, user.id, `file_${type}` as AiServiceId);
    if (!quota.allowed) {
      return NextResponse.json(
        { error: { message: quota.reasonAr, code: "QUOTA_EXCEEDED", tier: quota.tier, resetAtUtc: quota.resetAtUtc } },
        { status: 402 }
      );
    }

    let result;
    try {
      result = await generateFile({
        type,
        content,
        title,
        subject: typeof body.subject === "string" ? body.subject.slice(0, 120) : undefined,
        data: data as Record<string, unknown>,
        studentName: typeof body.studentName === "string" ? body.studentName.slice(0, 120) : undefined,
        language: "ar",
      });
    } catch (e) {
      // التحويل فشل — نرجّع الحد اليومي للمستخدم
      refundServiceQuota(user.id, `file_${type}` as AiServiceId);
      throw e;
    }

    // RFC 5987 — اسم ملف يدعم العربية
    const encoded = encodeURIComponent(result.filename);
    return new Response(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `attachment; filename="file.${type}"; filename*=UTF-8''${encoded}`,
        "Content-Length": result.size.toString(),
        "X-Quota-Remaining": String(quota.remaining),
      },
    });
  } catch (err) {
    console.error("[File API]", err);
    return NextResponse.json(
      { error: { message: (err as Error).message || "تعذّر إنشاء الملف." } },
      { status: 500 }
    );
  }
}
