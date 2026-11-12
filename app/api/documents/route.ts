import { NextResponse } from "next/server";

import { checkRateLimit, requireUser } from "@/lib/api-guard";
import { extractDocument, type ExtractedPage } from "@/lib/extract-text";
import { toMaterial, type MaterialRow } from "@/lib/pages-data";

/* ==========================================================================
   📄 /api/documents — رفع مستند + استخراجه صفحة بصفحة
   ============================================================================

   POST (multipart: file)
     بيستخرج الملف **على السيرفر**، وبيعمل اتنين:
       ① `materials` — النص المدمج (زي ما كان) ⇒ الـ chat source resolver
          والـ file analysis بيفضلوا شغّالين زي ما هما.
       ② `documents` + `knowledge_base` — الملف والصفحات ⇒ «العرض
          التقديمي» يقدر يبني عليه.

   GET ?materialId=<id>
     بيرجّع المستند بتاع مادة (id · title · page_count · unread_pages · deck).

   ⚠️ **ليه الرفع اتنقل للسيرفر**: الـ workspace كان بيطلّع النص (٦٠ ألف
   حرف) في المتصفح وبيحفظه. دلوقتي الـ workspace بيرفع الملف بس، والسيرفر
   بيستخرج ويخزّن. ده بيخلّي:
   - الـ payload بين المتصفح والسيرفر **أصغر بكتير** (الملف مش الـ نص).
   - استخراج الـ PPTX (اللي مافيش له ingestion في المتصفح أصلاً) ممكن.
   - الصفحات بتتخزّن **مرّة واحدة** بدل ما كل عميل يعيد الاستخراج.
   ========================================================================== */

/** أقصى حجم ملف (نفس حد `/api/analyze-file`). */
const MAX_FILE_BYTES = 8 * 1024 * 1024;
/** أقصى حجم الصور. */
const MAX_IMAGE_BYTES = 1024 * 1024;
/** أقصى طول النص المدمج (نفس حد `/api/analyze-file`). */
const MAX_TEXT_CHARS = 60_000;

export async function POST(request: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    const limited = await checkRateLimit(
      `document-upload:${user.id}`,
      10,
      60_000,
      "message",
    );
    if (limited) return limited;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: { message: "مفيش ملف اتبعت." } },
        { status: 400 },
      );
    }

    // ── الاستخراج (على السيرفر) ──
    const extracted = await extractDocument(file, {
      maxFileBytes: MAX_FILE_BYTES,
      maxImageBytes: MAX_IMAGE_BYTES,
      maxTextChars: MAX_TEXT_CHARS,
    });

    // ── ① المادة (النص المدمج) — زي ما كانت ──
    const { data: materialRow, error: materialError } = await supabase
      .from("materials")
      .insert({
        user_id: user.id,
        title: file.name,
        file_type: file.type || null,
        file_size: file.size,
        content: extracted.text,
      })
      .select("id, title, file_type, file_size, content, summary, note, created_at")
      .single();

    if (materialError) {
      console.error(
        `documents: فشل حفظ المادة [${materialError.code ?? "no-code"}]`,
      );
      return NextResponse.json(
        { error: { message: "مقدرناش نحفظ الملف. جرّب تاني." } },
        { status: 500 },
      );
    }

    // ⚠️ **نحوّل الصف لشكل `Material`** (camelCase) — نفس `fetchMaterials`.
    //    الراوت بيرجّع الصف زي ما هو (snake_case) ⇒ الواجهة كانت بتقرأ
    //    `fileType === undefined` ⇒ **زرار «عرض» مش بيظهر خالص**،
    //    و`createdAt === undefined` ⇒ التاريخ «Invalid Date».
    const material = toMaterial(materialRow as MaterialRow);

    // ── ② المستند + الصفحات ──
    // ⚠️ **ليه بنخزّن `material_id`**: عشان نربط المستند بالمادة (و vice
    //    versa) من غير ما نعمل استعلام في كل مرة.
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .insert({
        user_id: user.id,
        material_id: material.id,
        title: file.name,
        file_type: file.type || null,
        file_size: file.size,
        page_count: extracted.pageCount,
        status: extracted.unread.length > 0 ? "partial" : "ready",
        unread_pages: extracted.unread,
      })
      .select("id, title, file_type, page_count, status, unread_pages")
      .single();

    if (documentError) {
      console.error(
        `documents: فشل حفظ المستند [${documentError.code ?? "no-code"}]`,
      );
      return NextResponse.json(
        { error: { message: "مقدرناش نحفظ المستند. جرّب تاني." } },
        { status: 500 },
      );
    }

    // ── ③ الصفحات في `knowledge_base` ──
    // ⚠️ **من غير embedding**: ميزة العروض محتاجة النص بس. الـ RAG
    //    (match_knowledge) محتاج embeddings — دي شغل منفصل (مسجّل في
    //    TECH_DEBT N-011 مع الـ schema drift).
    //
    // ⚠️ **`source_type`/`source_kind` لازم يكونوا من القيم المسموحة**:
    //    CHECK constraint `kb_source_type_kind_check` في القاعدة بيقبل
    //    بس زوجين:
    //      (source_type='sample', source_kind='sample', بلا user/source)
    //      (source_type='user', source_kind IN ('material','lecture'),
    //       مع user_id و source_id)
    //    ⇒ صفحات المستند = **user / material** (المستند ده «مادة» في
    //    مساحة العمل) ✓ — والقيد موجود أصلاً في القاعدة (بره الـ migrations).
    const pageRows = extracted.pages
      .filter((page: ExtractedPage) => !page.empty)
      .map((page: ExtractedPage) => ({
        user_id: user.id,
        source_id: document.id,
        source_type: "user",
        source_kind: "material",
        source_name: file.name,
        source_page: String(page.number),
        chunk_index: page.index,
        content: page.text,
        // ⚠️ `subject` NOT NULL في الجدول — بنحط "عام" لأن الـ
        //    الربط بالمادة جاي من `source_id` مش من هنا.
        subject: "عام",
      }));

    if (pageRows.length > 0) {
      const { error: pagesError } = await supabase
        .from("knowledge_base")
        .insert(pageRows);
      if (pagesError) {
        // ⚠️ **مش fatal**: المادة والمستند اتحفظوا. السلايدات هتشتغل
        //    بـ error واضح، والصفحات مش هتتخزّن.
        console.error(
          `documents: فشل حفظ الصفحات [${pagesError.code ?? "no-code"}] ${pagesError.message ?? ""}`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      material,
      document: {
        ...document,
        unread: extracted.unread,
      },
      page_count: extracted.pageCount,
      unread: extracted.unread,
    });
  } catch (error) {
    console.error("documents: خطأ", error);
    return NextResponse.json(
      { error: { message: "حصل خطأ أثناء رفع الملف. حاول تاني." } },
      { status: 500 },
    );
  }
}

/* ═══════════════════════════ GET ═══════════════════════════ */

/** بيرجّع المستند بتاع مادة (للـ UI). */
export async function GET(request: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    const materialId = new URL(request.url).searchParams.get("materialId");
    const lectureId = new URL(request.url).searchParams.get("lectureId");

    if (!materialId && !lectureId) {
      return NextResponse.json(
        { error: { message: "لازم تحدّد المادة أو المحاضرة." } },
        { status: 400 },
      );
    }

    // ⚠️ **المستند بيتحدد بمصدر واحد**: يا `material_id` (ملف مرفوع)
    //    يا `lecture_id` (محاضرة). والقيد في القاعدة بيمنع الاتنين مع بعض.
    const query = supabase
      .from("documents")
      .select(
        "id, title, file_type, page_count, status, unread_pages, deck, source_unit, thumbnail",
      )
      .eq("user_id", user.id);

    const { data: document, error } = materialId
      ? await query.eq("material_id", materialId).maybeSingle()
      : await query.eq("lecture_id", lectureId!).maybeSingle();

    if (error) {
      console.error(`documents: فشل جلب المستند [${error.code ?? "no-code"}]`);
      return NextResponse.json(
        { error: { message: "مقدرناش نقرأ المستند." } },
        { status: 500 },
      );
    }
    if (!document) {
      return NextResponse.json(
        {
          error: {
            code: "NO_DOCUMENT",
            message: materialId
              ? "مفيش مستند متسجّل للمادة دي."
              : "مفيش عرض متسجّل للمحاضرة دي.",
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, document });
  } catch (error) {
    console.error("documents GET: خطأ", error);
    return NextResponse.json(
      { error: { message: "حصل خطأ." } },
      { status: 500 },
    );
  }
}
