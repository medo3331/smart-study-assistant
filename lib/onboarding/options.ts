/**
 * 🎯 Onboarding learning-profile options — single source of truth.
 *
 * IDs here must stay in sync with:
 *   - db/onboarding-subjects-goals-preferences.sql (CHECK whitelists)
 *   - persist() validation in app/onboarding/page.tsx (GOAL_IDS / STYLE_IDS)
 * Add a new option in all three places or not at all.
 */

export interface OnboardingOption {
  id: string;
  labelAr: string;
  labelEn: string;
  emoji: string;
}

export const GOAL_OPTIONS: OnboardingOption[] = [
  { id: "excel", labelAr: "التفوق والمركز الأول", labelEn: "Top grades", emoji: "🏆" },
  { id: "pass", labelAr: "النجاح وتثبيت المعلومات", labelEn: "Pass & retain", emoji: "✅" },
  { id: "review", labelAr: "مراجعة نهائية سريعة", labelEn: "Final review", emoji: "⏳" },
];

export const STYLE_OPTIONS: OnboardingOption[] = [
  { id: "simple", labelAr: "مبسط وبالأمثلة", labelEn: "Simple with examples", emoji: "💡" },
  { id: "detailed", labelAr: "تفصيلي وأكاديمي", labelEn: "Detailed & academic", emoji: "📖" },
  { id: "fast", labelAr: "سريع ومختصر", labelEn: "Quick & concise", emoji: "⚡" },
];

export const GOAL_IDS: readonly string[] = GOAL_OPTIONS.map((o) => o.id);
export const STYLE_IDS: readonly string[] = STYLE_OPTIONS.map((o) => o.id);
