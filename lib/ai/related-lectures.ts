/* ==========================================================================
   🔗 ربط المساعد بالتسجيلات الصوتية المحفوظة — Phase 23
   ==========================================================================
   الهدف: لما الطالب يتكلم عن محاضرة (رفع ملف مرتبط، أو طلب محاضرة مش موجودة)،
   المساعد يكتشف إنه عنده تسجيل صوتي محفوظ (`lectures` مع transcript) لنفس
   الموضوع — فيقترحه ويشرح منه بدل «مش لاقي مصدر».
   ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface RelatedRecording {
  id: string;
  title: string;
  filename: string | null;
  durationSeconds: number | null;
  createdAt: string | null;
  /** نسبة تطابق 0..1 — للعرض والترتيب. */
  score: number;
}

interface LectureRow {
  id: string;
  title: string | null;
  original_filename: string | null;
  duration_seconds: number | null;
  created_at: string;
}

/** كلمات رقيقة البحث — مش دليل تطابق لو اتطابقت لوحدها. */
const STOP_TOKENS = new Set([
  "المحاضرة", "محاضرة", "محاضره", "lecture", "lec", "audio", "record", "recording",
  "mp3", "mp4", "m4a", "wav", "pdf", "docx", "pptx", "شرح", "اشرح", "لي", "اللي",
  "في", "من", "على", "عن", "and", "the", "of", "for",
]);

/** تقطيع عنوان/ملف إلى رموز بحث مُنقّاة. */
export function tokenizeTitle(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[._\-—–()【】\[\]]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_TOKENS.has(t) && !/^\d+$/.test(t));
}

/**
 * يبحث في تسجيلات الطالب المحفوظة (status=completed ومعاها transcript) عن
 * تسجيلات مرتبطة بالكلمة/العنوان المطلوب — ترتيب حسب نسبة تطابق الرموز.
 */
export async function findRelatedRecordings(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  { limit = 2, minScore = 0.3, maxRows = 200 }: { limit?: number; minScore?: number; maxRows?: number } = {},
): Promise<RelatedRecording[]> {
  const queryTokens = tokenizeTitle(query);
  if (queryTokens.length === 0) return [];

  const { data, error } = await supabase
    .from("lectures")
    .select("id, title, original_filename, duration_seconds, created_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .not("transcript_text", "is", null)
    .order("created_at", { ascending: false })
    .limit(maxRows);
  if (error || !data) return [];

  const rows = data as LectureRow[];
  const scored: RelatedRecording[] = [];
  for (const row of rows) {
    const target = `${row.title ?? ""} ${row.original_filename ?? ""}`;
    const targetTokens = new Set(tokenizeTitle(target));
    if (targetTokens.size === 0) continue;
    const hits = queryTokens.filter((t) => {
      if (targetTokens.has(t)) return true;
      for (const cand of targetTokens) {
        if (cand.startsWith(t) || t.startsWith(cand)) return true;
      }
      return false;
    }).length;
    const score = hits / queryTokens.length;
    if (score >= minScore) {
      scored.push({
        id: row.id,
        title: row.title ?? row.original_filename ?? "تسجيل صوتي",
        filename: row.original_filename,
        durationSeconds: row.duration_seconds,
        createdAt: row.created_at,
        score,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/** بلوك عربي يُحقن في system — يعرفة عن التسجيلات المرتبطة وإزاي يقترحها. */
export function formatRecordingsHint(recordings: RelatedRecording[], materialTitle: string): string {
  if (recordings.length === 0) return "";
  const list = recordings
    .map((r) => {
      const dur = r.durationSeconds
        ? ` — مدتها ${Math.round(r.durationSeconds / 60)} دقيقة`
        : "";
      return `- «${r.title}»${dur} — [افتح التسجيل](/lectures#lec-${r.id})`;
    })
    .join("\n");
  return `--- تسجيلات صوتية محفوظة للطالب مرتبطة بموضوع «${materialTitle}» ---
${list}

إرشاد: لو الشرح أو سؤال الطالب له علاقة بالموضوع ده، اذكر له إنه عنده تسجيل صوتي محفوظ للمحاضرة دي واعرض عليه تشرح له منها أو يفتحه من اللينك أعلاه. لو طلب ده صريح، ابدأ بالتسجيل.`;
}
