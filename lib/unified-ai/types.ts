/**
 * Unified AI Architecture — Phase 8 (On Top, No Deletion Yet)
 *
 * User-facing: ONE interface (Magic chat/upload) — agent picker hidden.
 * Behind the scenes: Magic OCR + AgentRouter + 11 backends + AI Coach context.
 *
 * Design preserved:
 *   User Image → Magic Upload/OCR → Text + Metadata → AgentRouter → Best Agent
 *
 * Nothing deleted (AIHub / AgentLauncher stay until verification complete).
 */

export interface UnifiedAIInput {
  prompt: string;
  imageInput?: File | unknown;     // from Magic upload button (existing)
  fileInput?: File | unknown;      // PDF / docx / text
  context?: Record<string, unknown>; // profile, role, field, level, progress
  language?: "ar" | "en" | "mixed";
}

export interface UnifiedAIResult {
  ok: boolean;
  agentUsed: string;              // which agent router selected (hidden from user display, used for logging/debug)
  answer: string;                 // final response
  extractedText?: string;         // OCR result (if image)
  metadata?: {
    ocrEngine?: 1 | 3;
    confidence?: "high" | "medium" | "low";
    languageDetected?: "ar" | "en" | "mixed";
    imageProcessed?: boolean;
  };
  reasoning?: string;             // why router chose this agent (for debug / coach context)
  error?: string;
}

export interface AgentRouterDecision {
  agentId: string;
  confidence: number;             // 0-1
  reason: string;                 // short explanation
  requiresOcr?: boolean;
  requiresVision?: boolean;       // if diagram/graph — future Phase 9
}
