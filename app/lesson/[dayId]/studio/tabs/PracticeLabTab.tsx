"use client";

import LessonQuiz from "../practice/LessonQuiz";
import FlashcardsPractice from "../practice/FlashcardsPractice";

/**
 * تاب Practice Lab (P5) — فلاش كاردز الدرس (من الشرح المخزّن) + LessonQuiz
 * (المنقول حرفيًا من page.tsx في P1-1): الاختبار بوابة الإكمال الوحيدة.
 */
export default function PracticeLabTab({
  dayId,
  topic,
  subject,
  description,
  xpReward,
  isCompleted,
  onComplete,
  nextDayId,
  dayNumber,
  onCelebrationToggle,
}: {
  dayId: string;
  topic: string;
  subject: string;
  description: string;
  xpReward: number;
  isCompleted: boolean;
  onComplete: () => void;
  nextDayId: string | null;
  dayNumber: number;
  onCelebrationToggle?: (open: boolean) => void;
}) {
  return (
    <div dir="rtl" className="space-y-5">
      <FlashcardsPractice dayId={dayId} topic={topic} />
      <LessonQuiz
        dayId={dayId}
        topic={topic}
        subject={subject}
        description={description}
        xpReward={xpReward}
        isCompleted={isCompleted}
        onComplete={onComplete}
        nextDayId={nextDayId}
        dayNumber={dayNumber}
        onCelebrationToggle={onCelebrationToggle}
      />
    </div>
  );
}
