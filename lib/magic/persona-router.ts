// lib/magic/persona-router.ts
//
// Persona Orchestrator — التوجيه داخل الشات الموحد.
//
// الشخصيات الأربع (ماجيك/المعلم/بلاي/كوتش) اتدمجت في شخصية واحدة: Magic Agent —
// كل الخبرات (شرح/ترفيه/تخطيط) بقت مهارات جوّاه، فالتوجيه دايمًا لـ Magic Agent
// بغضّ النظر عن اختيار المستخدم أو محتوى الرسالة أو الصفحة (اختيار صريح قديم
// زي "tutor" بيتقبل ويتوحّد بصمت للتوافق مع الواجهات القديمة).
//
// المتبقي من الاختيار الذكي: كشف نية التخطيط (isPlanningRequest) — بتشغّل
// أداة اعتماد الخطة (كتلة plan) في unified-ai route بدل الاعتماد على شخصية كوتش.

import type { MagicPersonaId } from "./personas";

export interface PersonaRouterInput {
  explicitPersona?: string | null;
  page?: string | null;
  message: string;
  mode?: string | null;
  /** نية الطلب من classifyChatIntent — محفوظ للتوافق مع الاستدعاءات القديمة. */
  intent?: string | null;
  hasLessonContext?: boolean;
  /** شخصية المحادثة النشطة (آخر رد) — محفوظ للتوافق، لم يعد له تأثير. */
  lastPersona?: string | null;
}

export interface PersonaSelection {
  persona: MagicPersonaId;
  reason: "unified_agent";
}

/**
 * اختيار الشخصية — صفر تكلفة وبدون أي نداء شبكة: دايمًا Magic Agent.
 */
export function selectPersona(_input: PersonaRouterInput): PersonaSelection {
  return { persona: "magic", reason: "unified_agent" };
}

/* -------------------------------------------------------------------------- */
/* كشف نية التخطيط — كان شرط تفعيل شخصية كوتش، وبقى شرط تفعيل أداة الخطة.      */
/* -------------------------------------------------------------------------- */

const PLANNING_PATTERNS = [
  /خطة\s*(مذاكر|دراسة|مراجعة)/,
  /جدول\s*(مذاكر|دراسة|مراجعة|يومي|أسبوع)/,
  /(أنظم|انظم|أنسق|نظم)\s*(مذاكرتي|وقتي|جدولي|دراستي)/,
  /(أرتب|ارتب)\s*(وقتي|مذاكرتي|جدولي)/,
  /(مواعيد|ميعاد)\s*(المذاكرة|المراجعة|الدراسة)/,
  /عندي\s+(امتحان|اختبار)\s+(بعد|كمان|قريب)/,
  /خطتي\s*(الدراسية|المذاكرة)?/,
];

/**
 * هل الرسالة طلب تخطيط مذاكرة (خطة/جدول/امتحان قريب)؟
 * بتشغّل أداة اعتماد الخطة في unified-ai route.
 */
export function isPlanningRequest(message: string): boolean {
  return PLANNING_PATTERNS.some((p) => p.test(message || ""));
}
