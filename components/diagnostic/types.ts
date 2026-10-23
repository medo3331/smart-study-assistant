/**
 * Shared types and fetch helpers for the diagnostic flow.
 *
 * Every shape here mirrors a route response exactly. Nothing is inferred:
 * the component renders what the server sent. In particular
 * ReplanReason.message is written by lib/exam-plan-replanner.ts and shown
 * verbatim — the UI never explains a plan change on its own, because it
 * does not know the reasoning that produced it.
 */

import type { ReplanReason } from "@/lib/exam-plan-replanner";
import type { TopicStat, WeakTopic } from "@/lib/diagnostic-mastery";

export type { ReplanReason };

/** Response of POST /api/diagnostic/start. */
export interface StartResponse {
  session_id: string;
  subject_id: string;
  question_count: number;
  questions: DiagnosticQuestion[];
}

export interface DiagnosticQuestion {
  id: string;
  topic_id: string | null;
  unit_id: string | null;
  question_text: string;
  question_type: "mcq" | "true_false";
  options: string[];
  difficulty: "easy" | "medium" | "hard";
}

/** What the student may send. Nothing else is accepted by the route. */
export interface ClientAnswer {
  question_id: string;
  selected_option_index: number;
}

/** Response of POST /api/diagnostic/submit. */
export interface SubmitResponse {
  session_id: string;
  score: number;
  total: number;
  percentage: number;
  correct_count: number;
  wrong_count: number;
  topic_performance: TopicStat[];
  weak_topics: WeakTopic[];
  strong_topics: string[];
  insufficient_data_topics: string[];

  // Present on the success path; absent on the early-return paths.
  mastery_updated?: boolean;
  topics_refreshed?: number;
  plan_updated?: boolean;
  plan_reasons?: ReplanReason[];
  warning?: string;
}

export type FlowStage = "intro" | "quiz" | "result";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error === "string") return body.error;
    if (typeof body?.error?.message === "string") return body.error.message;
  } catch {
    /* fall through to the generic message */
  }
  return "حصل خطأ غير متوقع. جرب تاني.";
}

export async function postJson<T>(
  path: string,
  body: unknown
): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new ApiError(await readError(res), res.status);
  }
  return (await res.json()) as T;
}
