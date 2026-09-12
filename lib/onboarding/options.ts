// lib/onboarding/options.ts
// خيارات الأهداف وأنماط التعلم المستخدمة عبر Persona Builder + Prompt Builder

export interface GoalOption {
  id: string;
  labelAr: string;
  labelEn?: string;
  emoji?: string;
}

export const GOALS_OPTIONS: GoalOption[] = [
  { id: "mastery", labelAr: "إتقان المادة من الصفر", labelEn: "Mastery from scratch", emoji: "🎯" },
  { id: "exam", labelAr: "الاستعداد لامتحان", labelEn: "Exam prep", emoji: "📚" },
  { id: "revision", labelAr: "مراجعة سريعة", labelEn: "Quick review", emoji: "⚡" },
  { id: "skill", labelAr: "اكتساب مهارة جديدة", labelEn: "New skill", emoji: "🛠️" },
  { id: "career", labelAr: "دعم مسارك المهني", labelEn: "Career support", emoji: "💼" },
];

export interface StyleOption {
  id: string;
  labelAr: string;
  labelEn?: string;
  emoji?: string;
}

export const STYLE_OPTIONS: StyleOption[] = [
  { id: "simple", labelAr: "مبسط (أمثلة من الحياة)", labelEn: "Simple (life examples)", emoji: "🍀" },
  { id: "detailed", labelAr: "تفصيلي (تعريف دقيق + تبسيط)", labelEn: "Detailed (precise + simple)", emoji: "📖" },
  { id: "fast", labelAr: "سريع ومباشر (نقاط مختصرة)", labelEn: "Fast & direct (short points)", emoji: "🏃" },
];
