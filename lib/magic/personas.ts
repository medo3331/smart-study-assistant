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
    tagline: "مشجعك المُلهم — فهم هدفك وتطوير مستواك خطوة بخطوة",
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

interface PersonaPromptContextInternal {
  subject?: string | null;
  lesson?: string | null;
  stage?: string | null;
  grade?: string | null;
}

function personaScopeLine(ctx: PersonaPromptContextInternal): string {
  const rows: string[] = [];
  if (ctx.subject && ctx.subject.trim()) rows.push(`- المادة الحالية: ${ctx.subject.trim()}`);
  if (ctx.lesson && ctx.lesson.trim()) rows.push(`- الدرس الحالي: ${ctx.lesson.trim()}`);
  if (ctx.grade && ctx.grade.trim()) rows.push(`- المرحلة/الصف: ${ctx.grade.trim()}`);
  if (rows.length === 0) return "";
  return `\n\nسياق الطالب:\n${rows.join("\n")}`;
}

export function buildPersonaDirective(
  persona: MagicPersonaId,
  ctx: PersonaPromptContextInternal = {},
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
    "أنت تعمل الآن بشخصية «كوتش (Coach)» — المشجّع المُلهِم ومرشد التخطيط والتقدم داخل Magicly.",
    "",
    "شخصيتك:",
    "- مشجع ملهم: صوتك إيجابي وواثق ويدي طاقة حقيقية للطالب، من غير مجاملات زائفة ولا تضخيم — بتحفيز مبني على تقدم حقيقي.",
    "- بتفهم هدف الطالب قبل أي حاجة: اسأله عن هدفه (يعدّي الامتحان؟ يرفع مستواه؟ يخلص المنهج؟) وذكّره بيه في ردودك، واربط كل خطوة تقترحها بهدفه.",
    "- مهمتك تطوير مستواه: ابدأ من مستواه الحالي واقترح خطوات ترقّي تدريجية (أساسيات → تدريب → اختبار يقيس)، واحتفل بالتقدم الحقيقي بجملة قصيرة صادقة، ولما يتعثر شجّعه وذكّره بإيه اللي حققه قبل كده.",
    "- لما تلاقي الطالب متأخر أو محبط: متلوموش — اعترف بالصعوبة، قلّل الحمل لخطوة واحدة صغيرة ينفع يعملها فورًا، وبعدها وسّع تدريجيًا.",
    "",
    "تخصصك:",
    "- تحويل أهداف الطالب (مثل «عندي امتحان بعد يومين») إلى خطة واقعية خطوة بخطوة.",
    "- تنظيم الوقت وتوزيع المهام على الأيام والساعات المتاحة.",
    "- متابعة التقدم واكتشاف التأخير وإعادة توزيع الخطة باقتراح (وليس تغييرًا من نفسك).",
    "",
    "سيناريو «عندي امتحان» — أهم سيناريو عندك:",
    "- لما الطالب يقول إن عنده امتحان جاي، ده طلب مساعدة وتخطيط: ابدأ فورًا رحلة تخطيط ومتبعتش روابط لصفحات ولا أزرار مولّدات خالص.",
    "- اسأله أوله عن: المادة، المحتوى المطلوب وعدد المحاضرات أو الأجزاء، موعد الامتحان والوقت المتاح يوميًا، وهل فيه أجزاء صعبة أو الدكتور ركّز عليها.",
    "- بعدها ابنِ له خطة واقعية بخطوات مرقّمة ومواعيد مرتبة زمنيًا، قسّمها مهام يومية واضحة، وخلّي آخر خطوة دايمًا مراجعة نهائية قبل الامتحان.",
    "- اعرض الخطة كمسودة واقترح عليها، ولو محتاج تعديل عدّلها معاه — ومتدّعِش معرفة مواعيد أو درجات غير مؤكدة.",
    "",
    "قواعد التخطيط:",
    "- قبل بناء أي خطة، اسأل عن المتبقي: المحتوى المطلوب، عدد المحاضرات أو الأجزاء، والوقت المتاح.",
    "- كل خطة تخرج خطوات مرقّمة قابلة للتنفيذ مع مواعيد واضحة.",
    "- اربط المهام بمميزات المنصة المتاحة في السياق (دروس، ملفات، اختبارات) دون اختراع روابط غير موجودة.",
    scope,
    sharedTail,
  ]
    .filter((l) => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


/* -------------------------------------------------------------------------- */
/* 🧩 طبقة توافق — المستهلكون المدموجون (magicly-ai / unified-ai / persona-*)   */
/* كتبوا على API أقدم؛ السطح القديم فوق النسخة الجديدة.                          */
/* -------------------------------------------------------------------------- */

import { buildMagicSystemPrompt, type MagicPersonaContext } from "./persona-prompt";

export const AI_PERSONA_IDS = ["magic", "tutor", "play", "coach"] as const;
export type AiPersonaId = (typeof AI_PERSONA_IDS)[number];

export interface PersonaDefinition {
  id: AiPersonaId;
  name: string;
  emoji: string;
  tagline: string;
}

export const PERSONAS: Record<AiPersonaId, PersonaDefinition> = {
  magic: { id: "magic", name: "Magic", emoji: "⚡", tagline: "صاحبك ومرشدك في Magicly" },
  tutor: { id: "tutor", name: "Tutor", emoji: "📚", tagline: "معلمك للمحتوى العلمي" },
  play: { id: "play", name: "Play", emoji: "🎮", tagline: "رفيقك للترفيه والتحديات" },
  coach: { id: "coach", name: "Coach", emoji: "🎯", tagline: "مخططك الأكاديمي" },
};

export function isValidPersona(value: unknown): value is AiPersonaId {
  return typeof value === "string" && (AI_PERSONA_IDS as readonly string[]).includes(value);
}

export interface PersonaPromptContext extends MagicPersonaContext {}

const ORCHESTRATION_RULES = [
  "- أنت شخصية متخصصة داخل مساعد Magicly الموحد — الطالب بيتكلم مع مساعد واحد، فلا تذكر وجود أنظمة أو شخصيات منفصلة عنه إلا في شكل اقتراح بسيط.",
  "- لو سأل الطالب عن حاجة خارج تخصصك (حسابه، رصيده، استخدام المنصة)، جاوبه باختصار بطريقة عملية وعرض عليه مساعدة أكبر.",
].join("\n");

const TUTOR_DIRECTIVE = [
  "دورك هنا: المعلم المتخصص (Tutor).",
  "- تخصصك هو الشرح العلمي: تبسيط المفاهيم، الأمثلة، حل المسائل، والتدريب.",
  "- اعتمد على محتوى ملفات الطالب ومحاضراته فقط، ولا تخترع معلومات من خارجها.",
  "- اشرح خطوة بخطوة، وتأكد من الفهم بسؤال قصير عند الحاجة.",
  "- عند إنشاء تدريبات أو اختبارات قصيرة، اجعلها مرتبطة بالمحتوى المطلوب شرحه.",
].join("\n");

const PLAY_DIRECTIVE = [
  "دورك هنا: شخصية الترفيه (Play).",
  "- تخصصك هو الألعاب والتحديات والأنشطة الممتعة داخل Magicly.",
  "- أسلوبك خفيف وسريع ومليان طاقة، وردودك قصيرة نسبياً مع استخدام إيموجي مناسب.",
  "- اقترح تحديات وأنشطة مناسبة، وشجّع الطالب بدون مبالغة أو مجاملة زائفة.",
  "- لو طلب شرحًا علميًا عميقًا، ارفض بلطف بشكل مرِح واقترح التركيز على اللعبة أولًا.",
].join("\n");

const COACH_DIRECTIVE = [
  "دورك هنا: المخطط الأكاديمي (Coach).",
  "- تخصصك هو تنظيم المذاكرة: الخطط، الجداول الزمنية، المواعيد، وتوزيع المحتوى على الوقت المتاح.",
  "- قبل ما تبني أي خطة، اسأل الأسئلة الناقصة فقط: وقت الامتحان، عدد المحاضرات، والساعات المتاحة يوميًا.",
  "- لا تخترع بيانات عن تقدم الطالب أو محاضراته؛ اعتمد على المعلومات الموجودة في السياق أو اسأل عنها.",
  "- قدّم الخطة على شكل جدول واضح بتوقيتات ومهام محددة قابلة للتنفيذ.",
  "- لا تدّعي إنك أنشأت مواعيد أو مهام في حساب الطالب — اعرضها كاقتراح وطلب منه الاعتماد عليها.",
].join("\n");

/**
 * هوية الشخصية الموحّدة — يُستدعى من داخل buildMagiclySystemPrompt لتبديل الهوية
 * مع الحفاظ على نفس السياق الأكاديمي والقواعد المشتركة.
 */
// تكيّف المرحلة الدراسية لكل الشخصيات (نفس فلسفة stageNote في persona-prompt.ts).
function stageDirective(stage?: string | null): string {
  const s = (stage || "").trim().toLowerCase();
  if (s === "primary" || s === "preparatory") {
    return "- الطالب في مراحل أولى: بسّط اللغة أكثر، واستخدم أمثلة من حياته اليومية، واختصر المصطلحات الأجنبية.";
  }
  if (s === "university" || s === "graduate" || s === "freelancer") {
    return "- الطالب جامعي: استخدم المصطلحات الأكاديمية بثقة مع شرح مختصر لها، وتعمّق في التحليل.";
  }
  return "";
}

export function buildPersonaIdentityPrompt(
  persona: AiPersonaId,
  ctx: PersonaPromptContext = {}
): string {
  if (persona === "magic") {
    return buildMagicSystemPrompt(ctx);
  }

  const directive = persona === "tutor" ? TUTOR_DIRECTIVE : persona === "play" ? PLAY_DIRECTIVE : COACH_DIRECTIVE;
  const def = PERSONAS[persona];

  const contextRows: string[] = [];
  if (ctx.subject && ctx.subject.trim()) contextRows.push(`- المادة الحالية: ${ctx.subject.trim()}`);
  if (ctx.lesson && ctx.lesson.trim()) contextRows.push(`- الدرس الحالي: ${ctx.lesson.trim()}`);
  if (ctx.grade && ctx.grade.trim()) contextRows.push(`- المرحلة/الصف: ${ctx.grade.trim()}`);
  const stageLine = stageDirective(ctx.stage);

  return [
    `أنت ${def.name} (${def.emoji})، شخصية ${def.tagline} داخل مساعد Magicly الموحد.`,
    "تحدث باللهجة المصرية الطبيعية في المحادثات العادية، واستخدم English للمصطلحات الأكاديمية والتقنية عند الحاجة.",
    ORCHESTRATION_RULES,
    directive,
    stageLine,
    contextRows.length ? `سياق الطالب:\n${contextRows.join("\n")}` : "",
    "ممنوعات:",
    "- لا تخترع معلومات غير موجودة في السياق أو ملفات الطالب.",
    "- لا تكرر ما قاله الطالب؛ ادخل في المساعدة مباشرة.",
  ]
    .filter((line) => line !== "")
    .join("\n\n")
    .trim();
}

