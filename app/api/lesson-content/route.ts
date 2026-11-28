import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";
import {
  buildCitedMessages,
  CITED_MODE_HINTS,
  extractSegments,
  normalizeForMatch,
  parseCitedExplanation,
  type LessonCitedExplanation,
  type TimedSegment,
} from "@/lib/lesson/citations";
import {
  citedModeKey,
  citedToText,
  citedVersionsKey,
  collectCitedVersions,
  deriveSummaryFromCited,
  readCitedMode,
  readCitedVersions,
} from "@/lib/lesson/cited-derive";
import { parseJsonPayload } from "@/lib/ai/lecture-intensive";
import { SUMMARY_KINDS, type LessonSummaries } from "@/lib/lesson/summaries";
import { parseFlashcards, readFlashcards } from "@/lib/lesson/flashcards";
import {
  MAX_LAB_ATTEMPT_CHARS,
  MAX_LAB_PROBLEM_CHARS,
  parseLabPlan,
  parseLabVerdict,
  readLabs,
  readLatestLab,
  upsertLabSession,
  type LabSession,
} from "@/lib/lesson/lab";
import { subjectMatches } from "@/lib/academics/subject-match";
import { extractOutline } from "@/lib/lesson/outline";
import { alignHeadingsToTranscript } from "@/lib/lesson/video-align";
import type { SavedLessonVideo } from "@/lib/lesson/video-server";
import {
  isExplanationMode,
  withExplanationVersion,
  readExplanationVersions,
  collectExplanationVersions,
  EXPLANATION_MODE_LABELS,
  MAX_EXPLANATION_VERSIONS,
  type ExplanationMode,
} from "@/lib/lesson/explanations";

/* ==========================================================================
   محتوى الدرس — توليد مرة واحدة + Citations (Phase 1.2 + 1.3)

   قبل هذا الراوت: كل فتحة للدرس وكل ضغطة تاب شرح كانت بتستهلك نداء AI
   جديد وتنزل من الذاكرة — نفس المحتوى بييتولّد كل مرة ويضاع.

   النموذج:
     1) GET  ?dayId= → حالة الربط (محاضرة الدرس) + قائمة محاضرات **نفس
        المادة** + اقتراح ذكي (عنوان ≈ اسم الدرس) + المحتوى المحفوظ.
     2) POST { dayId, action: "link", lectureId } → ربط/فصل المحاضرة
        بالدرس (`source_lecture_id`) + حفظ التفريغ في `transcript`
        (عشان ميتطلبش كل مرة).
     3) POST { dayId, mode, force, edu } →
        • الدرس **مربوط** ومقاطعه محفوظة: توليد الشرح **المبني على
          التفريغ** + ملخص، وكل claim بيتحقق منه السيرفر (اقتباس حرفي
          ≥ 0.6 من المقطع المشار إليه) قبل الحفظ.
        • غير مربوط: نفس تدفّق الأوضاع الأربعة (كاش → توليد → حفظ).

   الفلترة حسب المادة: `study_configs.subject` (اسم حرفي) بيتمطّط مع
   `workspace_subjects.name` + `university_subjects.name` + `lectures.subject`
   بعد التطبيع العربي — لأن ربط الدرس بالمنهج عندنا **اسم مش مفتاح**.

   الفشل أوقات كتير best-effort: migration ناقصة ما تكسرش الشاشة،
   وجدول مادة ناقص (مش مُنفَّذ) بيرجع قائمة فاضية مش خطأ.
   ========================================================================== */

export const maxDuration = 60;

/** أوضاع الشرح القديمة الأربعة — نفس تبويبات SmartContentViewer بالظبط (P1). */
const LEGACY_CONTENT_MODES = ["simple", "academic", "visual", "practical"] as const;
type LegacyContentMode = (typeof LEGACY_CONTENT_MODES)[number];

/**
 * أوضاع الشرح الثلاثة (P2 — مطلب «طريقة الشرح الجديدة»): شرح عام / تلخيصي /
 * تفصيلي — نفس محرك التوليد المخزّن، مفاتيحها جوّه `explanation` jsonb.
 */
type ContentMode = LegacyContentMode | ExplanationMode;

function isContentMode(value: unknown): value is ContentMode {
  return (
    (typeof value === "string" && (LEGACY_CONTENT_MODES as readonly string[]).includes(value)) ||
    isExplanationMode(value)
  );
}

/** شخصية الشرح — منقولة من الـ systemInstruction اللي كان بيبعته الكلاينت. */
const SYSTEM_PROMPT =
  "أنت مساعد تعليمي يكتب شرحاً واضحاً للمادة. " +
  "اكتب بالعربية الفصحى المبسطة، مع الإبقاء على المصطلحات التقنية والمعادلات والرموز بالإنجليزية زي ما هي متعارف عليها في المراجع العلمية " +
  "(متكتبش المصطلح العلمي بالعربي لو مفيش ترجمة شائعة ليه). " +
  "استخدم تنسيق Markdown بسيط: **نص عريض** للمصطلحات المهمة، وقوائم نقطية (- أو *) للنقاط، وعناوين فرعية لو الشرح طويل. " +
  "أسلوبك: هدوء واحترام ووضوح، بلا مبالغة ولا ألقاب حماسية ولا ختام تشجيعي ثابت. " +
  "خلي الشرح عملي ومفيد فعلاً مش سطحي، لكن من غير حشو زيادة عن اللزوم.";

/** خريطة مراحل التعليم → اسم عربي (نفس اللي في صفحة الدرس). */
const STAGE_LABELS: Record<string, string> = {
  PRIMARY: "ابتدائي",
  PREPARATORY: "إعدادي",
  SECONDARY: "ثانوي",
  BACCALAUREATE: "بكالوريا",
  UNIVERSITY: "جامعة",
};

function eduLineFrom(edu: unknown): string {
  if (!edu || typeof edu !== "object") return "";
  const record = edu as Record<string, unknown>;
  const parts: string[] = [];
  const stage = typeof record.stage === "string" ? record.stage.trim().slice(0, 40) : "";
  const grade = typeof record.grade === "string" ? record.grade.trim().slice(0, 60) : "";
  const track = typeof record.track === "string" ? record.track.trim().slice(0, 60) : "";
  const faculty = typeof record.faculty === "string" ? record.faculty.trim().slice(0, 60) : "";
  if (stage) parts.push(STAGE_LABELS[stage] ?? stage);
  if (grade) parts.push(grade);
  if (track) parts.push(track);
  if (faculty) parts.push(faculty);
  return parts.length ? `سياق الطالب: ${parts.join(" — ")}.` : "";
}

/** برومبت كل وضع — نفس نص الصفحة القديمة، مبني على السيرفر. */
const MODE_PROMPTS: Record<ContentMode, (topic: string, subject: string, eduLine: string) => string> = {
  simple: (topic, subject, eduLine) =>
    `اشرح مفهوم "${topic}" (جزء من مادة ${subject}) بشكل مبسط في نقاط واضحة، مع مثال بسيط يوضح الفكرة. ${eduLine} اكتب الشرح بالعربي، لكن حافظ على المصطلحات التقنية بالإنجليزية بين قوسين أو مباشرة (زي: Signal, System, Frequency) لأنها المصطلحات المستخدمة في المراجع والامتحانات.`,
  academic: (topic, subject, eduLine) =>
    `اشرح "${topic}" (جزء من مادة ${subject}) بأسلوب أكاديمي متعمق: عرّف المفهوم بدقة، اذكر القوانين/المعادلات الأساسية لو موجودة، وضّح الفروق بين الأنواع المختلفة لو فيه، واختم بملخص سريع. ${eduLine} اكتب بالعربي مع الإبقاء على المصطلحات التقنية والرموز بالإنجليزية زي المراجع الأكاديمية القياسية.`,
  visual: (topic, subject, eduLine) =>
    `اشرح "${topic}" (جزء من مادة ${subject}) بأسلوب مرئي وتخيلي: استخدم تشبيهات من الحياة اليومية، وارسم بالكلمات مخططات نصية بسيطة (زي رسم موجة أو رسم بياني في شكل نصي) توضح الفكرة بصريًا. ${eduLine} اكتب بالعربي مع إبقاء المصطلحات التقنية بالإنجليزية.`,
  practical: (topic, subject, eduLine) =>
    `اديني مثال تطبيقي حقيقي أو تمرين محلول خطوة بخطوة على "${topic}" (جزء من مادة ${subject})، زي مسألة أو سيناريو عملي بيوضح إزاي المفهوم بيتطبق فعليًا. ${eduLine} اكتب بالعربي مع إبقاء المصطلحات والمعادلات بالإنجليزية.`,

  /* ── أوضاع الشرح الثلاثة (P2): شرح عام / تلخيصي / تفصيلي ── */
  general: (topic, subject, eduLine) =>
    `اشرح "${topic}" (جزء من مادة ${subject}) شرحًا عامًا: فهم أساسي مختصر يجاوب "الموضوع ده إيه وليه مهم" في نقاط واضحة قليلة، من غير استرسال ولا تفاصيل جانبية. ${eduLine} اكتب بالعربي مع الإبقاء على المصطلحات التقنية بالإنجليزية.`,
  summary: (topic, subject, eduLine) =>
    `اعمل شرحًا تلخيصيًا لأهم النقاط في "${topic}" (جزء من مادة ${subject}) — مخصص للمراجعة السريعة: نقاط مركزة تغطي كل فكرة أساسية، كل نقطة سطر واحد واضح. ${eduLine} اكتب بالعربي مع الإبقاء على المصطلحات التقنية بالإنجليزية.`,
  detailed: (topic, subject, eduLine) =>
    `اشرح "${topic}" (جزء من مادة ${subject}) شرحًا تفصيليًا كاملًا بعمق: قسّم الشرح لعناوين فرعية (## )، عرّف كل مفهوم بدقة، اشرح ليه وفكّر خطوة بخطوة، اذكر أمثلة محلولة وأخطاء شائعة يقع فيها الطلبة، وختم بملخص للأفكار الأساسية. ${eduLine} اكتب بالعربي مع الإبقاء على المصطلحات التقنية والمعادلات بالإنجليزية.`,
};

/* ═════════════════════ مطابقة المواد (فلترة) ═════════════════════ */

/** اقتراح ذكي: عنوان المحاضرة ≈ موضوع الدرس بعد التطبيع. */
function titleMatchesLesson(title: string, topic: string): boolean {
  const t = normalizeForMatch(title);
  const p = normalizeForMatch(topic);
  if (!t || !p || p.length < 4) return false;
  return t === p || t.includes(p) || p.includes(t);
}

type LectureOption = {
  id: string;
  title: string;
  createdAt: string;
  durationSeconds: number | null;
  hasTranscript: boolean;
};

type LinkState = {
  link: { lectureId: string; lectureTitle: string } | null;
  lectures: LectureOption[];
  /** تسجيلات الطالب التانية من مواد مختلفة — مش بنخفيها، مش بنفلترها كليًا. */
  otherLectures: LectureOption[];
  suggestion: (LectureOption & { inList: boolean }) | null;
};

/** صف الدرس (مقيّد بالمالك). */
async function loadDay(supabase: SupabaseClient, userId: string, dayId: string) {
  const { data } = await supabase
    .from("study_days")
    .select("id, topic, description, config_id")
    .eq("id", dayId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

/** أقصى عدد ملفات مصادر مقترحة في الرد. */
const MAX_WORKSPACE_FILES = 12;

type WorkspaceFileOption = {
  id: string;
  originalName: string;
  fileType: string;
  createdAt: string;
};

/**
 * ملفات مساحة العمل المرتبطة بمادة الدرس (مرحلة P2 — مصادر الدرس):
 * جدول `files` عليه `subject` نصي — المطابقة بنفس منطق المحاضرات
 * (`subjectMatches` بعد التطبيع العربي). fail-open: جدول ناقص ⇒ قائمة فاضية.
 */
async function loadWorkspaceFiles(
  supabase: SupabaseClient,
  userId: string,
  subjectName: string
): Promise<WorkspaceFileOption[]> {
  if (!subjectName) return [];
  try {
    const { data } = await supabase
      .from("files")
      .select("id, original_name, file_type, subject, created_at")
      .eq("profile_id", userId)
      .order("created_at", { ascending: false })
      .limit(80);
    const matched = (data ?? []).filter(
      (row) => typeof row.subject === "string" && row.subject.trim() && subjectMatches(row.subject, subjectName)
    );
    return matched.slice(0, MAX_WORKSPACE_FILES).map((row) => ({
      id: row.id as string,
      originalName: typeof row.original_name === "string" ? row.original_name : "ملف",
      fileType: typeof row.file_type === "string" ? row.file_type : "file",
      createdAt: typeof row.created_at === "string" ? row.created_at : "",
    }));
  } catch {
    return [];
  }
}

async function loadSubject(supabase: SupabaseClient, configId: string): Promise<string> {
  const { data } = await supabase
    .from("study_configs")
    .select("subject")
    .eq("id", configId)
    .maybeSingle();
  return typeof data?.subject === "string" ? data.subject.trim().slice(0, 120) : "";
}

/**
 * حالة الربط: المحاضرة المرتبطة + محاضرات **نفس المادة** + اقتراح ذكي.
 *
 * كل الاستعلامات fail-open: جدول مادة ناقص (migration مش مُنفَّذ) ⇒
 * قائمة فاضية والطالب يشوف رسالة الحالة الفاضية — مش500.
 */
async function buildLinkState(
  supabase: SupabaseClient,
  userId: string,
  day: { id: string; topic: string | null; config_id: string },
  subjectName: string,
  linkedLectureId: string | null
): Promise<LinkState> {
  // ١) المحاضرة المرتبطة دلوقتي (لو فيه).
  let link: LinkState["link"] = null;
  if (linkedLectureId) {
    const { data: linked } = await supabase
      .from("lectures")
      .select("id, title")
      .eq("id", linkedLectureId)
      .eq("user_id", userId)
      .maybeSingle();
    if (linked) {
      link = {
        lectureId: linked.id,
        lectureTitle: typeof linked.title === "string" && linked.title ? linked.title : "محاضرة",
      };
    }
  }

  // ٢) معرّفات المواد اللي اسمها يطابق مادة الدرس (workspace + كتالوج الجامعة).
  const matchingIds = new Set<string>();
  if (subjectName) {
    try {
      const { data: workspaceSubjects } = await supabase
        .from("workspace_subjects")
        .select("id, name")
        .eq("user_id", userId)
        .limit(200);
      for (const row of workspaceSubjects ?? []) {
        if (typeof row.name === "string" && subjectMatches(row.name, subjectName)) {
          matchingIds.add(row.id as string);
        }
      }
    } catch {
      /* جدول غير موجود — نكمل */
    }
    try {
      const { data: catalogSubjects } = await supabase
        .from("university_subjects")
        .select("id, name")
        .limit(1000);
      for (const row of catalogSubjects ?? []) {
        if (typeof row.name === "string" && subjectMatches(row.name, subjectName)) {
          matchingIds.add(row.id as string);
        }
      }
    } catch {
      /* جدول غير موجود — نكمل */
    }
  }

  // ٣) كل محاضرات الطالب (خفيفة) + مجموعة اللي عندها تفريغ.
  const [allResult, withTranscriptResult] = await Promise.all([
    supabase
      .from("lectures")
      .select("id, title, subject, subject_id, created_at, duration_seconds")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("lectures").select("id").eq("user_id", userId).not("transcript_data", "is", null),
  ]);

  const transcriptIds = new Set<string>();
  for (const row of withTranscriptResult.data ?? []) transcriptIds.add(row.id as string);

  const toOption = (row: Record<string, unknown>): LectureOption => ({
    id: row.id as string,
    title: typeof row.title === "string" ? row.title : "محاضرة",
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    durationSeconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
    hasTranscript: transcriptIds.has(row.id as string),
  });

  const allRows = (allResult.data ?? []) as Record<string, unknown>[];

  // ٤) فلترة المادة: subject_id ∈ المواد المطابقة **أو** نص lectures.subject يطابق.
  const subjectMatched = allRows.filter((row) => {
    const subjectId = typeof row.subject_id === "string" ? row.subject_id : null;
    if (subjectId && matchingIds.has(subjectId)) return true;
    const textSubject = typeof row.subject === "string" ? row.subject : "";
    return Boolean(subjectName) && Boolean(textSubject) && subjectMatches(textSubject, subjectName);
  });

  const lectures = subjectMatched.map(toOption);

  // باقي تسجيلات الطالب (بره مادة الدرس) — متاحة للربط كمان، التفريغ الأول.
  // allRows مرتّبة created_at desc بالفعل، فبنحافظ على الترتيب داخل كل مجموعة.
  const matchedIds = new Set(subjectMatched.map((row) => row.id as string));
  const otherRows = allRows.filter((row) => !matchedIds.has(row.id as string));
  const otherLectures = [
    ...otherRows.filter((row) => transcriptIds.has(row.id as string)),
    ...otherRows.filter((row) => !transcriptIds.has(row.id as string)),
  ].map(toOption);

  // ٥) الاقتراح الذكي: أول من يطابق اسمه اسم الدرس — من قائمة المادة
  //    الأول، وإلا من كل المحاضرات (عنوان مطابق = المحاضرة الصحيحة حتى
  //    لو مالهاش مادة مسجّلة).
  const topic = typeof day.topic === "string" ? day.topic : "";
  const findSuggestion = (rows: Record<string, unknown>[]) =>
    rows.find((row) => typeof row.title === "string" && titleMatchesLesson(row.title, topic));

  const inListRow = findSuggestion(subjectMatched);
  const anyRow = inListRow ?? findSuggestion(allRows);
  const suggestion = anyRow
    ? { ...toOption(anyRow), inList: Boolean(inListRow) }
    : null;

  return { link, lectures, otherLectures, suggestion };
}

/** محتوى الصف المحفوظ — أوضاع markdown + الشرح الم citied + الملخص + الإصدارات. */
function readStoredContent(row: {
  explanation?: unknown;
  cited_explanation?: unknown;
  summary?: unknown;
} | null) {
  const modes: Record<string, string> = {};
  const explanation = row?.explanation;
  const rawExplanation =
    explanation && typeof explanation === "object" && !Array.isArray(explanation)
      ? (explanation as Record<string, unknown>)
      : null;
  if (rawExplanation) {
    // مفاتيح الأوضاع strings بس — قوائم الإصدارات (`<mode>__versions`) بتتقري منفصلة.
    for (const [key, value] of Object.entries(rawExplanation)) {
      if (typeof value === "string" && value.trim()) modes[key] = value;
    }
  }
  const cited =
    row?.cited_explanation &&
    typeof row.cited_explanation === "object" &&
    !Array.isArray(row.cited_explanation) &&
    Array.isArray((row.cited_explanation as { sections?: unknown }).sections)
      ? (row.cited_explanation as LessonCitedExplanation)
      : null;
  const summary = typeof row?.summary === "string" && row.summary.trim() ? row.summary : null;
  return { modes, cited, summary, rawExplanation };
}

/** رقم إصدار نص مخزّن لواحد من الأوضاع الثلاثة (١ = أول صياغة). */
function storedVersionOf(rawExplanation: Record<string, unknown> | null, mode: ContentMode): number | null {
  if (!isExplanationMode(mode) || !rawExplanation) return null;
  const hasCurrent = typeof rawExplanation[mode] === "string" && (rawExplanation[mode] as string).trim().length > 0;
  const versions = readExplanationVersions(rawExplanation, mode);
  if (!hasCurrent && versions.length === 0) return null;
  return versions.length + (hasCurrent ? 1 : 0);
}

/* ═════════════════ الفيديو المحفوظ (P3) ═════════════════ */

/** قراءة الفيديو المحفوظ — best-effort: أي شكل تالف أو رابط بره يوتيوب ⇒ null. */
function readSavedVideo(raw: unknown): SavedLessonVideo | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const videoId = typeof record.videoId === "string" ? record.videoId.trim() : "";
  const embedUrl = typeof record.embedUrl === "string" ? record.embedUrl : "";
  const watchUrl = typeof record.watchUrl === "string" ? record.watchUrl : "";
  if (!videoId || !embedUrl.startsWith("https://www.youtube-nocookie.com/embed/")) return null;
  if (!/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{5,25}$/.test(watchUrl)) return null;
  const thumbnail = typeof record.thumbnail === "string" && record.thumbnail.startsWith("https://") ? record.thumbnail : null;
  return {
    videoId: videoId.slice(0, 32),
    title: typeof record.title === "string" && record.title.trim() ? record.title.trim().slice(0, 300) : "فيديو الدرس",
    channel: typeof record.channel === "string" && record.channel.trim() ? record.channel.trim().slice(0, 120) : null,
    embedUrl,
    watchUrl,
    thumbnail,
    pickedAt: typeof record.pickedAt === "string" ? record.pickedAt : "",
  };
}

/* ═════════════════ الملخصات بأشكالها (P4) ═════════════════ */

/** أقصى حروف للملخص الواحد. */
const MAX_SUMMARY_KIND_CHARS = 1500;

/** قراءة الملخصات المخزّنة — best-effort: أى شكل تالف ⇒ null للمفتاح. */
function readStoredSummaries(raw: unknown): LessonSummaries | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const out: LessonSummaries = {};
  let any = false;
  for (const kind of SUMMARY_KINDS) {
    const value = record[kind];
    if (typeof value === "string" && value.trim()) {
      out[kind] = value.slice(0, MAX_SUMMARY_KIND_CHARS);
      any = true;
    }
  }
  return any ? out : null;
}

/* ═════════════════ النوتة المربوطة بالدرس (P4) ═════════════════ */

/** آخر نوتة مربوطة بالدرس — الشكل المخزَّن في `lesson_content.notes`. */
export type StoredLessonNote = {
  last: { title: string; body: string; source: string } | null;
  updatedAt: string | null;
};

/** قراءة النوتة المخزّنة — best-effort ⇒ شكل فاضي. */
function readStoredNote(raw: unknown): StoredLessonNote {
  const empty: StoredLessonNote = { last: null, updatedAt: null };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const record = raw as Record<string, unknown>;
  const lastRaw = record.last;
  if (!lastRaw || typeof lastRaw !== "object" || Array.isArray(lastRaw)) return empty;
  const last = lastRaw as Record<string, unknown>;
  if (typeof last.body !== "string" || !last.body.trim()) return empty;
  return {
    last: {
      title: typeof last.title === "string" ? last.title.slice(0, 200) : "",
      body: last.body.slice(0, MAX_NOTE_DB_CHARS),
      source: typeof last.source === "string" ? last.source.slice(0, 120) : "",
    },
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
  };
}

/** أقصى حروف لنص النوتة المخزَّنة في الداتابيز (نفس فلسفة MAX_NOTE_DRAFT_CHARS). */
const MAX_NOTE_DB_CHARS = 20_000;

/* ═════════════════ حوّل لـ Flashcard/MCQ (P4/P5) ═════════════════ */

/** أنواع التحويل المدعومة — Mind Map في مرحلة لاحقة. */
const CONVERSION_KINDS = ["flashcard", "mcq"] as const;
type ConversionKind = (typeof CONVERSION_KINDS)[number];

function isConversionKind(value: unknown): value is ConversionKind {
  return typeof value === "string" && (CONVERSION_KINDS as readonly string[]).includes(value);
}

/** أقصى حروف لنص المصدر المُحوَّل. */
const MAX_CONVERSION_SOURCE_CHARS = 6_000;

/** كاش التحويلات in-memory — «ولّد مرة» لنفس النص (التخزين النهائي في النوتة نفسها). */
const CONVERSION_CACHE = new Map<string, { body: string; ts: number }>();
const CONVERSION_CACHE_TTL_MS = 1000 * 60 * 30;

const CONVERSION_PROMPTS: Record<ConversionKind, (topic: string) => string> = {
  flashcard: (topic) =>
    `حوّل محتوى الدرس «${topic}» الآتي **فلاش كارد واحدة** (أو اتنين لو المحتوى فيه فكرتين مستقلتين) بصيغة نصية بالظبط دي، بالعربي والمصطلحات التقنية بالإنجليزية، وارجع النص فقط بدون أي مقدمات:\n\n🃏 فلاش كارد\n\n**السؤال:** سؤال قصير واضح\n\n**الإجابة:** إجابة دقيقة من المحتوى نفسه`,
  mcq: (topic) =>
    `حوّل محتوى الدرس «${topic}» الآتي **سؤال اختياري واحد (MCQ)** بصيغة نصية بالظبط دي، بالعربي والمصطلحات التقنية بالإنجليزية، وارجع النص فقط بدون أي مقدمات:\n\n❓ سؤال اختياري\n\n**السؤال:** سؤال قصير واضح\n\n- أ) خيار\n- ب) خيار\n- ج) خيار\n- د) خيار\n\n**الإجابة الصحيحة:** الحرف) الخيار — مع سطر شرح قصير من المحتوى`,
};

/* ═════════════════════════ الراوت ═════════════════════════ */

type LessonContentBody = {
  dayId?: unknown;
  mode?: unknown;
  force?: unknown;
  edu?: unknown;
  action?: unknown;
  lectureId?: unknown;
  video?: unknown;
  kind?: unknown;
  text?: unknown;
  note?: unknown;
  problem?: unknown;
  sessionId?: unknown;
  stepIndex?: unknown;
  attempt?: unknown;
};

function badRequest(message: string, code: string) {
  return NextResponse.json({ error: { message, code } }, { status: 400 });
}

export async function GET(req: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    // قراءة بس (من غير AI) — حد سخيف عالي مش مهم.
    const limited = await checkRateLimit(`lesson-content:read:${user.id}`, 60, 60_000, "message");
    if (limited) return limited;

    const url = new URL(req.url);
    const dayId = clampText(url.searchParams.get("dayId") ?? "", 64).trim();
    if (!dayId) return badRequest("مفيش معرّف درس.", "BAD_DAY");

    const day = await loadDay(supabase, user.id, dayId);
    if (!day) {
      return NextResponse.json({ error: { message: "الدرس غير موجود.", code: "NOT_FOUND" } }, { status: 404 });
    }

    const subjectName = await loadSubject(supabase, day.config_id);

    const { data: row } = await supabase
      .from("lesson_content")
      .select("explanation, cited_explanation, summary, source_lecture_id")
      .eq("user_id", user.id)
      .eq("day_id", dayId)
      .maybeSingle();

    const linkedLectureId =
      typeof row?.source_lecture_id === "string" && row.source_lecture_id ? row.source_lecture_id : null;

    const linkState = await buildLinkState(supabase, user.id, day, subjectName, linkedLectureId);

    const storedContent = readStoredContent(row);
    // مصادر الدرس (P2): ملفات مساحة العمل المرتبطة بمادة الدرس.
    const workspaceFiles = await loadWorkspaceFiles(supabase, user.id, subjectName);
    // الفيديو المختار المحفوظ (P3) — يوفّر البحث في الجلسات الجاية.
    const savedVideo = readSavedVideo(row?.video);
    // محاذاة الأقسام بتوقيت التفريغ (P3): headings من الشرح المخزّن + مقاطع transcript
    // ⇒ videoT لكل قسم (لروابط &t= — بدون enablejsapi). مفيش تفريغ ⇒ كل القيم null.
    const transcriptSegments = row?.transcript ? extractSegments(row.transcript) : [];
    const outlineSections = extractOutline({ cited: storedContent.cited, modes: storedContent.modes });
    const videoTByHeading = transcriptSegments.length
      ? alignHeadingsToTranscript(outlineSections.map((s) => s.heading), transcriptSegments)
      : {};
    // الملخصات بأشكالها + النوتة المربوطة بالدرس + الفلاش كاردز (P4/P5).
    const storedSummaries = readStoredSummaries(row?.summaries);
    const storedNote = readStoredNote(row?.notes);
    const storedFlashcards = readFlashcards(row?.questions);
    // آخر جلسة مختبر حل مشكلات (P6).
    const storedLab = readLatestLab(row?.labs);
    // الأوضاع الم citied فوق التفريغ (general/detailed) — كائنات جوّه explanation jsonb.
    const citedModes =
      storedContent.rawExplanation
        ? {
            general: readCitedMode(storedContent.rawExplanation, "general"),
            detailed: readCitedMode(storedContent.rawExplanation, "detailed"),
          }
        : { general: null, detailed: null };
    return NextResponse.json({
      ok: true,
      ...linkState,
      content: storedContent,
      citedModes,
      workspaceFiles,
      savedVideo,
      videoTByHeading,
      summaries: storedSummaries,
      notes: storedNote,
      flashcards: storedFlashcards,
      lab: storedLab,
      // إصدارات الأوضاع الثلاثة (شرح عام/تلخيصي/تفصيلي) — لعرض الإصدارات السابقة.
      explanationVersions: collectExplanationVersions(storedContent.rawExplanation),
      // إصدارات الأوضاع الم citied — بتترجع كنص للمعاينة.
      citedVersions: collectCitedVersions(storedContent.rawExplanation),
    });
  } catch (error) {
    console.error("lesson-content GET error:", error);
    return NextResponse.json(
      { error: { message: "حصل خطأ غير متوقع.", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    // ١) تسجيل دخول إلزامي — الراوت بيولّد محتوى من حساب الطالب.
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    const body = (await req.json().catch(() => null)) as LessonContentBody | null;
    if (!body || typeof body !== "object") return badRequest("البيانات المبعوتة غير صالحة.", "BAD_BODY");

    const dayId = typeof body.dayId === "string" ? clampText(body.dayId, 64).trim() : "";
    if (!dayId) return badRequest("مفيش معرّف درس.", "BAD_DAY");

    const day = await loadDay(supabase, user.id, dayId);
    if (!day) {
      return NextResponse.json({ error: { message: "الدرس غير موجود.", code: "NOT_FOUND" } }, { status: 404 });
    }

    /* ── فعل الربط/الفصل (الخطوة 3 — الربط) ── */
    if (body.action === "link") {
      const limited = await checkRateLimit(`lesson-content-link:${user.id}`, 30, 60_000, "message");
      if (limited) return limited;

      const lectureId =
        typeof body.lectureId === "string" && body.lectureId.trim()
          ? clampText(body.lectureId, 64).trim()
          : null;

      const subjectName = await loadSubject(supabase, day.config_id);

      if (lectureId) {
        // المحاضرة لازم تكون بتاع الطالب + عندها تفريغ (من غيره مفيش citations).
        const { data: lecture } = await supabase
          .from("lectures")
          .select("id, title, transcript_data")
          .eq("id", lectureId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!lecture) {
          return NextResponse.json(
            { error: { message: "المحاضرة غير موجودة.", code: "NOT_FOUND" } },
            { status: 404 }
          );
        }

        const segments = extractSegments(lecture.transcript_data);
        if (segments.length === 0) {
          return badRequest("المحاضرة دي مالهاش تفريغ — ارفع ملفًا صوتيًا وفرّغه الأول.", "NO_TRANSCRIPT");
        }

        const now = new Date().toISOString();
        const { error: upsertError } = await supabase.from("lesson_content").upsert(
          {
            user_id: user.id,
            day_id: dayId,
            source_lecture_id: lectureId,
            // التفريغ بيتحفظ جوه الصف — ميتطلبش كل مرة من lectures.
            transcript: { segments },
            // محتوى قديم من المحاضرة السابقة بينمسح (يتولّد من الجديد).
            cited_explanation: null,
            summary: null,
            generated_at: now,
            updated_at: now,
          },
          { onConflict: "user_id,day_id" }
        );
        if (upsertError) {
          console.warn("lesson-content: حفظ الربط فشل (migration ناقصة؟):", upsertError.message);
          return NextResponse.json(
            { error: { message: "مقدرنش نحفظ الربط. جرّب تاني.", code: "SAVE_FAILED" } },
            { status: 500 }
          );
        }
      } else {
        // فصل: المصدر والتفريغ والمحتوى الم citied بيتمسحوا — الأوضاع تفضل.
        const { error: updateError } = await supabase
          .from("lesson_content")
          .update({
            source_lecture_id: null,
            transcript: null,
            cited_explanation: null,
            summary: null,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .eq("day_id", dayId);
        if (updateError) {
          console.warn("lesson-content: الفصل فشل:", updateError.message);
          return NextResponse.json(
            { error: { message: "مقدرنش نفصل المحاضرة. جرّب تاني.", code: "SAVE_FAILED" } },
            { status: 500 }
          );
        }
      }

      const { data: row } = await supabase
        .from("lesson_content")
        .select("source_lecture_id")
        .eq("user_id", user.id)
        .eq("day_id", dayId)
        .maybeSingle();
      const linkedId =
        typeof row?.source_lecture_id === "string" && row.source_lecture_id ? row.source_lecture_id : null;

      const linkState = await buildLinkState(supabase, user.id, day, subjectName, linkedId);
      return NextResponse.json({ ok: true, ...linkState });
    }

    /* ── حفظ الفيديو المختار (P3 — «ولّد مرة وخزّن»: يوفّر البحث في الجلسات الجاية) ── */
    if (body.action === "set_video") {
      const limited = await checkRateLimit(`lesson-content-video:${user.id}`, 30, 60_000, "message");
      if (limited) return limited;

      const saved = readSavedVideo(body.video);
      if (!saved) {
        return badRequest("بيانات الفيديو غير صالحة (لازم رابط يوتيوب صحيح).", "BAD_VIDEO");
      }
      const { error: saveError } = await supabase
        .from("lesson_content")
        .upsert(
          {
            user_id: user.id,
            day_id: dayId,
            video: saved,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,day_id" }
        );
      if (saveError) {
        console.warn("lesson-content: حفظ الفيديو فشل (migration ناقصة؟):", saveError.message);
        return NextResponse.json(
          { error: { message: "مقدرنش نحفظ الفيديو. جرّب تاني.", code: "SAVE_FAILED" } },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, savedVideo: saved });
    }

    /* ── التوليد (كاش → توليد → حفظ) ── */
    const limited = await checkRateLimit(`lesson-content:${user.id}`, 20, 60_000, "message");
    if (limited) return limited;

    const mode: ContentMode = isContentMode(body.mode) ? body.mode : "simple";
    const force = body.force === true;
    const subjectName = await loadSubject(supabase, day.config_id);
    const topic = typeof day.topic === "string" && day.topic.trim() ? day.topic.trim().slice(0, 200) : "الدرس";
    const description = typeof day.description === "string" ? day.description : "";

    const { data: row } = await supabase
      .from("lesson_content")
      .select("explanation, cited_explanation, summary, source_lecture_id, transcript, generated_at, video, resume, notes, summaries, questions, labs")
      .eq("user_id", user.id)
      .eq("day_id", dayId)
      .maybeSingle();

    const stored = readStoredContent(row);
    const linkedLectureId =
      typeof row?.source_lecture_id === "string" && row.source_lecture_id ? row.source_lecture_id : null;

    const usage = resolveUsageRequestContext(req, user.id);

    /* ── الملخصات بأشكالها الأربعة (P4 — نداء AI واحد مجمّع، تخزين مرة) ── */
    if (body.action === "summaries") {
      const limited = await checkRateLimit(`lesson-content-summaries:${user.id}`, 15, 60_000, "message");
      if (limited) return limited;

      const forceSummaries = body.force === true;
      const existing = readStoredSummaries(row?.summaries);
      if (existing && !forceSummaries && existing.quick && existing.detailed) {
        return NextResponse.json({ ok: true, cached: true, summaries: existing });
      }

      // مصدر التلخيص: الشرح الم citied الأول (المصدر الأساسي) — وإلا الأوضاع المخزّنة.
      const sourceText = (
        stored.cited
          ? citedToText(stored.cited)
          : Object.values(stored.modes).filter((v) => typeof v === "string" && v.trim()).join("\n\n")
      ).slice(0, 12_000);
      if (!sourceText.trim()) {
        return badRequest("مفيش شرح مخزّن للتلخيص — ولّد الشرح الأول.", "NO_SOURCE");
      }

      let completion;
      try {
        completion = await aiRouter.completeChat("chat", {
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content:
                `اكتب ٤ ملخصات لمحتوى الدرس «${topic}» (مادة ${subjectName}) الآتي. ارجع JSON فقط بالشكل ده بلا أي شرح:\n` +
                `{ "quick": "ملخص سريع في ٣-٥ نقاط واضحة", "detailed": "ملخص تفصيلي منظم بعناوين فرعية (##)", "academic": "صياغة أكاديمية دقيقة بالتعريفات والمصطلحات", "exam_revision": "أهم النقاط اللي بتتكرر في الامتحانات — مراجعة ليلة الامتحان" }\n` +
                `كل ملخص بالعربي والمصطلحات التقنية بالإنجليزية، وكل واحد ≤ ${MAX_SUMMARY_KIND_CHARS} حرف.\n\nمحتوى الدرس:\n${sourceText}`,
            },
          ],
          temperature: 0.3,
          maxTokens: 3000,
          usage,
        });
      } catch (error) {
        if (!(error instanceof AiProviderError)) throw error;
        const isRate = error.status === 429;
        return NextResponse.json(
          { error: { message: isRate ? "الخدمة مشغولة دلوقتي. حاول تاني بعد شوية." : "حصل خطأ أثناء الاتصال بالمساعد. حاول تاني.", code: isRate ? "PROVIDER_RATE_LIMIT" : "PROVIDER_ERROR" } },
          { status: isRate ? 429 : 502 }
        );
      }

      let parsed: unknown;
      try {
        parsed = parseJsonPayload(completion.content ?? "");
      } catch {
        parsed = null;
      }
      const summaries: LessonSummaries = {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        for (const kind of SUMMARY_KINDS) {
          const value = record[kind];
          if (typeof value === "string" && value.trim()) summaries[kind] = value.trim().slice(0, MAX_SUMMARY_KIND_CHARS);
        }
      }
      if (!summaries.quick || !summaries.detailed) {
        return NextResponse.json(
          { error: { message: "الرد جه بدون ملخصات صالحة. جرّب تاني.", code: "SUMMARIES_INVALID" } },
          { status: 502 }
        );
      }

      void recordAiOperation(supabase, {
        userId: user.id,
        provider: completion.provider,
        model: completion.model,
        taskType: "chat",
        status: "completed",
        usage: completion.usage,
        contentLength: (completion.content ?? "").length,
      });

      const saved = await (async () => {
        try {
          const { error: upsertError } = await supabase
            .from("lesson_content")
            .upsert(
              { user_id: user.id, day_id: dayId, summaries, updated_at: new Date().toISOString() },
              { onConflict: "user_id,day_id" }
            );
          if (upsertError) {
            console.warn("lesson-content: حفظ الملخصات فشل (migration ناقصة؟):", upsertError.message);
            return false;
          }
          return true;
        } catch (saveError) {
          console.warn("lesson-content: حفظ الملخصات فشل:", saveError);
          return false;
        }
      })();

      return NextResponse.json({ ok: true, cached: false, saved, summaries });
    }

    /* ── النوتة المربوطة بالدرس (P4 — بديل دائم لـ localStorage) ── */
    if (body.action === "save_note") {
      const limited = await checkRateLimit(`lesson-content-note:${user.id}`, 60, 60_000, "message");
      if (limited) return limited;

      const now = new Date().toISOString();
      let noteToStore: StoredLessonNote;
      if (body.note === null || body.note === undefined) {
        // undo — نمسح الربط المخزَّن.
        noteToStore = { last: null, updatedAt: now };
      } else if (body.note && typeof body.note === "object" && !Array.isArray(body.note)) {
        const noteRecord = body.note as Record<string, unknown>;
        const noteBody = typeof noteRecord.body === "string" ? clampText(noteRecord.body, MAX_NOTE_DB_CHARS).trim() : "";
        if (!noteBody) return badRequest("نص النوتة فاضي.", "BAD_NOTE");
        noteToStore = {
          last: {
            title: typeof noteRecord.title === "string" ? clampText(noteRecord.title, 200).trim() : "",
            body: noteBody,
            source: typeof noteRecord.source === "string" ? clampText(noteRecord.source, 120).trim() : "",
          },
          updatedAt: now,
        };
      } else {
        return badRequest("بيانات النوتة غير صالحة.", "BAD_NOTE");
      }

      const { error: saveError } = await supabase
        .from("lesson_content")
        .upsert({ user_id: user.id, day_id: dayId, notes: noteToStore, updated_at: now }, { onConflict: "user_id,day_id" });
      if (saveError) {
        console.warn("lesson-content: حفظ النوتة فشل (migration ناقصة؟):", saveError.message);
        return NextResponse.json(
          { error: { message: "مقدرنش نحفظ النوتة. جرّب تاني.", code: "SAVE_FAILED" } },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, notes: noteToStore });
    }

    /* ── حوّل جزء لفلاش كارد/MCQ (P4 — نص منسق يدخل النوتة عبر الـ postMessage الموجود) ── */
    if (body.action === "convert_note") {
      const limited = await checkRateLimit(`lesson-content-convert:${user.id}`, 20, 60_000, "message");
      if (limited) return limited;

      if (!isConversionKind(body.kind)) return badRequest("نوع التحويل غير معروف.", "BAD_KIND");
      const kind: ConversionKind = body.kind;
      const sourceText = typeof body.text === "string" ? clampText(body.text, MAX_CONVERSION_SOURCE_CHARS).trim() : "";
      if (!sourceText) return badRequest("مفيش نص للتحويل.", "NO_SOURCE");

      // «ولّد مرة»: نفس النص + نفس النوع ⇒ نفس الناتج من الكاش (بدون نداء).
      const conversionCacheKey = `${kind}|${sourceText.length}|${sourceText.slice(0, 160)}`;
      const cachedConversion = CONVERSION_CACHE.get(conversionCacheKey);
      if (cachedConversion && Date.now() - cachedConversion.ts < CONVERSION_CACHE_TTL_MS) {
        return NextResponse.json({ ok: true, cached: true, body: cachedConversion.body });
      }

      let completion;
      try {
        completion = await aiRouter.completeChat("chat", {
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `${CONVERSION_PROMPTS[kind](topic)}\n\nالمحتوى:\n${sourceText}` },
          ],
          temperature: 0.3,
          maxTokens: 1200,
          usage,
        });
      } catch (error) {
        if (!(error instanceof AiProviderError)) throw error;
        const isRate = error.status === 429;
        return NextResponse.json(
          { error: { message: isRate ? "الخدمة مشغولة دلوقتي. حاول تاني بعد شوية." : "حصل خطأ أثناء الاتصال بالمساعد. حاول تاني.", code: isRate ? "PROVIDER_RATE_LIMIT" : "PROVIDER_ERROR" } },
          { status: isRate ? 429 : 502 }
        );
      }

      const converted = (completion.content ?? "").trim().slice(0, 4000);
      if (!converted) {
        return NextResponse.json(
          { error: { message: "الموديل رجع بدون محتوى. حاول تاني.", code: "EMPTY_COMPLETION" } },
          { status: 502 }
        );
      }

      void recordAiOperation(supabase, {
        userId: user.id,
        provider: completion.provider,
        model: completion.model,
        taskType: "chat",
        status: "completed",
        usage: completion.usage,
        contentLength: converted.length,
      });

      CONVERSION_CACHE.set(conversionCacheKey, { body: converted, ts: Date.now() });
      return NextResponse.json({ ok: true, cached: false, body: converted });
    }

    /* ── فلاش كاردز من الشرح المخزّن (P5 — نداء AI واحد، تخزين مرة في questions jsonb) ── */
    if (body.action === "flashcards") {
      const limited = await checkRateLimit(`lesson-content-flashcards:${user.id}`, 15, 60_000, "message");
      if (limited) return limited;

      const forceFlash = body.force === true;
      const existingCards = readFlashcards(row?.questions);
      if (existingCards.length > 0 && !forceFlash) {
        return NextResponse.json({ ok: true, cached: true, flashcards: existingCards });
      }

      const sourceText = (
        stored.cited
          ? citedToText(stored.cited)
          : Object.values(stored.modes).filter((v) => typeof v === "string" && v.trim()).join("\n\n")
      ).slice(0, 12_000);
      if (!sourceText.trim()) {
        return badRequest("مفيش شرح مخزّن — ولّد الشرح الأول.", "NO_SOURCE");
      }

      let completion;
      try {
        completion = await aiRouter.completeChat("chat", {
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content:
                `اعمل من محتوى الدرس «${topic}» (مادة ${subjectName}) الآتي **فلاش كاردز للمراجعة**: من ٦ لـ ١٠ كروت، كل كارت فكرة واحدة مستقلة. ` +
                `ارجع JSON مصفوفة فقط بالشكل ده بلا أي شرح: [{"front": "سؤال/وجه الكارت", "back": "الإجابة/ظهر الكارت"}] — بالعربي والمصطلحات التقنية بالإنجليزية، والإجابات من المحتوى نفسه.\n\nمحتوى الدرس:\n${sourceText}`,
            },
          ],
          temperature: 0.4,
          maxTokens: 2500,
          usage,
        });
      } catch (error) {
        if (!(error instanceof AiProviderError)) throw error;
        const isRate = error.status === 429;
        return NextResponse.json(
          { error: { message: isRate ? "الخدمة مشغولة دلوقتي. حاول تاني بعد شوية." : "حصل خطأ أثناء الاتصال بالمساعد. حاول تاني.", code: isRate ? "PROVIDER_RATE_LIMIT" : "PROVIDER_ERROR" } },
          { status: isRate ? 429 : 502 }
        );
      }

      const cards = parseFlashcards(completion.content ?? "");
      if (!cards) {
        return NextResponse.json(
          { error: { message: "الرد جه بدون فلاش كاردز صالحة. جرّب تاني.", code: "FLASHCARDS_INVALID" } },
          { status: 502 }
        );
      }

      void recordAiOperation(supabase, {
        userId: user.id,
        provider: completion.provider,
        model: completion.model,
        taskType: "chat",
        status: "completed",
        usage: completion.usage,
        contentLength: (completion.content ?? "").length,
      });

      let saved = false;
      try {
        const now = new Date().toISOString();
        const { error: upsertError } = await supabase
          .from("lesson_content")
          .upsert(
            { user_id: user.id, day_id: dayId, questions: { flashcards: cards, generatedAt: now }, updated_at: now },
            { onConflict: "user_id,day_id" }
          );
        if (upsertError) {
          console.warn("lesson-content: حفظ الفلاش كاردز فشل (migration ناقصة؟):", upsertError.message);
        } else {
          saved = true;
        }
      } catch (saveError) {
        console.warn("lesson-content: حفظ الفلاش كاردز فشل:", saveError);
      }

      return NextResponse.json({ ok: true, cached: false, saved, flashcards: cards });
    }

    /* ── مختبر حل المشكلات (P6 — حل تدريجي بتوجيه AI، بدون محاكيات) ── */
    if (body.action === "problem_lab") {
      const labMode = body.mode === "step" ? "step" : "plan";

      const { data: labRow } = await supabase
        .from("lesson_content")
        .select("labs")
        .eq("user_id", user.id)
        .eq("day_id", dayId)
        .maybeSingle();
      const storedLabs = labRow?.labs ?? null;

      /* خطة جديدة: تقسيم المسألة لخطوات (توجيه من غير إجابات نهائية). */
      if (labMode === "plan") {
        const limited = await checkRateLimit(`lesson-content-lab:${user.id}`, 15, 60_000, "message");
        if (limited) return limited;

        const problem = typeof body.problem === "string" ? clampText(body.problem, MAX_LAB_PROBLEM_CHARS).trim() : "";
        if (!problem) return badRequest("اكتب المسألة الأول.", "NO_PROBLEM");

        let completion;
        try {
          completion = await aiRouter.completeChat("chat", {
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content:
                  `المسألة دي لطالب بيدرس «${topic}» (مادة ${subjectName}):${eduLineFrom(body.edu)}\n${problem}\n\n` +
                  `المطلوب: حل توجيهي **خطوة بخطوة** — مش الحل النهائي. ارجع JSON فقط بالشكل ده بلا أي شرح:\n` +
                  `{ "understanding": "فهم المسألة في سطرين — إيه المعطيات والمطلوب", "steps": [{ "title": "عنوان الخطوة", "guidance": "توجيه يخلي الطالب يعرف يعمل إيه في الخطوة دي — من غير ما تحلها له" }] } ` +
                  `— من ٣ لـ ٦ خطوات مرتّبة، بالعربي والمصطلحات والمعادلات بالإنجليزية.`,
              },
            ],
            temperature: 0.3,
            maxTokens: 1800,
            usage,
          });
        } catch (error) {
          if (!(error instanceof AiProviderError)) throw error;
          const isRate = error.status === 429;
          return NextResponse.json(
            { error: { message: isRate ? "الخدمة مشغولة دلوقتي. حاول تاني بعد شوية." : "حصل خطأ أثناء الاتصال بالمساعد. حاول تاني.", code: isRate ? "PROVIDER_RATE_LIMIT" : "PROVIDER_ERROR" } },
            { status: isRate ? 429 : 502 }
          );
        }

        const plan = parseLabPlan(completion.content ?? "");
        if (!plan) {
          return NextResponse.json(
            { error: { message: "الرد جه بدون خطة حل صالحة. جرّب تاني.", code: "LAB_PLAN_INVALID" } },
            { status: 502 }
          );
        }

        void recordAiOperation(supabase, {
          userId: user.id,
          provider: completion.provider,
          model: completion.model,
          taskType: "chat",
          status: "completed",
          usage: completion.usage,
          contentLength: (completion.content ?? "").length,
        });

        const now = new Date().toISOString();
        const session: LabSession = {
          id: `lab-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
          problem,
          understanding: plan.understanding,
          steps: plan.steps,
          attempts: [],
          createdAt: now,
          updatedAt: now,
        };
        const labs = upsertLabSession(storedLabs, session);
        try {
          await supabase
            .from("lesson_content")
            .upsert({ user_id: user.id, day_id: dayId, labs, updated_at: now }, { onConflict: "user_id,day_id" });
        } catch (saveError) {
          console.warn("lesson-content: حفظ جلسة المختبر فشل (best-effort):", saveError);
        }
        return NextResponse.json({ ok: true, session });
      }

      /* تقييم محاولة خطوة — الجلسة لازم تكون مخزّنة. */
      const limited = await checkRateLimit(`lesson-content-lab-step:${user.id}`, 40, 60_000, "message");
      if (limited) return limited;

      const sessionId = typeof body.sessionId === "string" ? clampText(body.sessionId, 64).trim() : "";
      const stepIndex = typeof body.stepIndex === "number" ? body.stepIndex : -1;
      const attempt = typeof body.attempt === "string" ? clampText(body.attempt, MAX_LAB_ATTEMPT_CHARS).trim() : "";
      if (!sessionId || stepIndex < 0 || !attempt) {
        return badRequest("بيانات الخطوة ناقصة.", "BAD_STEP");
      }

      const session = readLabs(storedLabs).find((lab) => lab.id === sessionId);
      if (!session || !session.steps[stepIndex]) {
        return badRequest("جلسة المختبر مش موجودة — ابدأ جلسة جديدة.", "SESSION_NOT_FOUND");
      }
      const step = session.steps[stepIndex];

      let completion;
      try {
        completion = await aiRouter.completeChat("chat", {
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content:
                `المسألة: ${session.problem}\nفهم المسألة: ${session.understanding}\n\n` +
                `الخطوة (${stepIndex + 1} من ${session.steps.length}): ${step.title}\nتوجيه الخطوة: ${step.guidance}\n\n` +
                `محاولة الطالب:\n${attempt}\n\n` +
                `قيّم المحاولة **توجيهيًا** (مش بحلها له). ارجع JSON فقط بالشكل ده:\n` +
                `{ "verdict": "correct" | "partial" | "wrong", "feedback": "فيدباك محدد: إيه الصح، وإيه الناقص، وإيه الخطوة الجاية — بالعربي والمصطلحات بالإنجليزية" }`,
            },
          ],
          temperature: 0.2,
          maxTokens: 900,
          usage,
        });
      } catch (error) {
        if (!(error instanceof AiProviderError)) throw error;
        const isRate = error.status === 429;
        return NextResponse.json(
          { error: { message: isRate ? "الخدمة مشغولة دلوقتي. حاول تاني بعد شوية." : "حصل خطأ أثناء الاتصال بالمساعد. حاول تاني.", code: isRate ? "PROVIDER_RATE_LIMIT" : "PROVIDER_ERROR" } },
          { status: isRate ? 429 : 502 }
        );
      }

      const verdict = parseLabVerdict(completion.content ?? "");
      if (!verdict) {
        return NextResponse.json(
          { error: { message: "تقييم الخطوة جه بشكل غير صالح. جرّب تاني.", code: "LAB_VERDICT_INVALID" } },
          { status: 502 }
        );
      }

      void recordAiOperation(supabase, {
        userId: user.id,
        provider: completion.provider,
        model: completion.model,
        taskType: "chat",
        status: "completed",
        usage: completion.usage,
        contentLength: (completion.content ?? "").length,
      });

      const now = new Date().toISOString();
      const updatedSession: LabSession = {
        ...session,
        attempts: [
          ...session.attempts.filter((a) => a.stepIndex !== stepIndex),
          { stepIndex, attempt, verdict: verdict.verdict, feedback: verdict.feedback, at: now },
        ].sort((a, b) => a.stepIndex - b.stepIndex),
        updatedAt: now,
      };
      const labs = upsertLabSession(storedLabs, updatedSession);
      try {
        await supabase
          .from("lesson_content")
          .upsert({ user_id: user.id, day_id: dayId, labs, updated_at: now }, { onConflict: "user_id,day_id" });
      } catch (saveError) {
        console.warn("lesson-content: تحديث جلسة المختبر فشل (best-effort):", saveError);
      }
      return NextResponse.json({ ok: true, session: updatedSession });
    }

    /* ── المسار المربوط: شرح + ملخص مبنيّين على التفريغ ── */
    if (linkedLectureId) {
      let segments: TimedSegment[] = row?.transcript ? extractSegments(row.transcript) : [];
      let transcriptFromLecture = false;

      // التفريغ مش محفوظ في الصف (حالة قديمة) → نجيبه من المحاضرة مرة ونحفظه.
      if (segments.length === 0) {
        const { data: lecture } = await supabase
          .from("lectures")
          .select("transcript_data")
          .eq("id", linkedLectureId)
          .eq("user_id", user.id)
          .maybeSingle();
        segments = extractSegments(lecture?.transcript_data);
        transcriptFromLecture = segments.length > 0;
      }

      if (segments.length > 0) {
        /** حفظ best-effort — merge جوه الصف (فشل الحفظ ما يكسرش الرد). */
        const saveLessonContent = async (patch: Record<string, unknown>): Promise<boolean> => {
          const now = new Date().toISOString();
          try {
            const { error: upsertError } = await supabase.from("lesson_content").upsert(
              { user_id: user.id, day_id: dayId, ...patch, updated_at: now },
              { onConflict: "user_id,day_id" }
            );
            if (upsertError) {
              console.warn("lesson-content: حفظ فشل (migration ناقصة؟):", upsertError.message);
              return false;
            }
            return true;
          } catch (saveError) {
            console.warn("lesson-content: حفظ فشل:", saveError);
            return false;
          }
        };

        /** رد خطأ موحّد لأخطاء مزوّد الـ AI. */
        const providerError = (error: AiProviderError) => {
          const isRate = error.status === 429;
          const isUnavailable = error.status === 503;
          return NextResponse.json(
            {
              error: {
                message: isRate
                  ? "الخدمة مشغولة دلوقتي. حاول تاني بعد شوية."
                  : "حصل خطأ أثناء الاتصال بالمساعد. حاول تاني.",
                code: isRate ? "PROVIDER_RATE_LIMIT" : isUnavailable ? "PROVIDER_UNAVAILABLE" : "PROVIDER_ERROR",
              },
            },
            { status: isUnavailable ? 503 : isRate ? 429 : 502 }
          );
        };

        /** رد خطأ Citations المرفوضة. */
        const citedInvalid = () =>
          NextResponse.json(
            {
              error: {
                message:
                  parsedReason === "BAD_HONESTY"
                    ? "الرد جه بأكثر من ثلث المراجع مش متطابقة مع التفريغ. جرّب تاني."
                    : "الرد جه بدون مراجع صالحة من التفريغ. جرّب تاني.",
                code: "CITED_INVALID",
              },
            },
            { status: 502 }
          );
        let parsedReason: string | null = null;

        /**
         * ensureCited — قراءة/توليد الشرح **الأساسي** المبني على التفريغ.
         * المصدر الأساسي للدرس المربوط — الأوضاع الثلاثة بتشتغل فوقه.
         */
        const ensureCited = async (
          forceFlag: boolean
        ): Promise<
          | { ok: true; cited: LessonCitedExplanation; summary: string | null; cached: boolean; saved: boolean }
          | { ok: false; response: NextResponse }
        > => {
          if (!forceFlag && stored.cited) {
            return { ok: true, cited: stored.cited, summary: stored.summary, cached: true, saved: true };
          }

          let completion;
          try {
            completion = await aiRouter.completeChat("chat", {
              messages: buildCitedMessages({ topic, subject: subjectName, description, segments }),
              temperature: 0.3,
              maxTokens: 4096,
              usage,
            });
          } catch (error) {
            if (!(error instanceof AiProviderError)) throw error;
            return { ok: false, response: providerError(error) };
          }

          const parsed = parseCitedExplanation(completion.content ?? "", segments);
          if (!parsed.ok) {
            // الموديل رجع مراجع غير صالحة — مش بنحفظ «أرقام وهمية».
            console.warn("lesson-content: cited rejected:", parsed.reason);
            parsedReason = parsed.reason;
            return { ok: false, response: citedInvalid() };
          }

          void recordAiOperation(supabase, {
            userId: user.id,
            provider: completion.provider,
            model: completion.model,
            taskType: "chat",
            status: "completed",
            usage: completion.usage,
            contentLength: (completion.content ?? "").length,
          });

          const saved = await saveLessonContent({
            cited_explanation: parsed.cited,
            summary: parsed.summary,
            ...(transcriptFromLecture ? { transcript: { segments } } : {}),
            model: completion.model ?? null,
            generated_at: new Date().toISOString(),
          });

          return { ok: true, cited: parsed.cited, summary: parsed.summary, cached: false, saved };
        };

        /* ── الأوضاع الثلاثة فوق التفريغ (P2): التفريغ هو المصدر الأساسي ── */
        if (isExplanationMode(mode)) {
          if (mode === "summary") {
            // التلخيصي: derivation نصي من الشرح الم citied — بدون AI (اقتصادي بالكامل).
            let baseCited = stored.cited;
            let baseSaved = true;
            if (!baseCited) {
              const base = await ensureCited(force);
              if (!base.ok) return base.response;
              baseCited = base.cited;
              baseSaved = base.saved;
            }
            const text = deriveSummaryFromCited(baseCited!);
            if (!text.trim()) {
              return NextResponse.json(
                { error: { message: "الشرح المرتبط بالتفريغ فاضي — أعد التوليد الأول.", code: "CITED_INVALID" } },
                { status: 502 }
              );
            }
            const cached =
              typeof stored.modes.summary === "string" && stored.modes.summary.trim() === text.trim();
            let saved = baseSaved;
            if (!cached) {
              saved = await saveLessonContent({
                explanation: { ...stored.rawExplanation, summary: text },
              });
            }
            return NextResponse.json({
              ok: true,
              linked: true,
              source: "transcript",
              mode,
              explanationMode: mode,
              modeLabel: EXPLANATION_MODE_LABELS.summary,
              content: text,
              cached,
              saved,
              version: null,
              previousVersions: [],
            });
          }

          // general / detailed — توليد AI محكم بالاقتباس فوق نفس التفريغ.
          const storedCitedMode = readCitedMode(stored.rawExplanation, mode);
          if (storedCitedMode && !force) {
            const versions = readCitedVersions(stored.rawExplanation, mode);
            return NextResponse.json({
              ok: true,
              linked: true,
              source: "transcript",
              mode,
              explanationMode: mode,
              modeLabel: EXPLANATION_MODE_LABELS[mode],
              cited: storedCitedMode,
              cached: true,
              saved: true,
              version: versions.length + 1,
              previousVersions: versions.map((v) => ({
                text: citedToText(v.cited),
                generatedAt: v.generatedAt,
                model: null,
              })),
            });
          }

          let completion;
          try {
            completion = await aiRouter.completeChat("chat", {
              messages: buildCitedMessages({
                topic,
                subject: subjectName,
                description,
                segments,
                modeHint: CITED_MODE_HINTS[mode],
              }),
              temperature: 0.3,
              maxTokens: 4096,
              usage,
            });
          } catch (error) {
            if (!(error instanceof AiProviderError)) throw error;
            return providerError(error);
          }

          const parsed = parseCitedExplanation(completion.content ?? "", segments);
          if (!parsed.ok) {
            console.warn("lesson-content: cited overlay rejected:", parsed.reason);
            parsedReason = parsed.reason;
            return citedInvalid();
          }

          void recordAiOperation(supabase, {
            userId: user.id,
            provider: completion.provider,
            model: completion.model,
            taskType: "chat",
            status: "completed",
            usage: completion.usage,
            contentLength: (completion.content ?? "").length,
          });

          // الإصدار القديم بيتنفد للإصدارات — مش بيتمسح (نفس فلسفة الأوضاع المخزّنة).
          const previousVersions = readCitedVersions(stored.rawExplanation, mode);
          const versionsList = storedCitedMode
            ? [{ cited: storedCitedMode, generatedAt: row?.generated_at ?? new Date().toISOString() }, ...previousVersions].slice(
                0,
                MAX_EXPLANATION_VERSIONS
              )
            : previousVersions;
          const saved = await saveLessonContent({
            explanation: {
              ...stored.rawExplanation,
              [citedModeKey(mode)]: parsed.cited,
              [citedVersionsKey(mode)]: versionsList,
            },
            model: completion.model ?? null,
            generated_at: new Date().toISOString(),
          });

          return NextResponse.json({
            ok: true,
            linked: true,
            source: "transcript",
            mode,
            explanationMode: mode,
            modeLabel: EXPLANATION_MODE_LABELS[mode],
            cited: parsed.cited,
            cached: false,
            saved,
            version: versionsList.length + 1,
            previousVersions: versionsList.map((v) => ({
              text: citedToText(v.cited),
              generatedAt: v.generatedAt,
              model: null,
            })),
          });
        }

        /* ── المسار الأساسي: الشرح المبني على التفريغ (المصدر الأساسي للدرس المربوط) ── */
        const base = await ensureCited(force);
        if (!base.ok) return base.response;
        return NextResponse.json({
          ok: true,
          linked: true,
          source: "transcript",
          cached: base.cached,
          saved: base.saved,
          cited: base.cited,
          summary: base.summary,
        });
      }

      // الدرس مربوط بس التفريغ فاضي → نكمل بالمسار العادي (من غير citations).
    }

    /* ── المسار العادي: أوضاع markdown (كاش → توليد → حفظ) ── */
    const cachedMode = stored.modes[mode];
    if (!force && cachedMode) {
      return NextResponse.json({
        ok: true,
        linked: false,
        // الدرس مربوط بس التفريغ فاضي — الكلاينت يعرض رسالة واضحة.
        noTranscript: Boolean(linkedLectureId),
        content: cachedMode,
        cached: true,
        saved: true,
        mode,
        // الأوضاع الثلاثة: رقم الإصدار + الإصدارات السابقة (شفافية المصدر).
        ...(isExplanationMode(mode)
          ? {
              explanationMode: mode,
              modeLabel: EXPLANATION_MODE_LABELS[mode],
              version: storedVersionOf(stored.rawExplanation, mode),
              previousVersions: readExplanationVersions(stored.rawExplanation, mode),
            }
          : {}),
      });
    }

    let completion;
    try {
      completion = await aiRouter.completeChat("chat", {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: MODE_PROMPTS[mode](topic, subjectName, eduLineFrom(body.edu)) },
        ],
        temperature: 0.7,
        usage,
      });
    } catch (error) {
      if (!(error instanceof AiProviderError)) throw error;
      const isRate = error.status === 429;
      const isUnavailable = error.status === 503;
      return NextResponse.json(
        {
          error: {
            message: isRate
              ? "الخدمة مشغولة دلوقتي. حاول تاني بعد شوية."
              : "حصل خطأ أثناء الاتصال بالمساعد. حاول تاني.",
            code: isRate ? "PROVIDER_RATE_LIMIT" : isUnavailable ? "PROVIDER_UNAVAILABLE" : "PROVIDER_ERROR",
          },
        },
        { status: isUnavailable ? 503 : isRate ? 429 : 502 }
      );
    }

    const answer = completion.content?.trim() ?? "";
    if (!answer) {
      return NextResponse.json(
        { error: { message: "الموديل رجع بدون محتوى. حاول تاني.", code: "EMPTY_COMPLETION" } },
        { status: 502 }
      );
    }

    void recordAiOperation(supabase, {
      userId: user.id,
      provider: completion.provider,
      model: completion.model,
      taskType: "chat",
      status: "completed",
      usage: completion.usage,
      contentLength: answer.length,
    });

    // الحفظ best-effort — merge جوه الكائن القديم (مش استبدال).
    // الأوضاع الثلاثة: إعادة التوليد بتحفظ **إصدار جديد** — النص القديم بيتنفد
    // لقائمة الإصدارات (`<mode>__versions`) مش بيتمسح (مطلب P2).
    let explanationUpdate: Record<string, unknown>;
    let newVersion: number | null = null;
    if (isExplanationMode(mode)) {
      const versioned = withExplanationVersion(stored.rawExplanation ?? {}, mode, answer, {
        generatedAt: new Date().toISOString(),
        model: completion.model ?? null,
      });
      explanationUpdate = versioned.modes;
      newVersion = versioned.version;
    } else {
      explanationUpdate = { ...stored.modes, [mode]: answer };
    }
    let saved = false;
    try {
      const now = new Date().toISOString();
      const { error: upsertError } = await supabase.from("lesson_content").upsert(
        {
          user_id: user.id,
          day_id: dayId,
          explanation: explanationUpdate,
          status: "ready",
          model: completion.model ?? null,
          generated_at: now,
          updated_at: now,
        },
        { onConflict: "user_id,day_id" }
      );
      if (upsertError) {
        console.warn("lesson-content: حفظ فشل (migration ناقصة؟):", upsertError.message);
      } else {
        saved = true;
      }
    } catch (saveError) {
      console.warn("lesson-content: حفظ فشل:", saveError);
    }

    return NextResponse.json({
      ok: true,
      linked: false,
      noTranscript: Boolean(linkedLectureId),
      content: answer,
      cached: false,
      saved,
      mode,
      ...(isExplanationMode(mode)
        ? {
            explanationMode: mode,
            modeLabel: EXPLANATION_MODE_LABELS[mode],
            version: newVersion,
            previousVersions: readExplanationVersions(explanationUpdate, mode),
          }
        : {}),
    });
  } catch (error) {
    console.error("lesson-content route error:", error);
    return NextResponse.json(
      { error: { message: "حصل خطأ غير متوقع أثناء توليد المحتوى.", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
