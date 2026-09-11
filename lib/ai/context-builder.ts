// lib/ai/context-builder.ts
//
// بيبني السياق الكامل اللي بيتبعت للموديل: البروفايل + نقاط الضعف +
// تاريخ المحادثة + الـ system prompt المخصص + اقتراح الموديل والـ
// temperature المناسبين.
//
// ⚠️ فروق جوهرية عن أي وصف عام للميزة — دي أسماء الجداول والأعمدة
// الموجودة **فعليًا** في db/*.sql:
//   • مفيش جدول weak_topics — نقاط الضعف بتتخزن في ai_memories
//     (db/ai-learning.sql) تحت kind = 'weak_topic' / 'common_mistake'.
//   • chat_messages مالهاش session_id؛ المفتاح conversation_id + user_id
//     (db/chat.sql)، ومفيش عمود model_used.
//   • profiles مافيهاش full_name/stage/grade/subjects/goal/preferred_style/
//     daily_study_hours. الموجود: display_name, persona, student_level,
//     field, subject, education_stage_id, education_grade_id
//     (db/profile-persona.sql + db/onboarding-education-roles.sql).
//   • مفيش عميل Supabase عام في '@/lib/supabase' — العميل بيتعمل لكل طلب
//     في lib/supabase/server.ts ومقيّد بـ RLS بتاعة المستخدم، فبنستلمه
//     كباراميتر (نفس نمط getStudentContext في lib/magicly-ai.ts).
//
// كل قراءة هنا best-effort: لو migration ناقصة أو الجدول مش موجود،
// الشات يكمل ببرومبت أقل تخصيصًا — مش يفشل.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiChatMessage } from "./types";
import {
  appendSystemInstruction,
  buildSystemPrompt,
  detectMessageType,
  getTemperature,
  normalizeStage,
  type MessageType,
  type PromptConfig,
  type StudentProfile,
  type WeakTopic,
} from "./prompt-engine";
import { suggestModelForMessageType } from "./models";

/** سقف تاريخ المحادثة المسموح — نفس روح MAX_MESSAGES في الراوت. */
const DEFAULT_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 30;
/** أقصى مواضيع ضعف بتتحقن في البرومبت. */
const MAX_WEAK_TOPICS = 5;
/** أقصى مواد بتتحقن في البرومبت. */
const MAX_SUBJECTS = 6;
/** حد طول أي نص مقروء من الداتا قبل حقنه في البرومبت. */
const MAX_INJECTED_TEXT = 160;

export interface BuildContextOptions {
  /** معرّف المحادثة — بيتستخدم لجلب التاريخ من الداتابيز. */
  conversationId?: string;
  subject?: string;
  topic?: string;
  /** أسلوب التعلّم من سياق الكلاينت (practical/visual/academic). */
  learningStyle?: string;
  /**
   * تاريخ المحادثة اللي الكلاينت باعتَه. لو موجود بنستخدمه زي ما هو
   * (العميل هو مصدر الحقيقة في الواجهة الحالية) وما نقراش من الداتابيز
   * — وإلا هنضاعف نفس الرسائل مرتين في السياق.
   */
  historyMessages?: AiChatMessage[];
  maxHistoryMessages?: number;
  /** نوع الرسالة لو الواجهة حددته صراحة (زر اختبار مثلًا). */
  messageType?: MessageType;
  /** تعليمات الوضع الصريح (MODE_GUIDE) — أدق من نوع الرسالة. */
  modeInstruction?: string;
  /**
   * تعليمات تنسيق الإخراج من العميل (حقل systemInstruction). بتتلحق في
   * آخر الـ system prompt بسقف MAX_CLIENT_INSTRUCTION_CHARS — شوف
   * appendSystemInstruction في prompt-engine.ts لحدود الحماية.
   */
  systemInstruction?: string;
  /** حقائق موثوقة من الأدوات (التقدم/الدرس المفتوح/الملفات). */
  extraFacts?: string[];
}

export interface BuiltChatContext {
  /** الرسائل النهائية: system + التاريخ + رسالة الطالب. */
  messages: AiChatMessage[];
  systemPrompt: string;
  messageType: MessageType;
  profile: StudentProfile | null;
  weakTopics: WeakTopic[];
  /** undefined = مفيش تفضيل، الراوتر يختار من سياسة المهمة. */
  modelSuggestion: string | undefined;
  temperature: number;
}

function shortText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_INJECTED_TEXT) : "";
}

function clampInt(value: unknown, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return fallback;
  return Math.min(value, max);
}

type ProfileRow = {
  display_name: string | null;
  persona: string | null;
  student_level: string | null;
  field: string | null;
  subject: string | null;
  education_stage_id: string | null;
  education_grade_id: string | null;
};

type MemoryRow = { kind: string; value: string };

/**
 * يقرأ صورة الطالب من حسابه هو (RLS بيضمن إنه شايف صفّه بس).
 * null لو مفيش بروفايل — والبرومبت بيتعامل مع ده كطالب لسه ما سجّلش.
 */
async function loadStudentProfile(
  supabase: SupabaseClient,
  userId: string,
  options: BuildContextOptions,
  memories: MemoryRow[]
): Promise<StudentProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "display_name, persona, student_level, field, subject, education_stage_id, education_grade_id"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as ProfileRow;

  // اسم المرحلة/الصف من جداول التصنيف — استعلامات صغيرة ومفصولة عشان
  // ما نعتمدش على علاقة PostgREST embedded ممكن تكون مش مكتشفة.
  const [stageName, gradeName] = await Promise.all([
    lookupName(supabase, "education_stages", row.education_stage_id),
    lookupName(supabase, "education_grades", row.education_grade_id),
  ]);

  // لو مفيش taxonomy متظبط، student_level هو الاحتياطي الوحيد الموجود.
  const rawStage = stageName ?? row.student_level;

  const subjects = [
    shortText(options.subject),
    shortText(row.subject),
    shortText(row.field),
  ].filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);

  const styleMemory = memories.find((memory) => memory.kind === "preferred_style");

  return {
    full_name: shortText(row.display_name) || null,
    // normalizeStage بيرجّع "أخرى" لو القيمة مجهولة، فدايمًا نص صالح للعرض.
    stage: rawStage ? normalizeStage(rawStage) : "أخرى",
    grade: gradeName || null,
    subjects: subjects.slice(0, MAX_SUBJECTS),
    // مفيش عمود goal في profiles — لو اتضاف، يتقرا هنا من غير تعديل البرومبت.
    goal: null,
    preferred_style:
      shortText(options.learningStyle) || shortText(styleMemory?.value) || "",
    // مفيش عمود daily_study_hours في profiles — البرومبت بيتجاهل null.
    daily_study_hours: null,
  };
}

async function lookupName(
  supabase: SupabaseClient,
  table: "education_stages" | "education_grades",
  id: string | null
): Promise<string | null> {
  if (!id) return null;
  const { data, error } = await supabase.from(table).select("name").eq("id", id).maybeSingle();
  if (error || !data) return null;
  const name = (data as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

/**
 * نقاط الضعف من ذاكرة الطالب (ai_memories). الجدول مفاتيح (user_id, kind,
 * value) من غير عدّاد تكرار، فـ error_count = 0 معناها «مذكور» — والبرومبت
 * بيكتبها كملاحظة من غير رقم.
 */
function toWeakTopics(memories: MemoryRow[], subjectLabel: string): WeakTopic[] {
  return memories
    .filter((memory) => memory.kind === "weak_topic" || memory.kind === "common_mistake")
    .slice(0, MAX_WEAK_TOPICS)
    .map((memory) => ({
      subject: subjectLabel,
      topic: shortText(memory.value),
      error_count: 0,
    }))
    .filter((topic) => topic.topic.length > 0);
}

/**
 * تاريخ المحادثة من الداتابيز — بيتقرأ **فقط** لو الكلاينت ما بعتش تاريخ
 * بنفسه وعنده conversationId. الفلترة بـ user_id زيادة أمان فوق الـ RLS:
 * معرّف محادثة من حساب تاني ما يقدرش يلوّث سياق الطالب الحالي.
 */
async function loadHistory(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  limit: number
): Promise<AiChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as Array<{ role: string; content: string }>)
    .reverse()
    .map((row) => ({
      role: row.role as "user" | "assistant",
      content: typeof row.content === "string" ? row.content : "",
    }))
    .filter((message) => message.content.length > 0);
}

/**
 * يبني السياق الكامل لطلب شات واحد.
 *
 * @param supabase عميل المستخدم (مقيّد بـ RLS) — من requireUser في الراوت.
 * @param userId   معرّف المستخدم المسجّل دخوله.
 * @param userMessage آخر رسالة من الطالب.
 */
export async function buildFullContext(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  options: BuildContextOptions = {}
): Promise<BuiltChatContext> {
  const maxHistory = clampInt(
    options.maxHistoryMessages,
    DEFAULT_HISTORY_LIMIT,
    MAX_HISTORY_LIMIT
  );

  // ١) الذاكرة أولًا: البروفايل بيستخدم منها أسلوب التعلّم المحفوظ.
  const { data: memoryRows } = await supabase
    .from("ai_memories")
    .select("kind, value")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(12);
  // فشل القراءة متوقع قبل تشغيل db/ai-learning.sql — الشات يكمل عادي.
  const memories = (memoryRows ?? []) as MemoryRow[];

  // ٢) البروفايل ونقاط الضعف من نفس الداتا المقروءة.
  const profile = await loadStudentProfile(supabase, userId, options, memories);
  const subjectLabel = shortText(options.subject) || shortText(profile?.subjects[0]) || "عام";
  const weakTopics = toWeakTopics(memories, subjectLabel);

  // ٣) نوع الرسالة: الصريح من الواجهة يسبق الكشف من النص.
  const messageType: MessageType =
    options.messageType ?? detectMessageType(userMessage);

  // ٤) الـ System Prompt
  const config: PromptConfig = {
    profile,
    weakTopics,
    currentSubject: shortText(options.subject) || undefined,
    currentTopic: shortText(options.topic) || undefined,
    messageType,
    modeInstruction: options.modeInstruction,
    extraFacts: options.extraFacts?.map(shortText).filter(Boolean) ?? [],
  };
  const systemPrompt = appendSystemInstruction(
    buildSystemPrompt(config),
    options.systemInstruction
  );

  // ٥) تاريخ المحادثة
  const clientHistory = (options.historyMessages ?? []).filter(
    (message) => message.role !== "system"
  );
  const history =
    clientHistory.length > 0 || !options.conversationId
      ? clientHistory
      : await loadHistory(supabase, userId, options.conversationId, maxHistory);

  // ٦) اقتراح النموذج + الـ temperature حسب نوع الرسالة والمرحلة
  const stageKey = profile ? normalizeStage(profile.stage) : undefined;
  const modelSuggestion = suggestModelForMessageType(messageType, stageKey);
  const temperature = getTemperature(profile?.stage);

  // ٧) تجميع الرسائل النهائية
  const messages: AiChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  return {
    messages,
    systemPrompt,
    messageType,
    profile,
    weakTopics,
    modelSuggestion,
    temperature,
  };
}
