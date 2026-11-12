import { NextResponse } from "next/server";

import { requireUser, checkRateLimit } from "@/lib/api-guard";
import {
  exportDeckFile,
  generateDeck,
  unitLabelFor,
} from "@/lib/ai/slides-service";
import { SlidesError, type DeckState } from "@/lib/ai/slides";
import { extractSegments, formatTimestamp } from "@/lib/ai/lecture-intensive";

/* ==========================================================================
   🎬 /api/lectures/[id]/slides — توليد عرض تقديمي من محاضرة
   ============================================================================

   POST { "partIndex"?: number, "format"?: "pptx" | "pdf" | "docx" }

   ═══ ليه مسار منفصل مش نفس `/api/documents/[id]/slides` ═══
   الوحدات مختلفة: المستند ⇒ صفحات/شرائح/فقرات (من `knowledge_base`)،
   والمحاضرة ⇒ **مقاطع التفريغ** (من `transcript_data.segments`).

   ⇒ كل المنطق المشترك (التقطيع · التوليد · التحقق من المراجع · الكريديت ·
   الحفظ · التصدير) في `lib/ai/slides-service.ts` — والمساران بيستدعوا
   نفس الدالة. ⇒ **منطق واحد** للتوليد في المشروع كله.

   ═══ المرجع هنا = توقيت مش رقم ═══
   كل مقطع ليه `start` ⇒ الليبل «دقيقة 12:30».
   - `page` في الـ JSON بيفضل **رقم المقطع** (الموديل بيرجّعه حرفياً).
   - `label` (الليبل المعروض) بيتحسب **من عندنا** مش من الموديل.

   ═══ الكريديت ═══
   `refId = lecture_slides:<userId>:<lectureId>` ⇒ **كريدت واحد
   للمحاضرة** مهما كان عدد الأجزاء (idempotent على `p_ref_id`).
   ========================================================================== */

/**
 * ⏱ **مهلة التنفيذ**.
 *
 * ⚠️ **لازم!** من غيرها Vercel بيقتل الطلب عند ١٠-١٥ ثانية (الافتراضي)
 *    والتوليد بياخد ~١٠ ثواني ⇒ **502/504** للمستخدم.
 * (الشرح المكثف بيستخدم نفس القيمة.)
 */
export const maxDuration = 300;

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    const limited = await checkRateLimit(
      `lecture-slides:${user.id}`,
      10,
      60_000,
      "message",
    );
    if (limited) return limited;

    const { id } = await ctx.params;

    const body = (await request.json().catch(() => null)) as {
      partIndex?: unknown;
      format?: unknown;
    } | null;
    const format =
      body?.format === "pptx" || body?.format === "pdf" || body?.format === "docx"
        ? body.format
        : undefined;
    const partIndex =
      typeof body?.partIndex === "number" && Number.isInteger(body.partIndex)
        ? body.partIndex
        : undefined;

    // ── المحاضرة (بفلتر المستخدم) ──
    const { data: lecture, error: lectureError } = await supabase
      .from("lectures")
      .select("id, title, original_filename, transcript_data")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lectureError) {
      console.error(
        `lectures/slides: فشل جلب المحاضرة [${lectureError.code ?? "no-code"}]`,
      );
      return NextResponse.json(
        { error: { message: "مقدرناش نقرأ المحاضرة. جرّب تاني." } },
        { status: 500 },
      );
    }
    if (!lecture) {
      return NextResponse.json(
        { error: { message: "مفيش محاضرة بالـ id ده في حسابك." } },
        { status: 404 },
      );
    }

    // ── المقاطع = وحدات العرض ──
    // ⚠️ **من `transcript_data` مباشرة** — مش من `knowledge_base`.
    //    (مقاطع المحاضرة أصلاً في `transcript_data`؛ تخزينها تاني في
    //    الـ kb كان هيعمل تكرار لحدود الـ ٥٠٠ ك.ب.)
    const segments = extractSegments(lecture.transcript_data);
    if (segments.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "NO_SEGMENTS",
            message:
              "المحاضرة دي مفيهاش مقاطع بتوقيتات. من غيرها مش نقدر نعمل مراجع دقيقة.",
          },
        },
        { status: 422 },
      );
    }

    const pages = segments.map((segment) => ({
      // ⚠️ `number` = **رقم المقطع** (1-based) — هو اللي بيرجعه الموديل
      //    كـ `page` (لأنه بينسخ الـ anchor بالحرف).
      number: segment.index + 1,
      text: segment.text,
      // ⚠️ **الليبل المعروض** — التوقيت. ده اللي بيظهر في الـ footer
      //    وفي شارة المصدر («دقيقة 12:30» مش «مقطع ٤»).
      label: `دقيقة ${formatTimestamp(segment.start)}`,
    }));

    // ── صف المستند (حاوية الـ deck) ──
    // ⚠️ **مش بنخزّن المقاطع تاني** — الـ deck نفسه (JSON) هو اللي
    //    بيحتاج يتخزّن. الصف بيربط الـ deck بالمحاضرة.
    const { data: existing } = await supabase
      .from("documents")
      .select("id, deck")
      .eq("lecture_id", lecture.id)
      .eq("user_id", user.id)
      .maybeSingle();

    const title = lecture.title ?? lecture.original_filename ?? "عرض المحاضرة";
    const fileName = lecture.original_filename ?? title;

    const result = await generateDeck({
      supabase,
      userId: user.id,
      pages,
      unit: "segment",
      // ⚠️ **المصدر تفريغ صوتي** ⇒ تعليمات تنظيف الـ ASR + إعادة الصياغة.
      sourceKind: "transcript",
      fileName,
      title,
      ...(partIndex !== undefined ? { partIndex } : {}),
      existingDeck: (existing?.deck as DeckState | null) ?? null,
      creditRefId: `lecture_slides:${user.id}:${lecture.id}`,
    });

    // ── حفظ الـ deck ──
    const { error: saveError } = await supabase
      .from("documents")
      .upsert(
        {
          user_id: user.id,
          lecture_id: lecture.id,
          title,
          source_unit: "segment",
          page_count: pages.length,
          status: "ready",
          deck: result.deck,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "lecture_id,user_id" },
      );

    if (saveError) {
      console.error(
        `lectures/slides: فشل حفظ الـ deck [${saveError.code ?? "no-code"}]`,
      );
      return NextResponse.json(
        { error: { message: "العرض اتولّد بس مقدرش نحفظه." } },
        { status: 500 },
      );
    }

    // ── الرد ──
    if (!format) {
      return NextResponse.json({
        ok: true,
        lectureId: lecture.id,
        deck: result.deck,
        slides: result.slides,
        total_parts: result.totalParts,
        ready_parts: result.readyParts,
        next_pending: result.nextPending,
        unit: "segment",
        unit_label: unitLabelFor("segment"),
        quota: result.quota,
      });
    }

    const file = await exportDeckFile(result.deck, result.slides, format);
    const encoded = encodeURIComponent(file.filename);
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="deck.${format}"; filename*=UTF-8''${encoded}`,
        "Content-Length": String(file.size),
      },
    });
  } catch (error) {
    if (error instanceof SlidesError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error("lectures/slides: خطأ غير متوقع", error);
    return NextResponse.json(
      { error: { message: "حصل خطأ أثناء توليد العرض. جرّب تاني." } },
      { status: 502 },
    );
  }
}
