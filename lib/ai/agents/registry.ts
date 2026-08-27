import type { AgentDefinition, AgentId } from "./types";
import { AGENT_IDS } from "./types";

/**
 * The single source of truth for every agent's metadata.
 *
 * Add a new agent by: (1) adding the id to AGENT_IDS in types.ts,
 * (2) appending its definition here in the SAME order, (3) writing the
 * stub under lib/ai/agents/stubs/<id>.ts.
 *
 * Order here = order in agentIds() = tiebreaker in routing.
 */
export const ALL_AGENTS: Readonly<Record<AgentId, AgentDefinition>> = Object.freeze({
  study_tutor: {
    id: "study_tutor",
    label: "Study Tutor",
    description: "يشرح الدروس والمفاهيم خطوة بخطوة حسب مستوى الطالب.",
    capabilities: ["chat", "reasoning", "long_context"],
    priority: 1,
    status: "stub",
  },
  exam_solver: {
    id: "exam_solver",
    label: "Exam Solver",
    description: "يحل امتحانات مع شرح خطوات الحل ومصدر الإجابة.",
    capabilities: ["chat", "reasoning", "long_context"],
    priority: 1,
    status: "stub",
  },
  quiz_generator: {
    id: "quiz_generator",
    label: "Quiz Generator",
    description: "يولّد اختبارات من درس أو وثيقة بناتج منظّم.",
    capabilities: ["chat", "reasoning", "structured_output"],
    priority: 1,
    status: "stub",
  },
  research: {
    id: "research",
    label: "Research",
    description: "تحليل ومقارنات وتقارير مبنية على المعلومات المعطاة.",
    capabilities: ["chat", "reasoning", "long_context"],
    priority: 2,
    status: "stub",
  },
  document_analyzer: {
    id: "document_analyzer",
    label: "Document Analyzer",
    description: "يلخّص ويستخرج من PDF/DOCX/صور.",
    capabilities: ["chat", "long_context", "document_ingest", "vision"],
    priority: 1,
    status: "stub",
  },
  writing: {
    id: "writing",
    label: "Writing Assistant",
    description: "مساعد كتابة أكاديمي ومحتوى عام.",
    capabilities: ["chat", "reasoning", "long_context"],
    priority: 2,
    status: "stub",
  },
  language: {
    id: "language",
    label: "Language Tutor",
    description: "تدريب لغات ومحادثة موجّهة حسب المستوى.",
    capabilities: ["chat"],
    priority: 2,
    status: "stub",
  },
  planner: {
    id: "planner",
    label: "Planner",
    description: "يخطط للدراسة والمهام بجداول زمنية.",
    capabilities: ["chat", "reasoning", "structured_output"],
    priority: 1,
    status: "stub",
  },
  career: {
    id: "career",
    label: "Career Coach",
    description: "توجيه مهني وسير ذاتية ومقابلات.",
    capabilities: ["chat", "reasoning"],
    priority: 3,
    status: "stub",
  },
  freelance: {
    id: "freelance",
    label: "Freelance Assistant",
    description: "مساعد فريلانس: عروض، تفاوض، إدارة مشاريع.",
    capabilities: ["chat", "reasoning", "long_context"],
    priority: 3,
    status: "stub",
  },
  image: {
    id: "image",
    label: "Image",
    description: "يولّد صورًا توضيحية من وصف نصي.",
    capabilities: ["image_generation"],
    priority: 1,
    status: "stub",
  },
  personal_assistant: {
    id: "personal_assistant",
    label: "Personal Assistant",
    description: "مساعد شخصي عام: تذكير، أفكار، تنظيم يوم.",
    capabilities: ["chat"],
    priority: 4,
    status: "stub",
  },
});

/** Stable, registration-order list of agent ids. */
export function agentIds(): AgentId[] {
  return AGENT_IDS.filter((id) => id in ALL_AGENTS);
}

/** O(1) presence check. */
export function isRegistered(id: string): id is AgentId {
  return id in ALL_AGENTS;
}

/** Throws on unknown ids — caller bug, never a soft miss. */
export function getAgent(id: string): AgentDefinition {
  if (!isRegistered(id)) {
    throw new Error(`Unknown agent "${id}". Register it in lib/ai/agents/registry.ts first.`);
  }
  return ALL_AGENTS[id];
}
