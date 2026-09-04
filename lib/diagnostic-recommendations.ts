
// 1.2E — DIAGNOSTIC → STUDY PLAN INTEGRATION (reuse-first; deterministic; no AI)
// Uses existing planner_goals / study_day / materials / exam_plan_days
// No new planner system. No AI recommendations (optional explanation only — deferred).
// Weak topic → find existing content (materials / planner_goals / exam_plan_days) by subject + topic text match.
// Returns recommendations only — does NOT modify study plan automatically.
// Admin/user must approve study-plan integration separately.

export interface WeakTopic {
  topic: string;
  accuracy: number;  // 0-1
  questions_attempted: number;
  questions_correct: number;
}

export interface Recommendation {
  weak_topic: string;
  accuracy: number;
  content_available: boolean;
  content_refs: { type: 'material' | 'planner_goal' | 'exam_plan_day'; id: string; title: string }[];
  study_suggestion: string;  // text only — no new content created
  priority: 'high' | 'medium' | 'low';
}

// Deterministic — no AI opinion on weakness
export function detectWeakTopics(
  answers: { question_id: string; is_correct: boolean; topic: string }[]
): WeakTopic[] {
  const stats: Record<string, { total: number; correct: number }> = {};
  for (const a of answers) {
    const t = a.topic || 'general';
    if (!stats[t]) stats[t] = { total: 0, correct: 0 };
    stats[t].total++;
    if (a.is_correct) stats[t].correct++;
  }
  const weak: WeakTopic[] = [];
  for (const [topic, s] of Object.entries(stats)) {
    if (s.total >= 2) {
      const accuracy = s.correct / s.total;
      if (accuracy < 0.60) {
        weak.push({ topic, accuracy, questions_attempted: s.total, questions_correct: s.correct });
      }
    } else if (s.total === 1 && s.correct === 0) {
      weak.push({ topic, accuracy: 0, questions_attempted: 1, questions_correct: 0 });
    }
  }
  return weak.sort((a,b) => a.accuracy - b.accuracy);
}

// Recommendation logic: only existing content — no fabrication
export async function getStudyRecommendations(
  weakTopics: WeakTopic[],
  subjectId?: string,
  supabase?: any
): Promise<Recommendation[]> {
  // Query existing materials / planner_goals / exam_plan_days by subject + topic text
  // Return recommendations with content_available = true only if real content exists
  // If no content: content_available = false; study_suggestion explains gap
  const recs: Recommendation[] = [];
  for (const wt of weakTopics) {
    // In production: query DB by subject + topic (design only — no live query required for scaffold)
    recs.push({
      weak_topic: wt.topic,
      accuracy: wt.accuracy,
      content_available: false,  // design: requires admin-created mapping; default false
      content_refs: [],
      study_suggestion: `Review ${wt.topic} (performance ${Math.round(wt.accuracy*100)}%). Content mapping needs verification.`,
      priority: wt.accuracy < 0.4 ? 'high' : wt.accuracy < 0.6 ? 'medium' : 'low'
    });
  }
  return recs;
}
// Note: No AI used for recommendations. No study-plan modification. Only structured result.
// Integration point: diagnostic result UI can display these recommendations.
