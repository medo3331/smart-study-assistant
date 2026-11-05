/* ==========================================================================
   القفل التسلسلي للدروس

   القاعدة (مصدر واحد للحقيقة):
   - أي درس مكتمل مفتوح للمراجعة.
   - أول درس مفتوح دائماً.
   - أي درس تاني بيفتح فقط لو الدرس اللي قبله مكتمل، أو لو اتفتح مبكراً
     مقابل XP ومسجّل في `study_day_unlocks`.
   - الدرس الحالي = أول درس غير مكتمل ومفتوح.

   الدالة نقية ومفصولة عن Supabase/React عشان تتختبر وتتستخدم في أي صفحة.
   ========================================================================== */

export interface SequentialLessonInput {
  id: string;
  dayNumber: number;
  isCompleted: boolean;
}

export interface LessonSequenceOptions {
  /** IDs الدروس المفتوحة مبكراً من جدول study_day_unlocks. */
  unlockedDays?: Iterable<string>;
}

export interface SequencedLesson<T extends SequentialLessonInput> {
  lesson: T;
  isLocked: boolean;
  isCurrent: boolean;
  /** مفتوح بدري مش بسبب إكمال اللي قبله. */
  isEarlyUnlocked: boolean;
}

export function buildLessonSequence<T extends SequentialLessonInput>(
  lessons: T[],
  options: LessonSequenceOptions = {}
): SequencedLesson<T>[] {
  const ordered = [...lessons].sort((a, b) => a.dayNumber - b.dayNumber);
  const unlocked = new Set<string>(options.unlockedDays ?? []);
  let currentFound = false;

  return ordered.map((lesson, index) => {
    const previous = ordered[index - 1];
    const previousCompleted = Boolean(previous?.isCompleted);
    const isEarlyUnlocked =
      !lesson.isCompleted &&
      index > 0 &&
      !previousCompleted &&
      unlocked.has(lesson.id);

    const isLocked =
      !lesson.isCompleted &&
      index > 0 &&
      !previousCompleted &&
      !isEarlyUnlocked;

    const isCurrent = !lesson.isCompleted && !isLocked && !currentFound;
    if (isCurrent) currentFound = true;

    return { lesson, isLocked, isCurrent, isEarlyUnlocked };
  });
}
