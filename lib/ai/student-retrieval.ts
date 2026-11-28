/* ==========================================================================
   Student Retrieval — استرجاع دائم من ملفات الطالب + ذاكرة أسئلته السابقة
   ==========================================================================
   ليه الوحدة دي موجودة: حقن محتوى المصدر كان مربوط بنية «بحث في الملفات»
   الصريحة (كلمة ملف/محاضرة في السؤال) — فسؤال محتوى عادي («اشرحلي اللي
   اتقال عن X») كان بيجاوب من معلومة. هنا بنسترجع مقتطفات ذات صلة لـ **أي**
   سؤال، fail-open دايماً: أي فشل في DB بيرجّع [] والشات مكمل عادي.
   ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface StudentSnippet {
  title: string;
  family: "material" | "lecture";
  snippet: string;
}

/** أقصى عدد شروط `or` في استعلام واحد (PostgREST آمن ومحدود). */
const MAX_ILIKE_TERMS = 8;
const MIN_TERM_CHARS = 3;

const AR_STOPWORDS = new Set([
  "في", "من", "على", "عن", "الى", "عند", "مع", "هذا", "هذه", "انا", "انت", "هو",
  "هي", "كده", "ده", "دة", "دي", "اللي", "ايه", "ازاي", "ليه", "فين", "عايز",
  "عاوز", "اريد", "ممكن", "لازم", "كل", "او", "ما", "هل", "بس", "جدا", "بعد",
  "قبل", "لما", "لو", "يكون", "بقى", "شوف", "كمان", "برضه", "عايزين", "دة",
  "اللى", "عشان", "احنا", "انتى", "طيب", "خلاص", "يلا", "شكرا", "مرحبا",
  "ال", "الى", "دلوقتي", "دلوقتى", "اشرح", "اشرحلي", "وضح", "وضحلي",
  "لخص", "لخصلي", "هات", "هاتلي", "دول", "عندي", "اتقال", "قال",
  "the", "and", "for", "you", "what", "how", "why", "this", "that", "with",
  "please", "explain", "about", "can", "could", "would", "was", "are",
]);

/**
 * استخراج كلمات البحث من رسالة الطالب — كلمات صافية بلا stopwords.
 * التطبيع محدود عمداً (تشكيل + lowercase بس): الـ `ilike` بيضرب في النص
 * الخام في الداتابيز، فلو طبّعنا الألف والهاء مش هنعرف مطابقة.
 */
export function extractQueryTerms(message: string): string[] {
  const words = message
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= MIN_TERM_CHARS && !AR_STOPWORDS.has(w));
  return [...new Set(words)].slice(0, MAX_ILIKE_TERMS);
}

/**
 * تهريب محارف PostgREST — `%` و `_` wildcards و`,` و`.` و`(` فواصل
 * في صيغة الـ `or` (نفس قاعدة searchUserFiles في magicly-tools).
 */
function escapeIlikeTerm(term: string): string {
  const cleaned = term.replace(/[%,_()*"\\]/g, "").trim();
  return cleaned.length >= 2 ? cleaned : "";
}

/**
 * مقتطف حول موضع أول مطابقة — مش أول maxChars حرف (دي غالباً مقدمة
 * الملزمة). بيختار النافذة اللي بتغطي أكبر عدد كلمات مختلفة من السؤال.
 */
export function excerptAroundTerms(
  text: string,
  terms: string[],
  maxChars: number
): string {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ");
  const lower = flat.toLowerCase();
  const hits: number[] = [];
  for (const term of terms) {
    const needle = term.toLowerCase();
    let idx = lower.indexOf(needle);
    let scanned = 0;
    while (idx >= 0 && scanned < 8) {
      hits.push(idx);
      scanned++;
      idx = lower.indexOf(needle, idx + needle.length);
    }
  }
  if (hits.length === 0) {
    return flat.slice(0, maxChars);
  }
  const uniqueStarts = [...new Set(hits)].sort((a, b) => a - b).slice(0, 16);
  let best = uniqueStarts[0];
  let bestScore = -1;
  for (const start of uniqueStarts) {
    const window = lower.slice(start, start + maxChars);
    let score = 0;
    for (const term of terms) {
      if (window.includes(term.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = start;
    }
  }
  const start = Math.max(0, best - Math.floor(maxChars / 3));
  const prefix = start > 0 ? "…" : "";
  return `${prefix}${flat.slice(start, start + maxChars)}`;
}

/** تنسيق المقتطفات كبلوك سياق — نص خام مش تعليمات (نفس أسلوب الـ digest). */
export function formatStudentSnippets(
  hits: StudentSnippet[],
  maxChars = 3200
): string {
  if (hits.length === 0) return "";
  const lines = hits.map((h) => `- «${h.title}»: ${h.snippet}`);
  return lines.join("\n").slice(0, maxChars);
}

/**
 * استرجاع مقتطفات ذات صلة من ملفات الطالب (materials + محاضرات مكتملة)
 * بـ `ilike` لكل كلمة على حدة — جملة السؤال كلها كـ ilike واحدة عملياً
 * بتضرب أبداً. مفيش embeddings هنا: استرجاع نصي رخيص fail-open، والـ
 * embeddings الممولة من موديل بتاخد مكانها بعد إثبات الجودة (D-DEV-025).
 */
export async function retrieveStudentSnippets(
  supabase: SupabaseClient,
  userId: string,
  message: string,
  options?: { snippetChars?: number }
): Promise<StudentSnippet[]> {
  if (!userId) return [];
  const terms = extractQueryTerms(message)
    .map(escapeIlikeTerm)
    .filter((t) => t.length >= 2);
  if (terms.length === 0) return [];

  const snippetChars = options?.snippetChars ?? 600;
  const materialConds = terms.flatMap((t) => [
    `title.ilike.%${t}%`,
    `content.ilike.%${t}%`,
  ]);
  const lectureConds = terms.flatMap((t) => [
    `title.ilike.%${t}%`,
    `transcript_text.ilike.%${t}%`,
  ]);

  try {
    const [materialsRes, lecturesRes] = await Promise.all([
      supabase
        .from("materials")
        .select("title, content, summary")
        .eq("user_id", userId)
        .or(materialConds.join(","))
        .limit(3),
      supabase
        .from("lectures")
        .select("title, original_filename, transcript_text")
        .eq("user_id", userId)
        .eq("status", "completed")
        .or(lectureConds.join(","))
        .limit(2),
    ]);

    const hits: StudentSnippet[] = [];

    for (const row of materialsRes.data ?? []) {
      const title = String(row.title ?? "ملف").trim() || "ملف";
      const text = String(row.content ?? row.summary ?? "");
      if (!text.trim()) continue;
      hits.push({
        title,
        family: "material",
        snippet: excerptAroundTerms(text, terms, snippetChars),
      });
    }

    for (const row of lecturesRes.data ?? []) {
      const text = String(row.transcript_text ?? "");
      if (!text.trim()) continue;
      const title =
        String(row.title ?? row.original_filename ?? "").trim() || "محاضرة";
      hits.push({
        title: `محاضرة: ${title}`,
        family: "lecture",
        snippet: excerptAroundTerms(text, terms, snippetChars),
      });
    }

    return hits;
  } catch {
    return [];
  }
}

/**
 * آخر أسئلة الطالب عبر كل المحادثات — ذاكرة «بيسأل عن إيه قبل كده».
 * الأحدث أولاً من DB، وبرجّعها أقدم→أحدث عشان تسير كخط زمني طبيعي.
 * bounded + dedupe + بدون أي محتوى للـ assistant (أسئلة الطالب بس).
 */
export async function getRecentQuestions(
  supabase: SupabaseClient,
  userId: string,
  limit = 6
): Promise<string[]> {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("content")
      .eq("user_id", userId)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(limit * 4);
    if (error) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of data ?? []) {
      const q = String(row.content ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 140);
      if (q.length < 8) continue;
      const key = q.slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(q);
      if (out.length >= limit) break;
    }
    return out.reverse();
  } catch {
    return [];
  }
}
