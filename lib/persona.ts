export const PERSONA_NAME = 'ماجيك';
export const PERSONA_NAME_EN = 'Magic';

export function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'صباح الخير';
  if (hour >= 12 && hour < 17) return 'مساء النور';
  if (hour >= 17 && hour < 21) return 'مساء الخير';
  return 'أهلاً بيك';
}

// جمل تشجيعية بأسلوب "صاحب بيحبك" - بتتقال بالتبادل عشوائيًا
export const ENCOURAGEMENT_LINES = [
  'كل يوم بتذاكر فيه، إنت بتفرق مع نفسك 💚',
  'حتى لو شوية النهارده، أحسن من ولا حاجة',
  'إنت أقرب لهدفك من إمبارح، كمّل كده',
  'مفيش حد بيحس بمجهودك زيي، أنا شايف كل خطوة 🌟',
];

export function getRandomEncouragement(): string {
  return ENCOURAGEMENT_LINES[Math.floor(Math.random() * ENCOURAGEMENT_LINES.length)];
}

// حساب الوقت التقديري لإنهاء المهام (بالدقايق) بناءً على عدد المهام
export function estimateMinutes(taskCount: number, minutesPerTask = 14): number {
  return taskCount * minutesPerTask;
}