// lib/lesson/weaknesses.ts
//
// 📉 نقاط التحسين من نتايج اختبارات الدرس — P5 (Practice & Assessment).
//
// المصدر: `lesson_quiz_attempts` (جدول موجود — db/118) بأسئلته وإجاباته
// (`questions` + `answers` jsonb) — الحساب **نقّي على الكلاينت** بدون أي
// endpoint جديد: السؤال اللي إجابته غلط في آخر المحاولات = نقطة تحسين.
// الملف نقّي — قابل للاختبار مباشرة بـ vitest.

import { normalizeForMatch } from "@/lib/ai/lecture-intensive";

/** شكل مبسّط لمحاولة اختبار — الحقول اللي الحساب محتاجها بس. */
export type QuizAttemptLite = {
  questions: { question: string; options: string[]; correctIndex: number }[] | null;
  answers: number[] | null;
};

/** أقصى نقاط تحسين معروضة. */
export const MAX_WEAK_POINTS = 4;

/**
 * extractWeakQuestions — نصوص الأسئلة اللي إجابتها غلط في آخر المحاولات،
 * بترتيب الأحدث الأول ومن غير تكرار.
 */
export function extractWeakQuestions(attempts: QuizAttemptLite[], max: number = MAX_WEAK_POINTS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const attempt of attempts) {
    if (!attempt || !Array.isArray(attempt.questions) || !Array.isArray(attempt.answers)) continue;
    attempt.questions.forEach((question, i) => {
      if (out.length >= max) return;
      if (!question || typeof question.question !== "string" || !question.question.trim()) return;
      const answer = attempt.answers?.[i];
      if (typeof answer !== "number" || answer === question.correctIndex) return;
      const key = normalizeForMatch(question.question);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(question.question.trim());
    });
    if (out.length >= max) break;
  }
  return out;
}
