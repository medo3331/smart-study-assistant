import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentLesson, getStudentProgress, searchUserFiles, shouldMarkCurrentLessonComplete, updateStudyProgress } from "@/lib/magicly-tools";
import { withDiagramGuidelines } from "@/lib/ai/prompt-engine";

export const MAGICLY_MODES = ["explain", "quiz", "summarize", "review", "file", "flashcards"] as const;
export type MagiclyMode = (typeof MAGICLY_MODES)[number];

export interface MagiclyContextInput {
  configId?: unknown;
  lessonDay?: unknown;
  subject?: unknown;
  lesson?: unknown;
  learningStyle?: unknown;
  studyField?: unknown;
  learningGoal?: unknown;
}

export interface StudentContext {
  subject: string;
  lesson: string;
  learningStyle: "practical" | "visual" | "academic";
  progress: { completed: number; total: number };
  memories: Array<{ kind: string; value: string }>;
  /** ÇáÊÎÕÕ ÇáÏÑÇÓí ááØÇáÈ (ãä profiles.study_field) */
  studyField: string;
  /** ÇáåÏİ ÇáÊÚáíãí ááØÇáÈ (ãä profiles.learning_goal) */
  learningGoal: string;
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
  if (/ÇÎÊÈÑäí|ÇÎÊÈÇÑ|ßæíÒ|quiz/.test(text)) return "quiz";
  if (/áÎ[øÕÕ]|ãáÎÕ|summary/.test(text)) return "summarize";
  if (/ÑÇÌÚäí|ãÑÇÌÚÉ|review/.test(text)) return "review";
  if (/İáÇÔ|flashcard/.test(text)) return "flashcards";
  if (/ãáİ|ãÍÇÖÑÉ|pdf|ÕæÑÉ/.test(text)) return "file";
  return "explain";
}

/**
 * íŞÑÃ ÇáÍÏ ÇáÃÏäì ÇáãİíÏ ááÊÏÑíÓ ãä ÇáÍÓÇÈ¡ ãÚ fallback Âãä áæ migration
 * ÇáĞÇßÑÉ áã ÊõÔÛøá ÈÚÏ. áÇ äÚíÏ äÕæÕ ÇáãáİÇÊ Ãæ ÊÇÑíÎ ÇáãÍÇÏËÉ ÈÇáßÇãá.
 */
export async function getStudentContext(
  supabase: SupabaseClient,
  userId: string,
  input: MagiclyContextInput
): Promise<StudentContext> {
  const configId = shortText(input.configId);
  const lessonDay = typeof input.lessonDay === "number" && Number.isInteger(input.lessonDay) ? input.lessonDay : null;
  const fallback: Pick<StudentContext, "subject" | "lesson" | "learningStyle" | "studyField" | "learningGoal"> = {
    subject: shortText(input.subject) || "ÇáãÇÏÉ ÇáÍÇáíÉ",
    lesson: shortText(input.lesson) || "ÇáÏÑÓ ÇáÍÇáí",
    learningStyle: isLearningStyle(input.learningStyle) ? input.learningStyle : "practical",
    studyField: shortText(input.studyField) || "",
    learningGoal: shortText(input.learningGoal) || "",
  };

  if (!configId) {
    // ÍÊì áæ ãÇ???? configur¡ äÌáÈ ÇáÊÎÕÕ æÇáåÏİ ãä profiles Åä æõÌÏ
    const { data: profile } = await supabase
      .from("profiles")
      .select("study_field, learning_goal")
      .eq("id", userId)
      .maybeSingle();

    return {
      ...fallback,
      progress: { completed: 0, total: 0 },
      memories: [],
      studyField: profile?.study_field ?? fallback.studyField,
      learningGoal: profile?.learning_goal ?? fallback.learningGoal,
    };
  }

  const [configResult, daysResult, memoryResult, profileResult] = await Promise.all([
    supabase.from("study_configs").select("subject").eq("id", configId).eq("user_id", userId).maybeSingle(),
    supabase.from("study_days").select("day, topic, learning_style, is_completed").eq("config_id", configId).eq("user_id", userId),
    supabase.from("ai_memories").select("kind, value").eq("user_id", userId).order("updated_at", { ascending: false }).limit(8),
    supabase.from("profiles").select("study_field, learning_goal").eq("id", userId).maybeSingle(),
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
    studyField: profileResult.data?.study_field ?? fallback.studyField,
    learningGoal: profileResult.data?.learning_goal ?? fallback.learningGoal,
  };
}

/** íÔÛøá ÇáÃÏæÇÊ ÇáãäÇÓÈÉ áÓÄÇá æÇÍÏ ŞÈá Êßæíä ÑÏ ÇáãÓÇÚÏ. */
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

  const facts = [`ÇáÊŞÏã ÇáãÍÏË: ${progress.completed}/${progress.total}.`];
  if (lesson) facts.push(`ÇáÏÑÓ ÇáãİÊæÍ: ${lesson.topic}${lesson.isCompleted ? " (ãßÊãá)" : ""}.`);
  if (files.length) facts.push(`ãæÇÏ ãÑÊÈØÉ ÈÇáÓÄÇá: ${files.map((file) => `${file.title}: ${file.snippet}`).join(" | ")}`);

  if (lesson && shouldMarkCurrentLessonComplete(latestMessage)) {
    const updated = await updateStudyProgress(supabase, userId, lesson.id, true);
    if (updated) facts.push("Êã ÊÓÌíá ÇáÏÑÓ ÇáÍÇáí ßãßÊãá ÈäÇÁğ Úáì ØáÈ ÇáØÇáÈ ÇáÕÑíÍ.");
  }

  return facts;
}

/** íÍİÙ ÍŞÇÆŞ ãİíÏÉ æËÇÈÊÉ İŞØ¡ æáíÓ Ãí ãÍÇÏËÉ Ãæ ÈíÇäÇÊ ÍÓÇÓÉ. */
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
 * ÈäÎÒøä ÅÔÇÑÇÊ ÏÑÇÓíÉ ÕÑíÍÉ ŞÇáåÇ ÇáØÇáÈ ÈäİÓå İŞØ. ãİíÔ ÇÓÊäÊÇÌÇÊ
 * äİÓíÉ Ãæ äÓÎ ááãÍÇÏËÉ: ÇáåÏİ Åä ÇáãíãæÑí ÊÓÇÚÏ İí ÇáÌáÓÉ ÇáÌÇíÉ.
 */
function getUsefulMemorySignals(message: string, userId: string) {
  const find = (pattern: RegExp) => pattern.exec(message)?.[1]?.trim().slice(0, 120);
  const weakTopic = find(/(?:ãÔ İÇåã(?:É)?|ãÔ ãÓÊæÚÈ(?:É)?|ÖÚíİ(?:É)? İí)\s+([^¡.!¿!\n]{2,120})/i);
  const commonMistake = find(/(?:ÛáØÊ İí|ÈÊáÛÈØ İí|ÈáÎÈØ İí)\s+([^¡.!¿!\n]{2,120})/i);
  const completedTopic = find(/(?:ÎáÕÊ|ÃäåíÊ|ĞÇßÑÊ)\s+([^¡.!¿!\n]{2,120})/i);

  return [
    weakTopic && { user_id: userId, kind: "weak_topic", value: weakTopic },
    commonMistake && { user_id: userId, kind: "common_mistake", value: commonMistake },
    completedTopic && { user_id: userId, kind: "completed_topic", value: completedTopic },
  ].filter(Boolean) as Array<{ user_id: string; kind: string; value: string }>;
}

const STYLE_GUIDE = {
  practical: "ÇÓÊÎÏã ãËÇáğÇ ÚãáíğÇ ŞÑíÈğÇ ãä ÍíÇÉ ÇáØÇáÈ.",
  visual: "ÇÓÊÎÏã ÊÑÊíÈğÇ ÈÕÑíğÇ ÈÓíØğÇ Ãæ ãÎØØğÇ äÕíğÇ ÚäÏ ÇáÍÇÌÉ.",
  academic: "ÍÇİÙ Úáì ÇáÊÚÑíİ ÇáÏŞíŞ Ëã ÈÓøØå ÈáÛÉ ÓåáÉ.",
} as const;

const MODE_GUIDE: Record<MagiclyMode, string> = {
  explain: "ÇÊÈÚ Teaching Flow: ÔÑÍ ÈÓíØ ŞÕíÑ¡ Ëã ãËÇá æÇÖÍ¡ Ëã ÓÄÇá æÇÍÏ ááÊÍŞŞ ãä Çáİåã. áÇ ÊÚØö ÇáÅÌÇÈÉ Úáì ÓÄÇá ÇáÊÍŞŞ ÅáÇ ÈÚÏ ÑÏ ÇáØÇáÈ.",
  quiz: "ÇÕäÚ ÇÎÊÈÇÑğÇ ÊÏÑíÌíğÇ: ÓÄÇá æÇÍÏ İí ßá ÑÓÇáÉ¡ æÇäÊÙÑ ÇáÅÌÇÈÉ¡ Ëã ÕÍÍåÇ æÇÔÑÍ ÇáÛáØÉ ÈÇÎÊÕÇÑ ŞÈá ÇáÓÄÇá ÇáÊÇáí.",
  summarize: "ŞÏøã ãáÎÕğÇ ãÑÊÈğÇ ãä ÇáäŞÇØ ÇáÃÓÇÓíÉ İŞØ¡ Ëã ÇŞÊÑÍ Ãåã äŞØÉ íÑÇÌÚåÇ ÇáØÇáÈ.",
  review: "ÇÈÏÃ ÈÃßËÑ ÇáäŞÇØ ÚÑÖÉ ááøÈÓ¡ æÑÇÌÚåÇ ßÓÄÇá æÌæÇÈ ŞÕíÑ ÈÏá ÅÚÇÏÉ ÇáãÍÇÖÑÉ ßÇãáÉ.",
  file: "ÇáÊÒã ÈÇáäÕ ÇáãÑİŞ. ÇÈÏÃ ÈÎÑíØÉ ÓÑíÚÉ áãÇ İí Çáãáİ¡ Ëã ÇÔÑÍ Ãåã İßÑÉ æãËÇáğÇ ÚáíåÇ¡ Ëã ÇÓÃá ÓÄÇá ÊÍŞŞ æÇÍÏ.",
  flashcards: "ÃäÔÆ İáÇÔ ßÇÑÏÒ ŞÕíÑÉ ãä ÇáãÍÊæì: ÓÄÇá æÇÖÍ İí ÓØÑ æÅÌÇÈÊå İí ÓØÑ. ÇÈÏÃ ÈÜ5 İŞØ¡ æáÇ ÊÖİ ãÚáæãÉ ãä ÎÇÑÌ ÇáãÇÏÉ.",
};

export function buildMagiclySystemPrompt(context: StudentContext, mode: MagiclyMode, toolFacts: string[] = []) {
  const memories = context.memories.length
    ? context.memories.map((memory) => `${memory.kind}: ${memory.value}`).join(" | ")
    : "áÇ ÊæÌÏ ĞßÑíÇÊ ãİíÏÉ ãÍİæÙÉ ÈÚÏ.";

  return withDiagramGuidelines(`ÃäÊ «ãÇÌíßáí»¡ ãÓÇÚÏ ãĞÇßÑÉ ãÕÑí Îİíİ æØÈíÚí. åÏİß İåã ÇáØÇáÈ æÊÏÑíÈå¡ æáíÓ ãÌÑÏ ÅÚØÇÁ ÅÌÇÈÉ.

ÇáÓíÇŞ ÇáãæËæŞ:
- ÇáØÇáÈ: ${context.studyField ? `ØÇáÈ İí ÊÎÕÕ ${context.studyField}` : "ØÇáÈ"}
- ÇáåÏİ ÇáÊÚáíãí: ${context.learningGoal || "ÊØæíÑ ÇáãåÇÑÇÊ"}

- ÇáãÇÏÉ: ${context.subject}
- ÇáÏÑÓ: ${context.lesson}
- ÇáÊŞÏã: ${context.progress.completed}/${context.progress.total} ÏÑæÓ ãßÊãáÉ
- ÃÓáæÈ ÇáÊÚáøã: ${context.learningStyle}
- ÊİÖíáÇÊ ãİíÏÉ İŞØ: ${memories}
${toolFacts.length ? `- äÊÇÆÌ ÇáÃÏæÇÊ: ${toolFacts.join(" ")}` : ""}

ŞæÇÚÏ ÇáßáÇã:
- ÇßÊÈ ÈÇáÚÑÈíÉ ÇáãÕÑíÉ ÇáæÇÖÍÉ¡ ÈåÏæÁ æÈáÇ ãÈÇáÛÉ Ãæ áÛÉ ÊÓæíŞíÉ.
- áÇ ÊÎÊÑÚ ãÚáæãÉ ãä ãáİ ÛíÑ ãæÌæÏ. Åä äŞÕÊ ãÚáæãÉ ãÄËÑÉ¡ ÇÓÃá ÓÄÇá ãÊÇÈÚÉ æÇÍÏğÇ ãÍÏÏğÇ ŞÈá ÇáÇİÊÑÇÖ.
- áÇ ÊÎÊã ÇáÑÓÇÆá ÊáŞÇÆíğÇ ÈÜ«ßíİ íãßääí ãÓÇÚÏÊß¿» Ãæ ÏÚæÇÊ ãÊßÑÑÉ.
- áÇ ÊßÑÑ ãÇ ŞÇáå ÇáØÇáÈº ÇÏÎá İí ÇáãÓÇÚÏÉ ãÈÇÔÑÉ.
- ÇÌÚá ÇáÑÏ ãäÇÓÈğÇ ááãæÈÇíá: İŞÑÇÊ ŞÕíÑÉ æäŞÇØ ŞáíáÉ ÚäÏ ÇáÍÇÌÉ.
- ${STYLE_GUIDE[context.learningStyle]}

ÇáæÖÚ ÇáÍÇáí: ${mode}.
${MODE_GUIDE[mode]}`);
}

