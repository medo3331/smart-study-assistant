
// 1.2D — Diagnostic Scoring (deterministic, server-side only)
// No AI. No client-trusted correct answers. Source of truth = diagnostic_question_bank.

export interface DiagnosticAnswerInput {
  session_id: string;
  question_id: string;
  selected_option_index: number;  // client sends only this — never correct
}

export interface DiagnosticResult {
  session_id: string;
  score: number;
  total: number;
  percentage: number;
  correct_count: number;
  wrong_count: number;
  topic_performance: Record<string, { total: number; correct: number; accuracy: number }>;
  weak_topics: string[];  // accuracy < 60% or insufficient data
  strong_topics: string[];
  insufficient_data_topics: string[];
}

// Thresholds (design decision — configurable)
const WEAK_THRESHOLD = 0.60;

export async function scoreDiagnosticSession(
  sessionId: string,
  supabaseAdmin: any  // server-role client
): Promise<DiagnosticResult> {
  // 1. Load session (verify ownership via RLS — supabaseAdmin reads with service_role for calculation)
  // 2. Load answers for session (from diagnostic_answers)
  // 3. Load questions (from diagnostic_question_bank — verified only)
  // 4. For each answer: compare selected_option_index with correct_option_index (DB truth)
  // 5. Aggregate score / topic accuracy / weak topics
  // 6. Return result (never expose correct answers to client)
  // Implementation detail: server computes; never trusts client score or is_correct
  throw new Error('Implement with actual supabase admin query pattern — scaffold only');
}

// Weak topic detection (deterministic — not AI)
export function detectWeakTopics(
  topicStats: Record<string, { total: number; correct: number }>
): { weak: string[]; strong: string[]; insufficient: string[] } {
  const weak: string[] = [];
  const strong: string[] = [];
  const insufficient: string[] = [];
  for (const [topic, stats] of Object.entries(topicStats)) {
    if (stats.total === 0 || (stats.total === 1 && stats.correct <= 1)) {
      insufficient.push(topic);
    } else if (stats.total >= 2) {
      const accuracy = stats.correct / stats.total;
      if (accuracy < WEAK_THRESHOLD) weak.push(topic);
      else strong.push(topic);
    }
  }
  return { weak, strong, insufficient };
}

// Note: No AI Router / Agent Router / external provider called.
// Scoring is pure arithmetic on verified DB data.
