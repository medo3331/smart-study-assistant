import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentLesson, getStudentProgress, searchUserFiles, shouldMarkCurrentLessonComplete, updateStudyProgress } from "@/lib/magicly-tools";

export const MAGICLY_MODES = ["explain", "quiz", "summarize", "review", "file", "flashcards"] as const;
export type MagiclyMode = (typeof MAGICLY_MODES)[number];

export interface MagiclyContextInput {
  configId?: unknown;
  lessonDay?: unknown;
  subject?: unknown;
  lesson?: unknown;
  learningStyle?: unknown;
}

export interface StudentContext {
  subject: string;
  lesson: string;
  learningStyle: "practical" | "visual" | "academic";
  progress: { completed: number; total: number };
  memories: Array<{ kind: string; value: string }>;
}

type LearningStyle = StudentContext["learningStyle"];

function isLearningStyle(value: unknown): value is LearningStyle {
  return value === "practical" || value === "visual" || value === "academic";
}

const MAX_CONTEXT_TEXT = 160;

function shortText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, MAX_CONTEXT_TEXT) : "";
}

export function parseMode(value: unknown, latestMessage: string): MagiclyMode {
  if (typeof value === "string" && (MAGICLY_MODES as readonly string[]).includes(value)) {
    return value as MagiclyMode;
  }

  const text = latestMessage.toLowerCase();
  if (/اختبرني|اختبار|كويز|quiz/.test(text)) return "quiz";
  if (/لخ[ّصص]|ملخص|summary/.test(text)) return "summarize";
  if (/راجعني|مراجعة|review/.test(text)) return "review";
  if (/فلاش|flashcard/.test(text)) return "flashcards";
  if (/ملف|محاضرة|pdf|صورة/.test(text)) return "file";
  return "explain";
}

/**
 * يقرأ الحد الأدنى المفيد للتدريس من الحساب، مع fallback آمن لو migration
 * الذاكرة لم تُشغّل بعد. لا نعيد نصوص الملفات أو تاريخ المحادثة بالكامل.
 */
export async function getStudentContext(
  supabase: SupabaseClient,
  userId: string,
  input: MagiclyContextInput
): Promise<StudentContext> {
  const configId = shortText(input.configId);
  const lessonDay = typeof input.lessonDay === "number" && Number.isInteger(input.lessonDay) ? input.lessonDay : null;
  const fallback: Pick<StudentContext, "subject" | "lesson" | "learningStyle"> = {
    subject: shortText(input.subject) || "المادة الحالية",
    lesson: shortText(input.lesson) || "الدرس الحالي",
    learningStyle: isLearningStyle(input.learningStyle) ? input.learningStyle : "practical",
  };

  if (!configId) {
    return { ...fallback, progress: { completed: 0, total: 0 }, memories: [] };
  }

  const [configResult, daysResult, memoryResult] = await Promise.all([
    supabase.from("study_configs").select("subject").eq("id", configId).eq("user_id", userId).maybeSingle(),
    supabase.from("study_days").select("day, topic, learning_style, is_completed").eq("config_id", configId).eq("user_id", userId),
    supabase.from("ai_memories").select("kind, value").eq("user_id", userId).order("updated_at", { ascending: false }).limit(8),
  ]);

  const days = (daysResult.data ?? []) as Array<{ day: number; topic: string | null; learning_style: string | null; is_completed: boolean | null }>;
  const currentDay = lessonDay === null ? undefined : days.find((day) => day.day === lessonDay);
  const completed = days.filter((day) => day.is_completed).length;

  return {
    subject: shortText(configResult.data?.subject) || fallback.subject,
    lesson: shortText(currentDay?.topic) || fallback.lesson,
    learningStyle: isLearningStyle(currentDay?.learning_style)
      ? currentDay.learning_style
      : fallback.learningStyle,
    progress: { completed, total: days.length },
    // failure here is expected before running db/ai-learning.sql; chat continues normally.
    memories: memoryResult.error ? [] : ((memoryResult.data ?? []) as Array<{ kind: string; value: string }>),
  };
}

/** يشغّل الأدوات المناسبة لسؤال واحد قبل تكوين رد المساعد. */
export async function getStudyToolFacts(
  supabase: SupabaseClient,
  userId: string,
  input: MagiclyContextInput,
  latestMessage: string
) {
  const configId = shortText(input.configId);
  const lessonDay = typeof input.lessonDay === "number" && Number.isInteger(input.lessonDay) ? input.lessonDay : null;
  if (!configId) return [];

  const [lesson, progress, files] = await Promise.all([
    lessonDay === null ? Promise.resolve(null) : getCurrentLesson(supabase, userId, configId, lessonDay),
    getStudentProgress(supabase, userId, configId),
    searchUserFiles(supabase, userId, latestMessage),
  ]);

  const facts = [`التقدم المحدث: ${progress.completed}/${progress.total}.`];
  if (lesson) facts.push(`الدرس المفتوح: ${lesson.topic}${lesson.isCompleted ? " (مكتمل)" : ""}.`);
  if (files.length) facts.push(`مواد مرتبطة بالسؤال: ${files.map((file) => `${file.title}: ${file.snippet}`).join(" | ")}`);

  if (lesson && shouldMarkCurrentLessonComplete(latestMessage)) {
    const updated = await updateStudyProgress(supabase, userId, lesson.id, true);
    if (updated) facts.push("تم تسجيل الدرس الحالي كمكتمل بناءً على طلب الطالب الصريح.");
  }

  return facts;
}

/** يحفظ حقائق مفيدة وثابتة فقط، وليس أي محادثة أو بيانات حساسة. */
export async function rememberSessionContext(
  supabase: SupabaseClient,
  userId: string,
  context: StudentContext,
  latestMessage = ""
) {
  const rows: Array<{ user_id: string; kind: string; value: string }> = [
    { user_id: userId, kind: "recent_subject", value: context.subject },
    { user_id: userId, kind: "preferred_style", value: context.learningStyle },
    { user_id: userId, kind: "recent_lesson", value: context.lesson },
    ...getUsefulMemorySignals(latestMessage, userId),
  ];

  await supabase.from("ai_memories").upsert(rows, { onConflict: "user_id,kind,value" });
}

/**
 * بنخزّن إشارات دراسية صريحة قالها الطالب بنفسه فقط. مفيش استنتاجات
 * نفسية أو نسخ للمحادثة: الهدف إن الميموري تساعد في الجلسة الجاية.
 */
function getUsefulMemorySignals(message: string, userId: string) {
  const find = (pattern: RegExp) => pattern.exec(message)?.[1]?.trim().slice(0, 120);
  const weakTopic = find(/(?:مش فاهم(?:ة)?|مش مستوعب(?:ة)?|ضعيف(?:ة)? في)\s+([^،.!؟!\n]{2,120})/i);
  const commonMistake = find(/(?:غلطت في|بتلغبط في|بلخبط في)\s+([^،.!؟!\n]{2,120})/i);
  const completedTopic = find(/(?:خلصت|أنهيت|ذاكرت)\s+([^،.!؟!\n]{2,120})/i);

  return [
    weakTopic && { user_id: userId, kind: "weak_topic", value: weakTopic },
    commonMistake && { user_id: userId, kind: "common_mistake", value: commonMistake },
    completedTopic && { user_id: userId, kind: "completed_topic", value: completedTopic },
  ].filter(Boolean) as Array<{ user_id: string; kind: string; value: string }>;
}

const STYLE_GUIDE = {
  practical: "استخدم مثالًا عمليًا قريبًا من حياة الطالب.",
  visual: "استخدم ترتيبًا بصريًا بسيطًا أو مخططًا نصيًا عند الحاجة.",
  academic: "حافظ على التعريف الدقيق ثم بسّطه بلغة سهلة.",
} as const;

const MODE_GUIDE: Record<MagiclyMode, string> = {
  explain: "اتبع Teaching Flow: شرح بسيط قصير، ثم مثال واضح، ثم سؤال واحد للتحقق من الفهم. لا تعطِ الإجابة على سؤال التحقق إلا بعد رد الطالب.",
  quiz: "اصنع اختبارًا تدريجيًا: سؤال واحد في كل رسالة، وانتظر الإجابة، ثم صححها واشرح الغلطة باختصار قبل السؤال التالي.",
  summarize: "قدّم ملخصًا مرتبًا من النقاط الأساسية فقط، ثم اقترح أهم نقطة يراجعها الطالب.",
  review: "ابدأ بأكثر النقاط عرضة للّبس، وراجعها كسؤال وجواب قصير بدل إعادة المحاضرة كاملة.",
  file: "التزم بالنص المرفق. ابدأ بخريطة سريعة لما في الملف، ثم اشرح أهم فكرة ومثالًا عليها، ثم اسأل سؤال تحقق واحد.",
  flashcards: "أنشئ فلاش كاردز قصيرة من المحتوى: سؤال واضح في سطر وإجابته في سطر. ابدأ بـ5 فقط، ولا تضف معلومة من خارج المادة.",
};

export function buildMagiclySystemPrompt(context: StudentContext, mode: MagiclyMode, toolFacts: string[] = []) {
  const memories = context.memories.length
    ? context.memories.map((memory) => `${memory.kind}: ${memory.value}`).join(" | ")
    : "لا توجد ذكريات مفيدة محفوظة بعد.";

  return `أنت «ماجيكلي»، مساعد مذاكرة مصري خفيف وطبيعي. هدفك فهم الطالب وتدريبه، وليس مجرد إعطاء إجابة.

السياق الموثوق:
- المادة: ${context.subject}
- الدرس: ${context.lesson}
- التقدم: ${context.progress.completed}/${context.progress.total} دروس مكتملة
- أسلوب التعلّم: ${context.learningStyle}
- تفضيلات مفيدة فقط: ${memories}
${toolFacts.length ? `- نتائج الأدوات: ${toolFacts.join(" ")}` : ""}

قواعد الكلام:
- اكتب بالعربية المصرية الواضحة، بهدوء وبلا مبالغة أو لغة تسويقية.
- لا تخترع معلومة من ملف غير موجود. إن نقصت معلومة مؤثرة، اسأل سؤال متابعة واحدًا محددًا قبل الافتراض.
- لا تختم الرسائل تلقائيًا بـ«كيف يمكنني مساعدتك؟» أو دعوات متكررة.
- لا تكرر ما قاله الطالب؛ ادخل في المساعدة مباشرة.
- اجعل الرد مناسبًا للموبايل: فقرات قصيرة ونقاط قليلة عند الحاجة.
- ${STYLE_GUIDE[context.learningStyle]}

الوضع الحالي: ${mode}.
${MODE_GUIDE[mode]}`;
}
