// lib/magic/personas.ts
//
// طبقة الشخصيات المتعددة (Multi-Persona Architecture) — Phase 1: Persona & Orchestrator.
// المستخدم يتعامل مع مساعد واحد موحد (Magicly)؛ هنا فقط بنحدد مين «الخبير» الأنسب
// يرد في الخلفية حسب: اختيار المستخدم الصريح ← محتوى الرسالة ← مكان المستخدم ← افتراضي.
// لا يخصم هذا الملف أي Credits ولا يمس قاعدة البيانات — إخراجه نص تعليمات فقط.

import type { ChatIntent } from "@/lib/ai/chat-intent";

export type MagicPersonaId = "magic" | "tutor" | "play" | "coach";

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
    name: "ماجيك",
    latin: "Magic",
    emoji: "⚡",
    tagline: "صديقك ومرشدك في كل Magicly",
  },
  tutor: {
    id: "tutor",
    name: "المعلم",
    latin: "Tutor",
    emoji: "📚",
    tagline: "شرح المحتوى العلمي خطوة بخطوة",
  },
  play: {
    id: "play",
    name: "بلاي",
    latin: "Play",
    emoji: "🎮",
    tagline: "ألعاب وتحديات وترفيه",
  },
  coach: {
    id: "coach",
    name: "كوتش",
    latin: "Coach",
    emoji: "🎯",
    tagline: "خطة مذاكرة وتنظيم وقت ومتابعة",
  },
};

export function isMagicPersonaId(value: unknown): value is MagicPersonaId {
  return value === "magic" || value === "tutor" || value === "play" || value === "coach";
}

/* -------------------------------------------------------------------------- */
/* قواعد الاختيار — كلمات مفتاحية حقيقية من كلام الطالب (عربي + إنجليزي)       */
/* -------------------------------------------------------------------------- */

const COACH_KEYWORDS = [
  "خطة",
  "خطتي",
  "جدول",
  "نظم",
  "رتّب",
  "رتب",
  "وزّع",
  "وزع",
  "توزيع",
  "مذاكرة",
  "امتحان",
  "امتحانات",
  "أذاكر",
  "اذاكر",
  "أراجع",
  "اراجع",
  "مراجعة",
  "متأخر",
  "تأخر",
  "نقاط ضعف",
  "تقدمي",
  "مستواي",
  "وقتي",
  "تنظيم",
  "study plan",
  "schedule",
  "organize",
  "revision plan",
];

const PLAY_KEYWORDS = [
  "لعبة",
  "ألعاب",
  "العب",
  "لعبت",
  "تحدي",
  "تحدّي",
  "مسابقة",
  "غرفة الهروب",
  "ترفيه",
  "نكتة",
  "مضحك",
  "خليها ممتعة",
  "ملل",
  "game",
  "play",
  "challenge",
  "fun",
  "trivia",
];

const TUTOR_KEYWORDS = [
  "اشرح",
  "شرح",
  "ما فهمت",
  "مش فاهم",
  "مفهمتش",
  "فاهمش",
  "وضّح",
  "وضح",
  "بسّط",
  "بسط",
  "يعني إيه",
  "يعني ايه",
  "إيه معنى",
  "ايه معنى",
  "معنى",
  "حل المسألة",
  "حل المسالة",
  "حلّ",
  "تمرين",
  "خطوات الحل",
  "تعريف",
  "explain",
  "clarify",
  "solve",
  "exercise",
  "definition",
];

const PLATFORM_KEYWORDS = [
  "حسابي",
  "حساب",
  "رصيد",
  "كريدت",
  "credits",
  "باقة",
  "اشتراك",
  "اشترك",
  "دفع",
  "نقاط",
  "عملات",
  "رفع ملف",
  "ارفع",
  "أرفع",
  "الموقع",
  "المنصة",
  "تطبيق",
  "الإعدادات",
  "إعدادات",
  "كلمة السر",
  "الباسورد",
  "تسجيل خروج",
  "subscription",
  "balance",
  "upload",
  "account",
  "settings",
  "password",
];

function firstKeywordHit(prompt: string, keywords: string[]): string | null {
  const p = prompt.toLowerCase();
  for (const k of keywords) {
    if (p.includes(k.toLowerCase())) return k;
  }
  return null;
}

/* المكان مجرد Context وليس إجبارًا — بيستخدم فقط لو كلام الطالب ما فتحش تخصص واضح. */
function pageBias(page?: string | null): MagicPersonaId | null {
  const p = (page || "").toLowerCase();
  if (!p) return null;
  if (p.includes("/lesson") || p.includes("/lectures") || p.includes("/courses")) return "tutor";
  if (p.includes("/games") || p.includes("/escape-room") || p.includes("/arcade")) return "play";
  if (p.includes("/planner") || p.includes("/calendar") || p.includes("/missions")) return "coach";
  return null;
}

export interface PersonaSelectionInput {
  prompt: string;
  intent?: ChatIntent | string | null;
  page?: string | null;
  explicitPersona?: string | null;
}

export interface PersonaSelection {
  persona: MagicPersonaId;
  reason: "user_override" | "workspace_intent" | "content_match" | "page_context" | "default";
  matchedKeyword?: string;
}

export function selectMagicPersona(input: PersonaSelectionInput): PersonaSelection {
  const explicit = (input.explicitPersona || "").trim().toLowerCase();
  if (isMagicPersonaId(explicit)) {
    return { persona: explicit, reason: "user_override" };
  }

  const intent = (input.intent || "").toString().toUpperCase();
  if (intent === "WORKSPACE_SEARCH" || intent === "RECORDED_LECTURES_SEARCH") {
    return { persona: "magic", reason: "workspace_intent" };
  }

  const prompt = (input.prompt || "").toLowerCase();

  const tutorHit = firstKeywordHit(prompt, TUTOR_KEYWORDS);
  if (tutorHit) return { persona: "tutor", reason: "content_match", matchedKeyword: tutorHit };

  const coachHit = firstKeywordHit(prompt, COACH_KEYWORDS);
  if (coachHit) return { persona: "coach", reason: "content_match", matchedKeyword: coachHit };

  const playHit = firstKeywordHit(prompt, PLAY_KEYWORDS);
  if (playHit) return { persona: "play", reason: "content_match", matchedKeyword: playHit };

  const platformHit = firstKeywordHit(prompt, PLATFORM_KEYWORDS);
  if (platformHit) return { persona: "magic", reason: "content_match", matchedKeyword: platformHit };

  const bias = pageBias(input.page);
  if (bias) return { persona: bias, reason: "page_context" };

  return { persona: "magic", reason: "default" };
}

/* -------------------------------------------------------------------------- */
/* بناء تعليمات الشخصية — تُضاف فوق نظام Magic الموحد (مش بداله)               */
/* -------------------------------------------------------------------------- */

export interface PersonaPromptContext {
  subject?: string | null;
  lesson?: string | null;
  stage?: string | null;
  grade?: string | null;
}

function personaScopeLine(ctx: PersonaPromptContext): string {
  const rows: string[] = [];
  if (ctx.subject && ctx.subject.trim()) rows.push(`- المادة الحالية: ${ctx.subject.trim()}`);
  if (ctx.lesson && ctx.lesson.trim()) rows.push(`- الدرس الحالي: ${ctx.lesson.trim()}`);
  if (ctx.grade && ctx.grade.trim()) rows.push(`- المرحلة/الصف: ${ctx.grade.trim()}`);
  if (rows.length === 0) return "";
  return `\n\nسياق الطالب:\n${rows.join("\n")}`;
}

export function buildPersonaDirective(
  persona: MagicPersonaId,
  ctx: PersonaPromptContext = {},
): string {
  if (persona === "magic") return "";

  const sharedTail = [
    "",
    "حدود مشتركة:",
    "- أنت جزء من شخصية Magic الموحدة في Magicly — لا تقدّم نفسك كتطبيق أو بوت منفصل.",
    "- حافظ على اللهجة المصرية الطبيعية في المحادثات العادية ونفس أسلوب Magicly.",
    "- لو السؤال خارج تخصصك تمامًا (حساب/رصيد/ألعاب وأنت المعلم مثلًا)، أجب باختصار ووضّح أن ماجيك هو الأنسب لهذا الموضوع.",
  ].join("\n");

  const scope = personaScopeLine(ctx);

  if (persona === "tutor") {
    return [
      "أنك تعمل الآن بشخصية «المعلم (Tutor)» — خبير المحتوى العلمي داخل Magicly.",
      "",
      "تخصصك:",
      "- شرح المحاضرات والمفاهيم العلمية خطوة بخطوة.",
      "- تبسيط المفاهيم بأمثلة من حياة الطالب اليومية.",
      "- حل المسائل والتدريبات مع إظهار خطوات الحل كاملة.",
      "- تقييم فهم الطالب وتحديد نقاط ضعفه بأسئلة قصيرة.",
      "",
      "قواعد الشرح:",
      "- ابدأ بالفكرة البسيطة ثم انتقل للتفاصيل.",
      "- اعتمد على محتوى ملفات الطالب ومادته فقط، ولا تخترع معلومات من خارجها.",
      "- بعد أي شرح طويل، اختم بسؤال قصير للتأكد من الفهم.",
      scope,
      sharedTail,
    ]
      .filter((l) => l !== null)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  if (persona === "play") {
    return [
      "أنت تعمل الآن بشخصية «بلاي (Play)» — خبير الترفيه والألعاب داخل Magicly.",
      "",
      "تخصصك:",
      "- اقتراح ألعاب وتحديات ومسابقات من مميزات المنصة.",
      "- تفاعل مرح ومحفز أثناء اللعب والإنجازات الترفيهية.",
      "- ربط المرح بالتعلّم كلما أمكن (تحدي سريع، سؤال ممتع، مسابقة).",
      "",
      "قواعد الأسلوب:",
      "- ردود قصيرة حيوية بدون إطالة.",
      "- حافظ على الاحترام دائمًا، ولا تدفع الطالب للتشتت بعيدًا عن هدفه.",
      "- لو الطالب متعب أو مليان، اقترح استراحة قصيرة ممتعة ثم العودة للمذاكرة.",
      scope,
      sharedTail,
    ]
      .filter((l) => l !== null)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return [
    "أنت تعمل الآن بشخصية «كوتش (Coach)» — مرشد التخطيط والتقدم داخل Magicly.",
    "",
    "تخصصك:",
    "- تحويل أهداف الطالب (مثل «عندي امتحان بعد يومين») إلى خطة واقعية خطوة بخطوة.",
    "- تنظيم الوقت وتوزيع المهام على الأيام والساعات المتاحة.",
    "- متابعة التقدم واكتشاف التأخير وإعادة توزيع الخطة باقتراح (وليس تغييرًا من نفسك).",
    "- التحفيز الصادق بدون مجاملات مبالغ فيها.",
    "",
    "قواعد التخطيط:",
    "- قبل بناء أي خطة، اسأل عن المتبقي: المحتوى المطلوب، عدد المحاضرات أو الأجزاء، والوقت المتاح.",
    "- كل خطة تخرج خطوات مرقّمة قابلة للتنفيذ مع مواعيد واضحة.",
    "- اربط المهام بمميزات المنصة المتاحة في السياق (دروس، ملفات، اختبارات) دون اختراع روابط غير موجودة.",
    "- لا تدّعي معرفة مواعيد أو درجات غير مؤكدة.",
    scope,
    sharedTail,
  ]
    .filter((l) => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
