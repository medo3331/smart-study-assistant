import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";

/* ==========================================================================
   Lesson Notes — Phase 1 · CRUD راوت واحد.

   ملاحظة واحدة لكل درس: GET يجيبها، PUT يعمل upsert عليها. مفيش DELETE —
   «الحذف» في Phase 1 يعني تفريغ المحتوى، وده PUT عادي. الشكل ده
   (قفل unique على (user_id, lesson_id) + upsert) هو اللي خلّانا نختار
   ملاحظة واحدة بدل قائمة — أنضف بكتير في الحالة دي.

   🔒 الـuser_id بيتقرأ من الـsession على السيرفر، مش من الـbody ولا من
      الـquery. متاحش للكلاينت يبعتلنا user_id بتاع حد تاني أصلاً: مش
       بنقرأه من الـbody خالص. الـRLS كمان شغّال: لو الـbody اتزوّرت،
      الـauth.uid() هو اللي بيتحقق ويبقى هو المالك.

   النمط: نفس requireUser بتاع باقي الراوتات + NextResponse.json({ ok })،
   زي /api/lesson/video/route.ts.
   ========================================================================== */

/** أقصى طول للملاحظة. حدّ أدنى مبسوط مش حماية — Supabase بحدّ برضه. */
const MAX_CONTENT_CHARS = 20000;

/** lessonId لازم uuid. أي حاجة تانية (رقم، نص عشوائي) مرفوضة قبل الـDB. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  const { user, supabase, response: authError } = await requireUser("message");
  if (authError) return authError;

  const lessonId = req.nextUrl.searchParams.get("lessonId")?.trim() ?? "";
  if (!UUID_RE.test(lessonId)) return fail("lessonId غير صالح.", 400);

  /* eq("user_id") مقصود حتى مع RLS: RLS بيمنع صف حد تاني يقريه، و
     الشرط الصريح بيخلي النية واضحة في الكود — والقاعدة الواحدة دي مكرّرة
     في كل استعلام في المشروع (اللي بنكتبه أصلاً مكسور). */
  const { data, error } = await supabase
    .from("notes")
    .select("content, created_at, updated_at")
    .eq("user_id", user!.id)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (error) return fail(error.message, 500);

  /* مفيش صف = مفيش ملاحظة. مش خطأ: الطالب لسه ما كتبش.
     بنرجّع content فاضي بدل 404 عشان الكلاينت ميفرقش بين
     «مفيش ملاحظة» و«فيه ملاحظة فاضية» — الاتنين نفس الشكل للمستخدم. */
  return NextResponse.json({
    ok: true,
    content: data?.content ?? "",
    updatedAt: data?.updated_at ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const { user, supabase, response: authError } = await requireUser("message");
  if (authError) return authError;

  const body = (await req.json().catch(() => null)) as {
    lessonId?: unknown;
    content?: unknown;
  } | null;

  if (!body || typeof body !== "object") return fail("البيانات المبعوتة غير صالحة.", 400);

  const lessonId = typeof body.lessonId === "string" ? body.lessonId.trim() : "";
  if (!UUID_RE.test(lessonId)) return fail("lessonId غير صالح.", 400);

  const content = typeof body.content === "string" ? body.content : "";
  if (content.length > MAX_CONTENT_CHARS) {
    return fail(`الملاحظة أطول من الحد المسموح (${MAX_CONTENT_CHARS} حرف).`, 400);
  }

  /* updated_at من التطبيق — مفيش trigger على الجدول (db/notes.sql)، وده
     نفس precedent المشروع (materials.note). */
  const now = new Date().toISOString();

  /* upsert على (user_id, lesson_id) — ماشي على الـunique constraint في
     db/notes.sql. onConflict بيخلي الدالة تنجح في الحالتين: صف موجود
     (update) أو مفيش (insert).
     الحقول مش بتتفاضل — غيرها لازم نبعت columnName=  صراحة، وده أطول
     وممكن يغلط. */
  const { data, error } = await supabase
    .from("notes")
    .upsert(
      { user_id: user!.id, lesson_id: lessonId, content, updated_at: now },
      { onConflict: "user_id,lesson_id" }
    )
    .select("content, updated_at")
    .single();

  if (error) return fail(error.message, 500);

  return NextResponse.json({
    ok: true,
    content: data.content,
    updatedAt: data.updated_at,
  });
}
