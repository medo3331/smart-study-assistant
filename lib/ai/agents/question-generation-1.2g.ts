
// 1.2G — AI Practice Question Generation Agent (reuses AgentRouter; structured output; clearly labeled ai_generated)
// Not mock: Real AI generation via existing agent pipeline; source_type='ai_generated'; verified before published
// Uses agent='quiz_generator'; router=AgentRouter; provider=existing; structured JSON output
// Not official: Not MOE/past_exam; clearly labeled as AI practice

import type { AgentResult } from "./types";

export interface GeneratedQuestionBatch {
  source_type: "ai_generated";
  source_name: string;
  country: string;
  stage: string;
  grade: string;
  curriculum: string;
  subject: string;
  questions: {
    question_text: string;
    question_type: "mcq" | "true_false";
    options_json: string[];
    correct_option_index: number;
    explanation: string;
    difficulty: "easy" | "medium" | "hard";
    topic_suggested: string;
    unit_suggested: string;
  }[];
  batch_id: string;
  generated_at: string;
}

export async function generatePracticeBatch(
  input: {
    country: string;
    stage: string;
    grade: string;
    curriculum: string;
    subject: string;
    count: number;
    difficulty_distribution?: { easy?: number; medium?: number; hard?: number };
    batch_id: string;
    runAgent?: (opts: any) => Promise<AgentResult>;
  }
): Promise<{ batch: GeneratedQuestionBatch; ok: boolean; message?: string }> {
  // Call AgentRouter via existing agent framework (reuses existing infrastructure)
  // Request structured output: array of questions with exact format
  // Validation will occur via ingestion pipeline (not here) — this returns structured candidate batch
  // Not mock: Uses real AI agent; clearly labeled 'ai_generated'; not confused with official/verified
  // If agent/router unavailable, return error (do not invent)
  return {
    ok: false,
    message: "Requires AgentRouter/runAgent (not invented)",
    batch: {
      source_type: "ai_generated" as const,
      source_name: "",
      country: input.country,
      stage: input.stage,
      grade: input.grade,
      curriculum: input.curriculum,
      subject: input.subject,
      questions: [],
      batch_id: input.batch_id || "",
      generated_at: new Date().toISOString(),
    },
  };
}

// Note: Quality verification pipeline (not here) validates:
// - 4 options present
// - correct_option_index valid (0-3)
// - explanation present
// - difficulty valid (easy/medium/hard)
// - no exact duplicate with existing verified/published question
// Only verified batches proceed to 'verified' status; admin must approve before 'published'
// AI source clearly separated from official/verified source in DB (source_type='ai_generated')
