// lib/magic/personas.ts
//
// طبقة الشخصيات الموحّدة — Magic Agent.
// سابقًا كان فيه أربع شخصيات (ماجيك / المعلم / بلاي / كوتش) بتتوجّه بينها؛
// دلوقتي كلهم شخصية واحدة: Magic Agent — ليه عقل يفهم الأمر، يفهم البرمجة،
// ياخد القرار، وبيبحث في الإنترنت بسرعة — وكل خبرات الشخصيات القديمة مهارات جوّاه.
//
// لا يخصم هذا الملف أي Credits ولا يمس قاعدة البيانات — إخراجه نص تعليمات فقط.

import type { ChatIntent } from "@/lib/ai/chat-intent";
import { buildMagicSystemPrompt, type MagicPersonaContext } from "./persona-prompt";

/** هوية Magic Agent الرسمية — كل التوجيهات بترجع لها. */
export type MagicPersonaId = "magic";

/** معرّفات الشخصيات القديمة — مقبولة للتوافق مع الجلسات والرسايل المحفوظة، وبتتحوّل لـ magic. */
export type LegacyMagicPersonaId = "tutor" | "play" | "coach";

export interface MagicPersonaMeta {
  id: MagicPersonaId;
  name: string;
  latin: string;
  emoji: string;
  tagline: string;
}

export const MAGIC_PERSONAS: Record<MagicPersonaId, MagicPersonaMeta> = {
  magic: {
    id: "magic",
    name: "Magic Agent",
    latin: "Magic Agent",
    emoji: "🤖",
    tagline: "Agent متطور — بيفهم الأمر والبرمجة، ياخد القرار، ويبحث في الإنترنت بسرعة",
  },
};

/** قبول معرّف حالي أو قديم (للتوافق مع الداتابيز والرسايل القديمة). */
export function isMagicPersonaId(value: unknown): value is MagicPersonaId | LegacyMagicPersonaId {
  return value === "magic" || value === "tutor" || value === "play" || value === "coach";
}

/** توحيد أي معرّف (حالي أو قديم) على Magic Agent. */
export function normalizeMagicPersonaId(value: unknown): MagicPersonaId {
  return "magic";
}

/* -------------------------------------------------------------------------- */
/* قواعد الاختيار — الشخصية موحّدة، فالاختيار دايمًا Magic Agent بغضّ النظر     */
/* عن اختيار المستخدم أو محتوى الرسالة أو مكانها (التوافق مع الواجهات القديمة). */
/* -------------------------------------------------------------------------- */

export interface PersonaSelectionInput {
  prompt: string;
  intent?: ChatIntent | string | null;
  page?: string | null;
  explicitPersona?: string | null;
}

export interface PersonaSelection {
  persona: MagicPersonaId;
  reason: "unified_agent" | "user_override" | "workspace_intent" | "content_match" | "page_context" | "default";
  matchedKeyword?: string;
}

export function selectMagicPersona(_input: PersonaSelectionInput): PersonaSelection {
  // شخصية واحدة موحّدة: Magic Agent يستقبل كل الرسايل — الخبرات كلها مهارات جوّاه.
  return { persona: "magic", reason: "unified_agent" };
}

/* -------------------------------------------------------------------------- */
/* بناء تعليمات الشخصية — تُضاف فوق نظام Magic الموحد (مش بداله)               */
/* -------------------------------------------------------------------------- */

interface PersonaPromptContextDir {
  subject?: string | null;
  lesson?: string | null;
  stage?: string | null;
  grade?: string | null;
}

/**
 * تعليمات إضافية فوق الـ base prompt — لم تعد ضرورية: كل توجيهات الشخصيات
 * القديمة (شرح/ترفيه/تخطيط) اندمجت في buildMagicSystemPrompt نفسه.
 * محفوظة للتوافق مع استدعاءات الـ route — بترجع دايمًا نص فاضي.
 */
export function buildPersonaDirective(
  _persona: MagicPersonaId | LegacyMagicPersonaId,
  _ctx: PersonaPromptContextDir = {},
): string {
  return "";
}

export type PersonaPromptContext = MagicPersonaContext;

/**
 * هوية Magic Agent — لكل معرّف (حالي أو قديم) نفس الهوية الموحّدة،
 * مع الحفاظ على السياق الأكاديمي والقواعد المشتركة.
 */
export function buildPersonaIdentityPrompt(
  _persona: MagicPersonaId | LegacyMagicPersonaId,
  ctx: PersonaPromptContext = {}
): string {
  return buildMagicSystemPrompt(ctx);
}
