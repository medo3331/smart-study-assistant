import { NextResponse } from "next/server";

import { checkRateLimit, requireUser } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { runAiTask } from "@/lib/ai/tasks/runner";
import { consumeServiceQuota, refundServiceQuota } from "@/lib/ai/service-registry";
import {
  chunkPages,
  emptyDeckState,
  flattenDeck,
  generateDeckPart,
  SlidesError,
  type DeckState,
  type DocumentPage,
} from "@/lib/ai/slides";
import { generateDeckFile, type DeckFormat } from "@/lib/ai/slides-generator";

/* ==========================================================================
   🎨 /api/documents/[id]/slides — توليد عرض تقديمي من مستند
   ============================================================================

   POST { "partIndex"?: number, "format"?: "pptx" | "pdf" | "docx" }

   ⚠️ **التوليد on-demand**: الطلب ده بيمثّل **جزء واحد** بس (مجموعة
   صفحات). السبب: ميزانية المزوّد (TPM) — نداء واحد ≈ ٣٢٥٠ توكن،
   والحد ٨٠٠٠/دقيقة. فلو المستند ٤٨ صفحة اتولّد كله مرة واحدة ⇒
   Timeout + 429.

   ونفس فكرة «الشرح المكثف»: كل جزء بيتحفظ لحظه في
   `documents.deck` ⇒ refresh مبيضيّعشش تقدم.

   ═══ ترتيب الحمايات (مقصود) ═══
     1. جلسة؟ → 401
     2. حدّ استخدام خفيف → 429
     3. المستند (بفلتر المستخدم) → 404
     4. عنده صفحات؟ → 422
     5. حدّ الخدمة (باقة Pro/Ultra) → 402
     6. حارس الكروت → 429/403/402  ← **قبل** أي نداء موديل
     7. نداء الموديل (واحد)
     8. حفظ الجزء
   ========================================================================== */

/** صيغ الملفات المدعومة. */
const VALID_FORMATS: DeckFormat[] = ["pptx", "pdf", "docx"];

/** أقصى عدد أجزاء (الحماية من المستندات العملاقة). */
const MAX_PARTS = 40;

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
      typeof body?.format === "string" && VALID_FORMATS.includes(body.format as DeckFormat)
        ? (body.format as DeckFormat)
        : undefined;
    const partIndex =
      typeof body?.partIndex === "number" && Number.isInteger(body.partIndex)
        ? body.partIndex
        : undefined;

    // ── ٣) المستند (بفلتر المستخدم) ──
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("id, title, file_type, page_count, status, unread_pages, deck")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (docError) {
      console.error(
        `documents/slides: فشل جلب المستند [${docError.code ?? "no-code"}]`,
      );
      return NextResponse.json(
        {
          error: {
            message: "مقدرناش نقرأ المستند. جرّب تاني كمان شوية.",
          },
        },
        { status: 500 },
      );
    }
    if (!document) {
      return NextResponse.json(
        {
          error: { message: "مفيش مستند بالـ id ده في حسابك." },
        },
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

    const pages: DocumentPage[] = (
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

    // ── ٥) خطة الأجزاء ──
    const groups = chunkPages(pages);
    if (groups.length > MAX_PARTS) {
      return NextResponse.json(
        {
          error: {
            code: "TOO_MANY_PARTS",
            message: "المستند ده طويل أوي. جرّب جزء منه.",
          },
        },
        { status: 422 },
      );
    }

    const unit: DeckState["source"]["unit"] =
      document.file_type === "pptx"
        ? "slide"
        : document.file_type === "docx"
          ? "paragraph"
          : "page";
    const unitText =
      unit === "slide" ? "شريحة" : unit === "paragraph" ? "فقرة" : "صفحة";

    // الحالة المحفوظة (أو جديدة)
    const stored = document.deck as Partial<DeckState> | null;
    const base: DeckState =
      stored && stored.version === 1 && Array.isArray(stored.parts) && stored.parts.length === groups.length
        ? (stored as DeckState)
        : emptyDeckState({
            title: document.title,
            groups,
            source: {
              file_name: document.title,
              page_count: pages.length,
              unit,
            },
          });

    // ── ٦) أي جزء نولّده؟ ──
    const targetIndex =
      partIndex !== undefined
        ? partIndex
        : (base.parts.find((part) => part.status !== "ready")?.index ?? 0);

    if (targetIndex < 0 || targetIndex >= groups.length) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_PART_INDEX",
            message: `الجزء ده مش موجود. المستند ده فيه ${groups.length} أجزاء.`,
          },
        },
        { status: 400 },
      );
    }

    // ── ٧) حدّ الخدمة (باقة Pro/Ultra) ──
    const quota = await consumeServiceQuota(
      supabase,
      user.id,
      "documents_slides",
    );
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: {
            message: quota.reasonAr,
            code: "QUOTA_EXCEEDED",
            tier: quota.tier,
            resetAtUtc: quota.resetAtUtc,
          },
        },
        { status: 402 },
      );
    }

    // ── ٨) حارس الكروت — **قبل** أي نداء موديل ──
    // ⚠️ **كريدت واحد للمستند كله**: نفس المرجع عبر كل الأجزاء ⇒
    //    `reserve_ai_credit` بيرجّع `already_existed` (idempotent على
    //    `p_ref_id`) ⇒ الأجزاء التانية مجانية.
    const creditRefId = `document_slides:${user.id}:${document.id}`;
    const guard = await guardAiAccessAndReserve(
      supabase,
      user.id,
      "openai/gpt-oss-120b",
      { refId: creditRefId },
    );
    if (!guard.ok) {
      await refundServiceQuota(supabase, user.id, "documents_slides");
      return guard.response;
    }

    // ── ٩) التوليد (نداء واحد) ──
    let generated;
    try {
      generated = await generateDeckPart({
        group: groups[targetIndex],
        allPages: pages,
        totalParts: groups.length,
        unitLabel: unitText,
        deps: { runTask: runAiTask },
      });
    } catch (error) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      await refundServiceQuota(supabase, user.id, "documents_slides");
      throw error;
    }

    // ── ١٠) حفظ الجزء ──
    const nextState: DeckState = {
      ...base,
      title: base.title || document.title,
      total_parts: groups.length,
      parts: base.parts.map((part) =>
        part.index === targetIndex
          ? {
              ...part,
              status: "ready" as const,
              error: null,
              slides: generated.slides,
            }
          : part,
      ),
      source: base.source ?? {
        file_name: document.title,
        page_count: pages.length,
        unit,
      },
    };

    const { error: saveError } = await supabase
      .from("documents")
      .update({ deck: nextState, updated_at: new Date().toISOString() })
      .eq("id", document.id)
      .eq("user_id", user.id);

    if (saveError) {
      console.error(
        `documents/slides: فشل حفظ الـ deck [${saveError.code ?? "no-code"}]`,
      );
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      await refundServiceQuota(supabase, user.id, "documents_slides");
      return NextResponse.json(
        { error: { message: "العرض اتولّد بس مقدرش نحفظه." } },
        { status: 500 },
      );
    }

    // ── ١١) الرد ──
    // ⚠️ من غير `format` ⇒ بترجع الـ deck JSON (الواجهة بتعرضه).
    //    مع `format` ⇒ الملف نفسه (binary).
    if (!format) {
      const ready = nextState.parts.filter((part) => part.status === "ready").length;
      return NextResponse.json({
        ok: true,
        documentId: document.id,
        deck: nextState,
        slides: flattenDeck(nextState),
        total_parts: groups.length,
        ready_parts: ready,
        next_pending: nextState.parts.find((part) => part.status !== "ready")
          ?.index,
      });
    }

    const slides = flattenDeck(nextState);
    if (slides.length === 0) {
      return NextResponse.json(
        { error: { message: "مفيش شرائح جاهزة بعد." } },
        { status: 422 },
      );
    }

    const file = await generateDeckFile({
      format,
      state: nextState,
      slides,
    });

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
