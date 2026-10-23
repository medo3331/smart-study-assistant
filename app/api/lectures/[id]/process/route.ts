import { NextResponse } from "next/server";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";

import { createClient } from "@/lib/supabase/server";
import {
  analyzeLecture,
  LectureAnalysisError,
  toSafeAnalysisError,
} from "@/lib/ai/lecture-analysis";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { runAiTask } from "@/lib/ai/tasks/runner";
import { chunkTranscript, DEFAULT_CHUNK_CHARS, type LectureAnalysisKind } from "@/lib/ai/lecture-prompts";
import {
  generateStudyContent,
  resolveStudyCount,
  saveStudyContent,
  StudyContentError,
  type StudyContentKind,
} from "@/lib/ai/lecture-study";

/* ==========================================================================
   🧠 /api/lectures/[id]/process — تلخيص وشرح محاضرة (Phase 4-A)
   ═══════════════════════════════════════════════════════════════════════

   POST { "type": "summary" | "explanation" | "all" | "flashcards" | "mcq", "count"?: 1..50 }

   ═══ ترتيب الحمايات (مقصود، مش اعتباطي) ═══
     1. جلسة؟ لو لأ → 401.
     2. body بالشكل الصح؟ لو غلط → 400.
     3. جلب المحاضرة **بفلتر المستخدم** → لو مش موجودة → 404.
     4. تفريغ فاضي؟ → 422.
     5. **حارس الكروت والـ rate limit → 429/403/402** (قبل أي نداء).
     6. نداء الموديل.
     7. حفظ النتيجة (patch على summary/explanation بس).

   ⚠️ **الترتيب ٥ قبل ٦ هو الحماية كلها**: لو اتنادى الموديل الأول، الرفض
   بيحصل بعد ما الكروت اتصرفت. `guardAiAccessAndReserve` هو نفس الحارس
   المستخدم في `/api/ai` و`/api/chat` — مافيش نظام تاني هنا.

   ⚠️ **ليه 404 مش 403** في الخطوة 3: لو رجعنا 403 كنا بنقول لصاحب
   الطلب إن المحاضرة دي **موجودة** بس مش له — ده تسريب معلومات (بيأكد
   إن الـ id صحيح). 404 بيقول «مفيش محاضرة ليك بالـ id ده» وهو أصدق
   وأأمن في نفس الوقت. نفس منطق RLS: ما نوريش صف مش بتاعك.

   ═══ مافيش في الرد ═══
   ولا مفتاح، ولا اسم مزوّد، ولا stack، ولا نص التفريغ. الرد فيه
   المحتوى المولّد بس.
   ═══════════════════════════════════════════════════════════════════════ */

/** أقصى مدة تنفيذ. map-reduce ممكن ياخد وقت على محاضرة طويلة. */
export const maxDuration = 300;

/**
 * 🔢 وزن كل عملية — **مستخدَم في التعليق والتشخيص فقط**، مش في الحجز.
 *
 * ⚠️ **ليه مش بنحجز بيه**: `guardAiAccessAndReserve` بيحجز **كredit واحد
 * لكل طلب** وبس — مافيش بارامتر `cost` في توقيعه. لو عدّلناه كده كنا
 * هنغيّر سلوك الحارس في `/api/ai` و`/api/chat` وكل الراوتات التانية،
 * وده خارج نطاق المرحلة دي خالص.
 *
 * السجل بيكفي: `all` بياخد credit واحد بس، لكن بيعمل نداءين (أو
 * أكتر مع chunking) — والحماية الفعلية هنا من **الـ rate limit** اللي
 * جوّه الحارس أصلاً، مش من عدد الكروت.
 */
const CREDIT_COST: Record<string, number> = {
  summary: 1,
  explanation: 1,
  all: 2,
};

/** الموديل اللي بيتحجّم عليه. مجاني ونصّي — زي `/api/exam-plan`. */
const GUARD_MODEL_ID = "openai/gpt-oss-120b";

/** تحويل `type` للعمليات المطلوبة. */
const KIND_MAP: Record<string, LectureAnalysisKind[]> = {
  summary: ["summary"],
  explanation: ["explanation"],
  all: ["summary", "explanation"],
};

/**
 * 🃏❓ أنواع المحتوى المولّد — Phase 4-B.
 *
 * ⚠️ **مافيش `all` هنا عمداً** (وهي نفس الملاحظة في الـ prompt):
 * `guardAiAccessAndReserve` بيحجز credit واحد لكل طلب. لو عملنا
 * `all` يولّد بطاقات وأسئلة، الطالب هياخد credit واحد مقابل **عمليتين
 * توليد مستقلتين** — محاسبة مضلّلة. فالنوعين منفصلين: كل واحد بياخد
 * credit واحد وبيمثّل عملية واحدة واضحة.
 */
const STUDY_TYPES: Record<string, StudyContentKind> = {
  flashcards: "flashcards",
  mcq: "mcq",
};

/** كل الأنواع المقبولة — للرسالة وال تحقق. */
const ALL_TYPES = [
  "summary",
  "explanation",
  "all",
  "flashcards",
  "mcq",
] as const;

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    // ── ١) المصادقة: من الجلسة، لا من الـ body ──
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

    // ── ٢) الـ body ──
    const body = (await request.json().catch(() => null)) as
      | { type?: unknown; count?: unknown }
      | null;
    const type = typeof body?.type === "string" ? body.type : "";
    const studyKind = STUDY_TYPES[type];

    // ⚠️ التحقق من النوع **قبل** أي حاجة غالية. `ALL_TYPES` واحدة
    // مصدر الحقيقة، والرسالة بتتولّد منها مش مكتوبة يدوي.
    if (!KIND_MAP[type] && !studyKind) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "BAD_TYPE",
            message: `نوع الطلب لازم يكون واحد من: ${ALL_TYPES.join("، ")}.`,
          },
        },
        { status: 400 },
      );
    }

    const { id } = await ctx.params;

    // ── ٣) جلب المحاضرة بفلتر صريح على المستخدم ──
    // ⚠️ الفلتر ده **مكمّل** للـ RLS مش بديل. RLS بيمنع القراءة أصلاً،
    // والفلتر بيخلّي الاستعلام نفسه مابيلغيش لحد غير المالك.
    const { data: lecture, error: fetchError } = await supabase
      .from("lectures")
      .select("id, transcript_text")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) {
      console.error(
        `lectures/process: فشل جلب المحاضرة [${fetchError.code ?? "no-code"}]`,
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DB_READ_FAILED",
            message: "مقدرناش نقرأ المحاضرة. جرّب تاني كمان شوية.",
          },
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

    // ── ٤) التفريغ ──
    const transcript = lecture.transcript_text;
    if (typeof transcript !== "string" || transcript.trim() === "") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NO_TRANSCRIPT",
            message: "مفيش تفريغ محفوظ للمحاضرة دي. ارفع المحاضرة من جديد الأول.",
          },
        },
        { status: 422 },
      );
    }

    /* ── ٥) حارس الكروت — **قبل أي نداء للموديل** ──
     *
     * ⚠️ **الترتيب ده هو كل الحماية**: لازم الحارس يتبعت قبل
     * `analyzeLecture`. لو نادينا الموديل الأول، الرفض بيحصل بعد ما
     * فلوسنا اتصرفت — و«منعت بعد ما خلصت» مش حماية.
     *
     * الحارس بيرجّع `Response` جاهزة (429/403/402) بترميز المشروع
     * الأصلي، فبنرجّع جسمها **زي ما هو** — مافيش نظام أخطاء تاني هنا.
     */
    const guard = await guardAiAccessAndReserve(supabase, user.id, GUARD_MODEL_ID);
    if (!guard.ok) {
      // ⚠️ ممنوع نكتب في المحاضرة ولا ننداء الموديل في الحالة دي.
      const guardBody = await guard.response.json().catch(() => ({
        ok: false,
        error: "خدمة الذكاء الاصطناعي مش متاحة دلوقتي. جرّب تاني بعد شوية.",
      }));
      const retryAfter = guard.response.headers.get("Retry-After");
      return NextResponse.json(guardBody, {
        status: guard.response.status,
        ...(retryAfter ? { headers: { "Retry-After": retryAfter } } : {}),
      });
    }

    /* ── ٦) التوليد ثم الحفظ ──
     *
     * ⚠️ كل حاجة جاية من هنا ممكن تكون **فشل مكلّف**، فأي خطأ بيرجّع
     * الكرت (`refundAiCreditIfNeeded`) عشان الطالب مايتحمّلش كروت نتيجة
     * خطأ مش من فعله — نفس النمط المستخدم في `/api/generate-game-questions`.
     */
    let result;
    try {
      // ⬇️ التفريع: محتوى المذاكرة (Phase 4-B) له مساره الخاص لأنه
      // بيبعت **JSON منظّم** مش نص Markdown. الملخص والشرح بيفضلوا على
      // `analyzeLecture` زي ما هما — مافيش تغيير في سلوكهم.
      if (studyKind) {
        const study = await generateStudyContent({
          kind: studyKind,
          transcript,
          count: resolveStudyCount(body?.count),
          deps: {
            runTask: runAiTask,
            chunk: chunkTranscript,
            chunkChars: DEFAULT_CHUNK_CHARS,
          },
        });
        await saveStudyContent({
          supabase,
          lectureId: lecture.id,
          userId: user.id,
          kind: studyKind,
          items: study.items,
        });
        // ⚠️ الرد بيرجّع النتيجة **فقط** — مافيش `saved` هنا: النجاح
        // واثق لأن `saveStudyContent` رما لو فشل.
        return NextResponse.json({
          success: true,
          lectureId: lecture.id,
          ...(studyKind === "flashcards" ? { flashcards: study.items } : { mcqs: study.items }),
        });
      }

      result = await analyzeLecture({
        supabase,
        lectureId: lecture.id,
        transcript,
        kinds: KIND_MAP[type],
        user: { userId: user.id },
      });
    } catch (error) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      throw error;
    }

    // لوج تشخيصي: وزن العملية والعدد الفعلي للنداءات. مفيد لو لاحظنا
    // استهلاكاً أعلى من المتوقّع ونحتاج نعرف هل السبب chunking.
    console.log(
      `lectures/process: ok type=${type} weight=${CREDIT_COST[type] ?? 1} aiCalls=${result.aiCalls} refId=${guard.refId}`,
    );

    // ⚠️ الرد بيرجّع بس اللي اتطلب + المعرّف. مافيش `transcript`
    // في الرد — الواجهة عندها النص أصلاً من الصفحة.
    return NextResponse.json({
      success: true,
      lectureId: lecture.id,
      ...(result.summary !== null ? { summary: result.summary } : {}),
      ...(result.explanation !== null ? { explanation: result.explanation } : {}),
    });
  } catch (error) {
    // ⚠️ لازم نفحص `StudyContentError` **قبل** `toSafeAnalysisError`، وإلا
    // الخطأ بيروح لمسار المزوّد ويرجع 502 generically بدل الـ 422/500
    // الصح — والطالب هيشوف رسالة غلط (مثلاً تفريغ فاضي يطلع «الخدمة
    // مش متاحة»).
    if (error instanceof StudyContentError) {
      console.error(`lectures/process: [${error.code}] ${error.message}`);
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }

    const safe = toSafeAnalysisError(error);
    if (!(error instanceof LectureAnalysisError)) {
      // لوج تشخيصي للخطأ الأصلي؛ الرد بياخد الرسالة الآمنة بس.
      console.error("lectures/process: خطأ غير متوقع", error);
    }
    return NextResponse.json(
      { success: false, error: { code: safe.code, message: safe.message } },
      { status: safe.status },
    );
  }
}
