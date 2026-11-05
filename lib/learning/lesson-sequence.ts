/* ==========================================================================
   القفل التسلسلي للدروس

   القاعدة (مصدر واحد للحقيقة):
   - أي درس مكتمل مفتوح للمراجعة.
   - أول درس مفتوح دائماً.
   - أي درس تاني بيفتح فقط لو الدرس اللي قبله مكتمل.
   - الدرس الحالي = أول درس غير مكتمل ومفتوح.

   الدالة نقية ومفصولة عن Supabase/React عشان تتختبر وتتستخدم في أي صفحة
   (صفحة الدروس الآن، والداشبورد لاحقاً لو حبينا نوحّده).
   ========================================================================== */

export interface SequentialLessonInput {
  id: string;
  dayNumber: number;
  isCompleted: boolean;
}

export interface SequencedLesson<T extends SequentialLessonInput> {
  lesson: T;
  isLocked: boolean;
  isCurrent: boolean;
}

export function sequenceLessons<T extends SequentialLessonInput>(
  lessons: T[]
): SequencedLesson<T>[] {
  const ordered = [...lessons].sort((a, b) => a.dayNumber - b.dayNumber);
  let currentFound = false;

  return ordered.map((lesson, index) => {
    const previous = ordered[index - 1];
    const isLocked =
      !lesson.isCompleted && index > 0 && !previous.isCompleted;

    const isCurrent = !lesson.isCompleted && !isLocked && !currentFound;
    if (isCurrent) currentFound = true;

    return { lesson, isLocked, isCurrent };
  });
}
