import { NextResponse } from "next/server";

import { requireUser, checkRateLimit } from "@/lib/api-guard";
import {
  exportDeckFile,
  generateDeck,
  unitLabelFor,
} from "@/lib/ai/slides-service";
import { SlidesError, type DeckState } from "@/lib/ai/slides";

/* ==========================================================================
   🎬 /api/documents/[id]/slides — توليد عرض تقديمي من مستند
   ============================================================================

   POST { "partIndex"?: number, "format"?: "pptx" | "pdf" | "docx" }

   ⚠️ **التوليد on-demand**: الطلب ده بيمثّل **جزء واحد** بس (مجموعة
   صفحات). السبب: ميزانية المزوّد (TPM) — نداء واحد ≈ ٣٢٥٠ توكن،
   والحد ٨٠٠٠/دقيقة. فلو المستند ٤٨ صفحة اتولّد كله مرة واحدة ⇒
   Timeout + 429.

   ⚠️ **المحاضرات** ليها مسار تاني (`/api/lectures/[id]/slides`) لأن
   الوحدات مختلفة (مقاطع + توقيت). والمنطق مشترك كله في
   `lib/ai/slides-service.ts` ⇒ **منطق واحد** للتوليد في المشروع كله.
   ========================================================================== */

/**
 * ⏱ **مهلة التنفيذ**.
 *
 * ⚠️ **لازم!** من غيرها Vercel بيقتل الطلب عند ١٠-١٥ ثانية (الافتراضي)
 *    والتوليد بياخد ~١٠ ثواني ⇒ **502/504** للمستخدم.
 */
export const maxDuration = 300;

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    // ── ١) المصادقة ──
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    // ── ٢) حدّ استخدام خفيف ──
    const limited = await checkRateLimit(
      `document-slides:${user.id}`,
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

    // ── ٣) المستند (بفلتر المستخدم) ──
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select(
        "id, title, file_type, page_count, status, unread_pages, deck, source_unit",
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (docError) {
      console.error(
        `documents/slides: فشل جلب المستند [${docError.code ?? "no-code"}]`,
      );
      return NextResponse.json(
        { error: { message: "مقدرناش نقرأ المستند. جرّب تاني كمان شوية." } },
        { status: 500 },
      );
    }
    if (!document) {
      return NextResponse.json(
        { error: { message: "مفيش مستند بالـ id ده في حسابك." } },
        { status: 404 },
      );
    }

    // ── ٤) الصفحات ──
    // ⚠️ الصفحات متخزّنة في `knowledge_base` (source_id = documents.id).
    //    `source_page` نص ⇒ بنرتّبها رقمياً.
    const { data: pageRows, error: pageError } = await supabase
      .from("knowledge_base")
      .select("source_page, content")
      .eq("source_id", document.id)
      .eq("user_id", user.id)
      .eq("source_type", "user")
      .eq("source_kind", "material")
      .order("chunk_index", { ascending: true });

    if (pageError) {
      console.error(
        `documents/slides: فشل جلب الصفحات [${pageError.code ?? "no-code"}]`,
      );
      return NextResponse.json(
        { error: { message: "مقدرناش نقرأ صفحات المستند." } },
        { status: 500 },
      );
    }

    const pages = (
      (pageRows ?? []) as Array<{ source_page: string | null; content: string | null }>
    )
      .map((row) => ({
        number: Number(row.source_page ?? 0),
        text: typeof row.content === "string" ? row.content : "",
      }))
      .filter((page) => page.number > 0 && page.text.trim() !== "")
      .sort((a, b) => a.number - b.number);

    if (pages.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "NO_PAGES",
            message:
              "المستند ده مفيهوش صفحات مقروءة. ارفعه من جديد أو جرّب ملف تاني.",
          },
        },
        { status: 422 },
      );
    }

    // ⚠️ **نوع الوحدة** — من `source_unit` (مصدر الحقيقة) مع fallback
    //    على `file_type` للصفوف القديمة اللي اتعملت قبل العمود ده.
    const unit =
      document.source_unit ??
      (document.file_type === "pptx"
        ? "slide"
        : document.file_type === "docx"
          ? "paragraph"
          : "page");

    const result = await generateDeck({
      supabase,
      userId: user.id,
      pages,
      unit,
      // ⚠️ **المصدر نص مكتوب** (مش تفريغ) ⇒ مافيش تعليمات تنظيف ASR.
      sourceKind: "document",
      fileName: document.title,
      title: document.title,
      ...(partIndex !== undefined ? { partIndex } : {}),
      existingDeck: (document.deck as DeckState | null) ?? null,
      creditRefId: `document_slides:${user.id}:${document.id}`,
    });

    // ── حفظ الـ deck ──
    const { error: saveError } = await supabase
      .from("documents")
      .update({ deck: result.deck, updated_at: new Date().toISOString() })
      .eq("id", document.id)
      .eq("user_id", user.id);

    if (saveError) {
      console.error(
        `documents/slides: فشل حفظ الـ deck [${saveError.code ?? "no-code"}]`,
      );
      return NextResponse.json(
        { error: { message: "العرض اتولّد بس مقدرش نحفظه." } },
        { status: 500 },
      );
    }

    // ── الرد ──
    // ⚠️ من غير `format` ⇒ بترجع الـ deck JSON (الواجهة بتعرضه).
    //    مع `format` ⇒ الملف نفسه (binary).
    if (!format) {
      return NextResponse.json({
        ok: true,
        documentId: document.id,
        deck: result.deck,
        slides: result.slides,
        total_parts: result.totalParts,
        ready_parts: result.readyParts,
        next_pending: result.nextPending,
        unit,
        unit_label: unitLabelFor(unit),
        quota: result.quota,
      });
    }

    if (result.slides.length === 0) {
      return NextResponse.json(
        { error: { message: "مفيش شرائح جاهزة بعد." } },
        { status: 422 },
      );
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
    console.error("documents/slides: خطأ غير متوقع", error);
    return NextResponse.json(
      { error: { message: "حصل خطأ أثناء توليد العرض. جرّب تاني." } },
      { status: 502 },
    );
  }
}
