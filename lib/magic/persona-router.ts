// lib/magic/persona-router.ts
//
// Persona Orchestrator — اختيار الشخصية المناسبة لكل طلب داخل الشات الموحد.
//
// أولوية الاختيار (حسب قرار التصميم المعتمد):
//   1. اختيار المستخدم الصريح — له الأولوية المطلقة.
//   2. محتوى الرسالة — ترفيه / تخطيط / منصة / علمي.
//   3. سياق الصفحة — صفحة الدرس تعطي أولوية لـ Tutor، صفحة الألعاب لـ Play.
//   4. الافتراضي — Magic.

import { isValidPersona, type AiPersonaId } from "./personas";

export interface PersonaRouterInput {
  explicitPersona?: string | null;
  page?: string | null;
  message: string;
  mode?: string | null;
  hasLessonContext?: boolean;
  /** شخصية المحادثة النشطة (آخر رد) — سياق متابعة نفس الموضوع، أولويته بعد المحتوى. */
  lastPersona?: string | null;
}

export interface PersonaSelection {
  persona: AiPersonaId;
  reason: string;
}

const PLAY_KEYWORDS = [
  "لعبة",
  "ألعاب",
  "الالعاب",
  "العب",
  "ألعب",
  "العبي",
  "اتحدى",
  "أتحدى",
  "تحدي",
  "تحديات",
  "مسابقة",
  "مسابقات",
  "خمن",
  "تخمين",
  "عجلة",
  "escape",
  "wheel",
  "game",
  "games",
  "challenge",
];

const COACH_PATTERNS = [
  /خطة\s*(مذاكر|دراسة|مراجعة)/,
  /جدول\s*(مذاكر|دراسة|مراجعة|يومي|أسبوع)/,
  /(أنظم|انظم|أنسق|نظم)\s*(مذاكرتي|وقتي|جدولي|دراستي)/,
  /(أرتب|ارتب)\s*(وقتي|مذاكرتي|جدولي)/,
  /(مواعيد|ميعاد)\s*(المذاكرة|المراجعة|الدراسة)/,
  /عندي\s+(امتحان|اختبار)\s+(بعد|كمان|قريب)/,
  /خطتي\s*(الدراسية|المذاكرة)?/,
];

const PLATFORM_KEYWORDS = [
  "الموقع",
  "المنصة",
  "إزاي أستخدم",
  "ازاي استخدم",
  "أرفع محاضرة",
  "ارفع محاضرة",
  "أرفع ملف",
  "ارفع ملف",
  "حسابي",
  "رصيدي",
  "الرصيد",
  "كريدت",
  "credits",
  "باقة",
  "الباقات",
  "اشتراك",
  "الاشتراك",
  "المميزات",
  "كلمة السر",
  "تسجيل الدخول",
];

const TUTOR_KEYWORDS = [
  "اشرح",
  "إشرح",
  "شرح",
  "مش فاهم",
  "مش مفهمش",
  "فاهمش",
  "وضح",
  "وضّح",
  "بسّط",
  "بسطلي",
  "مثال",
  "مسألة",
  "حل المسألة",
  "حل السؤال",
  "ليه بيحصل",
  "إيه الفرق",
  "ايه الفرق",
  "explain",
  "تدريب",
];

function matchesAny(message: string, keywords: string[]): boolean {
  const lower = message.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

function matchesCoachPattern(message: string): boolean {
  return COACH_PATTERNS.some((p) => p.test(message));
}

const TEACHING_MODES = new Set(["explain", "quiz", "summarize", "review", "file", "flashcards"]);

/**
 * اختيار الشخصية من غير أي نداء شبكة — يتنفذ في الخلفية بسرعة وبصفر تكلفة.
 */
export function selectPersona(input: PersonaRouterInput): PersonaSelection {
  const message = (input.message || "").trim();

  if (isValidPersona(input.explicitPersona) && input.explicitPersona !== "magic") {
    return { persona: input.explicitPersona, reason: "user_selected" };
  }

  if (matchesAny(message, PLAY_KEYWORDS)) {
    return { persona: "play", reason: "message_entertainment" };
  }

  if (matchesCoachPattern(message)) {
    return { persona: "coach", reason: "message_planning" };
  }

  if (matchesAny(message, PLATFORM_KEYWORDS)) {
    return { persona: "magic", reason: "message_platform" };
  }

  if (matchesAny(message, TUTOR_KEYWORDS)) {
    return { persona: "tutor", reason: "message_academic" };
  }

  // سياق المحادثة: لو نفس الموضوع شغّال مع Tutor/Play/Coach والرسالة محايدة، نفس الشخصية تكمّل.
  if (isValidPersona(input.lastPersona) && input.lastPersona !== "magic") {
    return { persona: input.lastPersona, reason: "conversation_context" };
  }

  if (input.mode && TEACHING_MODES.has(input.mode) && input.hasLessonContext) {
    return { persona: "tutor", reason: "lesson_mode" };
  }

  const page = (input.page || "").trim().toLowerCase();
  if (page === "lesson" || input.hasLessonContext) {
    return { persona: "tutor", reason: "lesson_page" };
  }
  if (page === "play") {
    return { persona: "play", reason: "play_page" };
  }

  return { persona: "magic", reason: "default" };
}
