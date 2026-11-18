/**
 * مصادر الامتحان — محاضرة (صوت) **أو** مستند (PDF/PPTX/DOCX)
 * ═══════════════════════════════════════════════════════════════════════
 * المشكلة اللي وصلّتنا: المولّد كان مربوط بـ`lectures` بس، فالطالب اللي
 * عنده PDF في مساحة العمل ومفيش عنده تسجيل صوتي ⇒ مفيش بند للملف ⇒
 * 502/503 («الخدمة مشغولة») من غير سبب حقيقي.
 *
 * ⚠️ **ليه بنقرا النص المستخرج بدل ما ناستخرج تاني**:
 *    المستند بيتستخرج **وقت الرفع** بـ`extractDocument` (lib/extract-text)
 *    والصفحات بتتخزّن في `knowledge_base` + النص المدمج في `materials`.
 *    الملف الأصلي نفسه **مش محفوظ** في storage ⇒ مينفعش نعمل
 *    `extractDocument` تاني مرة على السيرفر. فبنستخدم نفس ناتج
 *    الاستخراج (الصفحات) — وده حرفياً نفس النص اللي بيتولّد منه الامتحان.
 *
 * ⚠️ **التقطيع (chunking)**: النص بيعدّي على نفس `chunkTranscript` بتاع
 *    المحاضرات (6 آلاف حرف للقطعة) ⇒ ملف 50 صفحة بيتقطّع لمجموعات،
 *    ومينفعش نبعته كله في نداء واحد.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { chunkTranscript } from "./lecture-prompts";

/** أقصى عدد حروف لكل مصدر (متوافق مع سقف الجلسة في القاعدة: 60 ألف). */
export const EXAM_SOURCE_MAX_CHARS = 60_000;

/** طول القطعة الواحدة (نفس `DEFAULT_CHUNK_CHARS` بتاع المحاضرات). */
export const EXAM_SOURCE_CHUNK_CHARS = 6_000;

/** نوع مصدر البند. */
export type ExamSourceKind = "recording" | "document" | "topic";

/** 🌍 أقصى طول للموضوع العام (نص) — نفس سقف الـRPC (300 حرف). */
export const EXAM_TOPIC_MAX_CHARS = 300;

/** 🌍 أدنى طول للموضوع العام — أقل منه مش «موضوع». */
export const EXAM_TOPIC_MIN_CHARS = 3;

export type ExamSource = {
  kind: ExamSourceKind;
  /** عنوان معروض للطالب. */
  title: string;
  /** النص الكامل (قبل التقطيع). */
  text: string;
  /** القطع بعد التقطيع. */
  chunks: string[];
  /** عدد الحروف. */
  chars: number;
};

/** صف `documents` (بعدة حقول زيادة بتنقص عبر الـselect). */
type DocumentRow = {
  id: string;
  title: string | null;
  material_id: string | null;
  status: string | null;
};

/** صف من `knowledge_base` (صفحة/شريحة من مستند). */
type KnowledgePageRow = {
  source_page: string | number | null;
  chunk_index: number | null;
  content: string | null;
};

/**
 * نص المستند: من صفحات `knowledge_base` (المستخرجة وقت الرفع).
 *
 * ⚠️ **الترتيب**: `source_page` (رقم الصفحة) وبعده `chunk_index` (القطعة
 *    جوه الصفحة) — عشان النص يطلع بترتيب القراءة، مش عشوائي.
 */
export async function readDocumentText(
  supabase: SupabaseClient,
  args: { documentId: string; userId: string }
): Promise<{ title: string; text: string } | null> {
  const { documentId, userId } = args;

  // ① المستند نفسه (ملكية + العنوان).
  const { data: docData, error: docError } = await supabase
    .from("documents")
    .select("id, title, material_id, status")
    .eq("id", documentId)
    .eq("user_id", userId)
    .limit(1);

  if (docError || !docData) return null;
  const doc = (Array.isArray(docData) ? docData[0] : docData) as DocumentRow | null;
  if (!doc) return null;

  // ② الصفحات المستخرجة (نص PDF/PPTX/DOCX).
  const { data: pageData, error: pageError } = await supabase
    .from("knowledge_base")
    .select("source_page, chunk_index, content")
    .eq("source_id", documentId)
    .eq("source_type", "user")
    .eq("source_kind", "material")
    .order("source_page", { ascending: true })
    .order("chunk_index", { ascending: true })
    .limit(500);

  if (!pageError && Array.isArray(pageData)) {
    const pages = pageData as KnowledgePageRow[];
    const text = pages
      .map((page) => (typeof page.content === "string" ? page.content : ""))
      .join("\n\n")
      .trim();
    if (text) {
      return { title: doc.title ?? "مستند", text: text.slice(0, EXAM_SOURCE_MAX_CHARS) };
    }
  }

  // ③ احتياطي: النص المدمج في `materials` (نفس الاستخراج وقت الرفع).
  if (doc.material_id) {
    const { data: matData } = await supabase
      .from("materials")
      .select("id, title, content")
      .eq("id", doc.material_id)
      .eq("user_id", userId)
      .limit(1);
    const material = (Array.isArray(matData) ? matData[0] : matData) as
      | { title?: string | null; content?: string | null }
      | null;
    const content = typeof material?.content === "string" ? material.content.trim() : "";
    if (content) {
      return {
        title: doc.title ?? material?.title ?? "مستند",
        text: content.slice(0, EXAM_SOURCE_MAX_CHARS),
      };
    }
  }

  return null;
}

/**
 * يبني مصدر البند — نص واحد مجهّز للـAI ومقطّع.
 *
 * ⚠️ **التقطيع هنا**: النص بيروح على `chunkTranscript` ⇒ ملف PDF كبير
 *    بيتقطّع لمجموعات، والنداءات بتاخد قطعة piece (زي المحاضرات).
 */
export function buildExamSource(input: {
  kind: ExamSourceKind;
  title: string;
  text: string;
}): ExamSource {
  const text = input.text.trim();
  const chunks = chunkTranscript(text, EXAM_SOURCE_CHUNK_CHARS);
  return {
    kind: input.kind,
    title: input.title,
    text,
    chunks,
    chars: text.length,
  };
}

/** تسمية المصدر في الواجهة (الفرق بين «محاضرة» و«مستند» و«موضوع»). */
export function examSourceLabel(kind: ExamSourceKind): string {
  if (kind === "document") return "مستند";
  if (kind === "topic") return "موضوع عام";
  return "محاضرة";
}

/**
 * 🌍 هل عند الطالب مصادر-file قابلة للاستخدام في الامتحان؟
 *
 * ⚠️ **ليه**: عشان المساعد يقترح «موضوع عام» (امتحان من معلومات الـAI)
 *    بدل ما يقول «مفيش محاضرات» — ودي استعلامات cheap بـhead (بلا صفوف).
 *
 * ⚠️ **محاضرة بلا تفريغ مش مصدر**: من غير تفريغ مينفعش توليد ⇒ بنحسبها
 *    زي ما المولّد بيحسبها (بيطلب transcript_text غير فاضي).
 */
export async function userHasExamSources(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { count: lectureCount } = await supabase
    .from("lectures")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("transcript_text", "is", null);

  if (typeof lectureCount === "number" && lectureCount > 0) return true;

  const { count: documentCount } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  return typeof documentCount === "number" && documentCount > 0;
}

/**
 * 🌍 ينضّف نص الموضوع العام (طبقة السيرفر — مش في المتصفح).
 *
 * ⚠️ **ليه**: النص جاي من المستخدم ⇒ لازم تنظيف (مسافات/تحكّم) قبل ما
 *    يتبعت للـAI أو يتحفظ في القاعدة.
 */
export function normalizeTopic(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < EXAM_TOPIC_MIN_CHARS) return null;
  return cleaned.slice(0, EXAM_TOPIC_MAX_CHARS);
}
