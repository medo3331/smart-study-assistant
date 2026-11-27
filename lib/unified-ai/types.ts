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

import type { AiUsageContext } from "@/lib/ai/usage-context";

/** دور محادثة واحد — أضيق من ChatTurn العام (بدون nullables) للبناء النظيف. */
export interface UnifiedChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface UnifiedAIInput {
  prompt: string;
  imageInput?: File | unknown;     // from Magic upload button (existing)
  fileInput?: File | unknown;      // PDF / docx / text
  context?: Record<string, unknown>; // profile, role, field, level, progress
  language?: "ar" | "en" | "mixed";
  // Phase H: explicit task/model — server validates; client cannot bypass policy
  task?: string;  // optional AiTaskType for routing; if omitted defaults to "chat"
  model?: string; // optional model id; if provided server checks entitlement BEFORE reserve
  // Unified brain: server-built system prompt (persona + student context + study facts).
  // Built server-side only — client must never send it.
  system?: string;
  /**
   * 🧠 ذاكرة المحادثة — أدوار المحادثة الحالية من `chat_messages` (server-side فقط).
   *
   * ⚠️ **ليه:** UnifiedChat بيبعت آخر رسالة بس، و`unifiedAI` كان بيبنى
   *   `[system, user]` من غير أي سجل — فالموديل كان بي«نسى»رسالة قبلها
   *   («الملف اللي لسه بتعمله»). السجل بيتقري من الداتابيز في الـ route
   *   ويتمرّر هنا — العميل لا يرسله ولا يعدّله.
   */
  history?: UnifiedChatTurn[];
  /**
   * 🧾 Phase 5-C5 — shadow usage context.
   *
   * ⚠️ **السبب:** `/api/unified-ai` كان بيتنادى `callGroqWithModel` مباشرة،
   *   من غير ما يمرّ على `routing.ts` — فمافيش أي سطر usage بيتسجّل. ده
   *   كان hole حقيقي في الـ coverage matrix، مش مجرد مسار ناقص.
   *
   * 🔑 الهوية (operationId / idempotencyKey) بتتولّد **مرة واحدة** في
   *   الـ route عبر `resolveUsageRequestContext` وبتتنقّل لجوه، فالمحاولات
   *   بتتبع بعض. `unifiedAI` **مابيولّدش** هوية جديدة من عنده.
   */
  usage?: AiUsageContext;
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
    visionUsed?: boolean;
    visionFallback?: boolean;
  };
  reasoning?: string;             // why router chose this agent (for debug / coach context)
  /**
   * 📡 التوصيل التدريجي — الإجابة اكتملت جزئيًا والموديل لوّم بـ `[[متابعة]]`.
   *
   * 💡 **ليه:** الشرح الطويل في رد واحد بياخد توكنز كتير (TPM) ووقت تفكير طويل
   *   فيضرب حدود المزوّد المجاني (429) أو مهلة الدالة. بتقسيم الشرح لأجزاء
   *   متتالية، كل طلب صغير وسريع — والواجهة تعرض جزء جزء ورا بعض.
   */
  hasMore?: boolean;
  error?: string;
  code?: string;
  errorCode?: string;
  /** When PDF extraction fails, frontend shows specific message. */
}

export interface AgentRouterDecision {
  agentId: string;
  confidence: number;             // 0-1
  reason: string;                 // short explanation
  requiresOcr?: boolean;
  requiresVision?: boolean;       // if diagram/graph — future Phase 9
}
