// lib/ai/exam-topics.ts
//
// 🏷️ تقييم الأجزاء — تجميع نتيجة الامتحان على أجزاء المحاضرة.
//
// **ليه موديول منفصل**: `exam-review.ts` فيه محرّك التوليد كامل (برومبتات،
// تقطيع، نداءات المزوّد). الواجهة (`ExamResults`) محتاجة التجميع ده بس —
// استيراد المحرّك كله في المتصفح عشان عملية جمع أرقام مش مقبول.
// الموديول ده نقي: صفر I/O، صفر اعتماديات.

import type { ExamQuestionType } from "./exam-review";

export type TopicScore = {
  topic: string;
  score: number;
  max: number;
  questions: number;
  percent: number;
};

export type TopicInput = {
  topic?: string | null;
  type: ExamQuestionType;
  correct?: boolean | null;
  selfScore?: number | null;
};

/** التسمية اللي بتظهر لو السؤال مالوش جزء (موديل قديم أو إصلاح). */
export const FALLBACK_TOPIC = "عام";

/**
 * تجميع النتيجة على الأجزاء.
 *
 * القاعدة:
 * - سؤال آلي: درجة 1 أو 0.
 * - مقالي: `self_score` من 5 (مقيّد بـ 0..5 — العميل مش موثوق).
 * - الترتيب: الأضعف أولاً (ده اللي بيتعرض للطالب).
 *
 * ⚠️ الأسئلة اللي **ماتجاوبتش** مش بتتحسب صح ولا غلط: بتتخطّى لو
 * `correct`/`selfScore` = null. من غير كده امتحان متوقف في النص هيبان
 * إن الطالب ضعيف في كل حاجة.
 */
export function summarizeByTopic(rows: readonly TopicInput[]): TopicScore[] {
  const buckets = new Map<string, { score: number; max: number; questions: number }>();

  for (const row of rows) {
    const answered = row.type === "essay" ? row.selfScore != null : row.correct != null;
    if (!answered) continue;

    const label = (row.topic ?? "").trim() || FALLBACK_TOPIC;
    const bucket = buckets.get(label) ?? { score: 0, max: 0, questions: 0 };

    if (row.type === "essay") {
      bucket.max += 5;
      const raw = Number(row.selfScore ?? 0);
      bucket.score += Math.min(5, Math.max(0, Number.isFinite(raw) ? raw : 0));
    } else {
      bucket.max += 1;
      if (row.correct === true) bucket.score += 1;
    }
    bucket.questions += 1;
    buckets.set(label, bucket);
  }

  return [...buckets.entries()]
    .map(([topic, bucket]) => ({
      topic,
      score: bucket.score,
      max: bucket.max,
      questions: bucket.questions,
      percent: bucket.max > 0 ? Math.round((bucket.score / bucket.max) * 100) : 0,
    }))
    .sort(
      (a, b) =>
        a.percent - b.percent || b.questions - a.questions || a.topic.localeCompare(b.topic),
    );
}

/**
 * ملخّص جملة واحدة للطالب: «أضعف جزء: كذا (٢/٥)».
 * يرجع `null` لو مفيش أجزاء (امتحان فاضي/متوقف).
 */
export function weakestTopic(rows: readonly TopicScore[]): TopicScore | null {
  return rows.length > 0 ? rows[0] : null;
}
