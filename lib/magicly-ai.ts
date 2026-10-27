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
  /**                       (   profiles.study_field) */
  studyField: string;
  /**                       (   profiles.learning_goal) */
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
  if (/                    quiz/.test(text)) return "quiz";
  if (/      ]|     summary/.test(text)) return "summarize";
  if (/              review/.test(text)) return "review";
  if (/    |flashcard/.test(text)) return "flashcards";
  if (/   |       pdf|    /.test(text)) return "file";
  return "explain";
}

/**
 *                                               fallback         igration
 *                      .                                                
 */
export async function getStudentContext(
  supabase: SupabaseClient,
  userId: string,
  input: MagiclyContextInput
): Promise<StudentContext> {
  const configId = shortText(input.configId);
  const lessonDay = typeof input.lessonDay === "number" && Number.isInteger(input.lessonDay) ? input.lessonDay : null;
  const fallback: Pick<StudentContext, "subject" | "lesson" | "learningStyle" | "studyField" | "learningGoal"> = {
    subject: shortText(input.subject) || "              ",
    lesson: shortText(input.lesson) || "              ",
    learningStyle: isLearningStyle(input.learningStyle) ? input.learningStyle : "practical",
    studyField: shortText(input.studyField) || "",
    learningGoal: shortText(input.learningGoal) || "",
  };

  if (!configId) {
    // config profiles
    // config profiles
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

/**                                                       . */
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

  const facts = [`               ${progress.completed}/${progress.total}.`];
  if (lesson) facts.push(`               ${lesson.topic}${lesson.isCompleted ? " (      " : ""}.`);
  if (files.length) facts.push(`                   : ${files.map((file) => `${file.title}: ${file.snippet}`).join(" | ")}`);

  if (lesson && shouldMarkCurrentLessonComplete(latestMessage)) {
    const updated = await updateStudyProgress(supabase, userId, lesson.id, true);
    if (updated) facts.push("                                                         ");
  }

  return facts;
}

/**                                                              */
export async function rememberSessionContext(
  supabase: SupabaseClient,
  userId: string,
  context: StudentContext,
  latestMessage = ""
) {
const now = new Date().toISOString();
  const rows: Array<{ user_id: string; kind: string; value: string; updated_at: string }> = [
    { user_id: userId, kind: "recent_subject", value: context.subject, updated_at: now },
    { user_id: userId, kind: "preferred_style", value: context.learningStyle, updated_at: now },
    { user_id: userId, kind: "recent_lesson", value: context.lesson, updated_at: now },
    ...getUsefulMemorySignals(latestMessage, userId).map((row) => ({ ...row, updated_at: now })),
  ].filter((row) => row.value && row.value.trim().length > 0);

if (rows.length > 0) {
    await supabase.from("ai_memories").upsert(rows, { onConflict: "user_id,kind,value" });
  }
}

/**
 *                                                  .                 *                                                                 
 */
function getUsefulMemorySignals(message: string, userId: string) {
  const find = (pattern: RegExp) => pattern.exec(message)?.[1]?.trim().slice(0, 120);
  const weakTopic = find(/(?:weak|topic)\s+([^ .! !\n]{2,120})/i);
  const commonMistake = find(/(?:mistake|error)\s+([^ .! !\n]{2,120})/i);
  const completedTopic = find(/(?:completed|done)\s+([^ .! !\n]{2,120})/i);

  return [
    weakTopic && { user_id: userId, kind: "weak_topic", value: weakTopic },
    commonMistake && { user_id: userId, kind: "common_mistake", value: commonMistake },
    completedTopic && { user_id: userId, kind: "completed_topic", value: completedTopic },
  ].filter(Boolean) as Array<{ user_id: string; kind: string; value: string }>;
}

const STYLE_GUIDE = {
  practical: "                                           ",
  visual: "                                                       .",
  academic: "                                           ",
} as const;

const MODE_GUIDE: Record<MagiclyMode, string> = {
  explain: "     Teaching Flow:                                                                                                              ",
  quiz: "                                                                                                               ",
  summarize: "                                                                            ",
  review: "                                                                               .",
  file: "                                                                                                           ",
  flashcards: "                                                                          5                                    ",
};

export function buildMagiclySystemPrompt(context: StudentContext, mode: MagiclyMode, toolFacts: string[] = []) {
  const memories = context.memories.length
    ? context.memories.map((memory) => `${memory.kind}: ${memory.value}`).join(" | ")
    : "                                ";

  return withDiagramGuidelines(`Study context for the user.



- Study field: ${context.studyField ? `in ${context.studyField}` : "unknown"}
- Learning goal: ${context.learningGoal || "not specified"}

- Subject: ${context.subject}
- Lesson: ${context.lesson}
- Progress: ${context.progress.completed}/${context.progress.total} lessons
- Memories: ${memories}
${toolFacts.length ? `- Tool facts: ${toolFacts.join(" ")}` : ""}

Style guide:
- ${STYLE_GUIDE[context.learningStyle]}

${mode}.

${MODE_GUIDE[mode]}`);

}
