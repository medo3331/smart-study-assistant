/**
 * AgentRouter (Hidden) — selects best agent from 11 backends based on prompt + context.
 *
 * User NEVER sees this selection. The Unified AI interface is the only surface.
 *
 * Routing rules (derived from agent capabilities + user intent):
 *   "حل" / "سؤال" / "امتحان" / "معادلة" → exam_solver
 *   "اشرح" / "درس" / "مفهوم" → study_tutor
 *   "اختبر" / "أسئلة" / "quiz" → quiz_generator
 *   "ملف" / "وثيقة" / "تحليل" / "PDF" → document_analyzer
 *   "ابحث" / "بحث" / "معلومات" → research
 *   "اكتب" / "مسودة" / "مراجعة" → writing
 *   "خطة" / "مذاكرة" / "جدول" → planner
 *   "لغة" / "إنجليزي" / "عربي" / "translation" → language_tutor
 *   "صورة" / "رسم" / "فهم صورة" / "OCR" → image (with OCR path via extract-text)
 *   "مهنة" / "CV" / "وظيفة" / "career" → career / freelance / writing
 *   " شخصية" / "حياتي" / "coach" → AI Coach merged into router context
 */

import type { AgentRouterDecision } from "./types";

export function routerSelectAgent(prompt: string, context?: Record<string, unknown>, hasImage?: boolean): AgentRouterDecision {
  const p = (prompt || "").toLowerCase();
  const role = String(context?.role || context?.preferences?.role || "").toLowerCase();
  const field = String(context?.field || context?.preferences?.subject || "").toLowerCase();

  const rules = [
    { id: "exam_solver", keywords: ["حل", "سؤال", "امتحان", "معادلة", "رياضيات", "فيزياء", "كيمياء", "solve", "question", "exam", "equation"], conf: 0.95 },
    { id: "study_tutor", keywords: ["اشرح", "درس", "شرح", "مفهوم", "learn", "explain", "lesson", "topic"], conf: 0.92 },
    { id: "quiz_generator", keywords: ["اختبر", "أسئلة", "quiz", "test myself", "questions"], conf: 0.90 },
    { id: "document_analyzer", keywords: ["ملف", "وثيقة", "pdf", "تحليل", "ملخص", "document", "analyze", "file"], conf: 0.88 },
    { id: "language_tutor", keywords: ["لغة", "إنجليزي", "عربي", "ترجمة", "language", "english", "arabic", "translate", "grammar"], conf: 0.85 },
    { id: "planner", keywords: ["خطة", "مذاكرة", "جدول", "plan", "schedule", "study plan"], conf: 0.82 },
    { id: "research", keywords: ["ابحث", "بحث", "معلومات", "research", "search", "find"], conf: 0.80 },
    { id: "writing", keywords: ["اكتب", "مسودة", "مراجعة", "write", "draft", "edit"], conf: 0.78 },
    { id: "career", keywords: ["مهنة", "cv", "وظيفة", "career", "resume", "job"], conf: 0.75 },
    { id: "image", keywords: ["صورة", "رسم", "فهم صورة", "image", "diagram", "graph", "visual"], conf: 0.70 },
    { id: "personal_assistant", keywords: ["مساعد", "help", "assist", "daily"], conf: 0.65 },
  ];

  // If image attached → prefer agents that handle images (exam_solver for exam questions, document_analyzer for docs)
  if (hasImage) {
    if (p.includes("حل") || p.includes("سؤال") || p.includes("معادلة") || p.includes("exam") || p.includes("question"))
      return { agentId: "exam_solver", confidence: 0.94, reason: "Image contains exam/question content; OCR + Exam Solver path", requiresOcr: true };
    if (p.includes("وثيقة") || p.includes("ملف") || p.includes("document") || p.includes("pdf"))
      return { agentId: "document_analyzer", confidence: 0.92, reason: "Image is document/file; OCR + Document Analyzer", requiresOcr: true };
    return { agentId: "study_tutor", confidence: 0.85, reason: "Image with study content (fallback to study tutor via OCR)", requiresOcr: true };
  }

  // Default: best keyword match
  let best = rules[0];
  for (const r of rules) {
    const score = r.keywords.reduce((sum, kw) => sum + (p.includes(kw.toLowerCase()) ? 1 : 0), 0);
    if (score > 0 && (r.conf + score * 0.02) > best.conf) best = { ...r, conf: r.conf + score * 0.02 };
  }

  return {
    agentId: best.id,
    confidence: Math.min(0.99, best.conf),
    reason: best.id === "exam_solver" ? "Detected exam/question keywords" : `Matched keywords for ${best.id}`,
    requiresOcr: false,
    requiresVision: false,
  };
}
