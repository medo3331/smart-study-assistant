// lib/magic/badges.ts
//
// 🏅 شارات Magic — نظام إنجازات المذاكرة (نمط Duolingo).
// منطق pure 100% — محسوبة من بيانات موجودة (profiles + planner_goals)
// من غير أي جداول جديدة: الشارة بتتولد لحظيًا من الأرقام نفسها.

export interface StudyBadge {
  id: string;
  emoji: string;
  label: string;
  /** هل اتكسبت فعلًا؟ */
  earned: boolean;
  /** لو لسه — محتاج إيه بالظبط (للتحفيز). */
  hint?: string;
}

export interface StudyBadgeInput {
  xp: number;
  streak: number;
  /** عدد المهام المنجزة كلها (planner_goals is_done=true). */
  tasksDone: number;
}

interface BadgeRule {
  id: string;
  emoji: string;
  label: string;
  value: number;
  /** وصف الهدف صيغة المصدر — الباقي بيتولد. */
  metric: "xp" | "streak" | "tasksDone";
}

const BADGE_RULES: readonly BadgeRule[] = [
  { id: "streak_3", emoji: "🌱", label: "بداية نار", metric: "streak", value: 3 },
  { id: "streak_7", emoji: "🔥", label: "أسبوع كامل", metric: "streak", value: 7 },
  { id: "streak_30", emoji: "🌋", label: "شهر بلا انقطاع", metric: "streak", value: 30 },
  { id: "tasks_10", emoji: "✅", label: "١٠ مهام", metric: "tasksDone", value: 10 },
  { id: "tasks_50", emoji: "🏆", label: "٥٠ مهمة", metric: "tasksDone", value: 50 },
  { id: "xp_1000", emoji: "💎", label: "أول ١٠٠٠ XP", metric: "xp", value: 1000 },
  { id: "xp_5000", emoji: "👑", label: "أسطورة ٥٠٠٠ XP", metric: "xp", value: 5000 },
];

const METRIC_LABELS: Record<BadgeRule["metric"], string> = {
  xp: "XP",
  streak: "يوم سلسلة",
  tasksDone: "مهمة منجزة",
};

function ar(n: number): string {
  return n.toLocaleString("ar-EG");
}

/** حساب الشارات من الأرقام الحقيقية — كل الشارات بترجع (المكتسبة واللي لسه). */
export function computeStudyBadges(input: StudyBadgeInput): StudyBadge[] {
  const values: Record<BadgeRule["metric"], number> = {
    xp: Math.max(0, Math.floor(input.xp || 0)),
    streak: Math.max(0, Math.floor(input.streak || 0)),
    tasksDone: Math.max(0, Math.floor(input.tasksDone || 0)),
  };
  return BADGE_RULES.map((rule) => {
    const current = values[rule.metric];
    const earned = current >= rule.value;
    return {
      id: rule.id,
      emoji: rule.emoji,
      label: rule.label,
      earned,
      hint: earned ? undefined : `محتاج ${ar(rule.value - current)} ${METRIC_LABELS[rule.metric]} كمان`,
    };
  });
}
