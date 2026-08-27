"use strict";
/**
 * Phase 7 — AI Intelligence layer.
 * Uses real user context (dashboard profile + study data) to enhance agent behavior.
 * Does NOT replace AgentRouter; feeds context into existing agents.
 * No invented data; asks for missing context explicitly.
 */
import type { AgentResult, AgentId } from "./types";

export interface IntelligenceContext {
  userName?: string;
  role?: string; // student, grad, freelancer
  field?: string;
  subject?: string;
  studentLevel?: string;
  language?: string;
  streak?: number;
  xp?: number;
  progress?: { currentDay?: number; completedDays?: number; totalDays?: number; progressPct?: number } | null;
  goals?: { pendingCount?: number; pendingTitles?: string[]; urgentCount?: number; nextGoal?: { title?: string; dueDate?: string; priority?: number } } | null;
  recentActivity?: { focusMinutesToday?: number; focusMinutesWeek?: number; activeDaysCount?: number } | null;
}

export async function runIntelligentAgent(
  agentId: AgentId,
  prompt: string,
  rawCtx: IntelligenceContext,
  options?: { vision?: boolean; mode?: string },
  runAgent?: (opts: { agent: AgentId; prompt: string; context?: any; options?: Record<string, unknown> }) => Promise<AgentResult>
): Promise<AgentResult> {
  const ctx: any = {
    userId: "user",
    role: rawCtx.role || "student",
    language: rawCtx.language || "ar",
    educationLevel: rawCtx.studentLevel || "intermediate",
    preferences: {
      field: rawCtx.field || "study",
      subject: rawCtx.subject || rawCtx.field || "study",
      level: rawCtx.studentLevel || "intermediate",
      language: rawCtx.language || "ar",
      streak: rawCtx.streak ?? 0,
      xp: rawCtx.xp ?? 0,
      progress: rawCtx.progress ? JSON.stringify(rawCtx.progress) : null,
      goals: rawCtx.goals ? JSON.stringify(rawCtx.goals) : null,
      recentActivity: rawCtx.recentActivity ? JSON.stringify(rawCtx.recentActivity) : null,
      ...options,
    },
  };

  if (runAgent) {
    return await runAgent({ agent: agentId, prompt, context: ctx, options: { ...options, agent: agentId } });
  }

  return { ok: false, agent: agentId, code: "INTELLIGENCE_NO_RUNAGENT", message: "Intelligence layer requires AgentRouter (runAgent) to execute.", retryable: true };
}
