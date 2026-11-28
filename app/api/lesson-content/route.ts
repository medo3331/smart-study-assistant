import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";
import {
  buildCitedMessages,
  extractSegments,
  normalizeForMatch,
  parseCitedExplanation,
  type LessonCitedExplanation,
  type TimedSegment,
} from "@/lib/lesson/citations";
import { subjectMatches } from "@/lib/academics/subject-match";
import {
  isExplanationMode,
  withExplanationVersion,
  readExplanationVersions,
  collectExplanationVersions,
  EXPLANATION_MODE_LABELS,
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

/* ═════════════════════════ الراوت ═════════════════════════ */

type LessonContentBody = {
  dayId?: unknown;
  mode?: unknown;
  force?: unknown;
  edu?: unknown;
  action?: unknown;
  lectureId?: unknown;
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
    return NextResponse.json({
      ok: true,
      ...linkState,
      content: storedContent,
      // إصدارات الأوضاع الثلاثة (شرح عام/تلخيصي/تفصيلي) — لعرض الإصدارات السابقة.
      explanationVersions: collectExplanationVersions(storedContent.rawExplanation),
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
      .select("explanation, cited_explanation, summary, source_lecture_id, transcript")
      .eq("user_id", user.id)
      .eq("day_id", dayId)
      .maybeSingle();

    const stored = readStoredContent(row);
    const linkedLectureId =
      typeof row?.source_lecture_id === "string" && row.source_lecture_id ? row.source_lecture_id : null;

    const usage = resolveUsageRequestContext(req, user.id);

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
        if (!force && stored.cited) {
          return NextResponse.json({
            ok: true,
            linked: true,
            cached: true,
            cited: stored.cited,
            summary: stored.summary,
          });
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

        const parsed = parseCitedExplanation(completion.content ?? "", segments);
        if (!parsed.ok) {
          // الموديل رجع مراجع غير صالحة — مش بنحفظ «أرقام وهمية».
          console.warn("lesson-content: cited rejected:", parsed.reason);
          return NextResponse.json(
            {
              error: {
                message:
                  parsed.reason === "BAD_HONESTY"
                    ? "الرد جه بأكثر من ثلث المراجع مش متطابقة مع التفريغ. جرّب تاني."
                    : "الرد جه بدون مراجع صالحة من التفريغ. جرّب تاني.",
                code: "CITED_INVALID",
              },
            },
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
        let saved = false;
        try {
          const { error: upsertError } = await supabase.from("lesson_content").upsert(
            {
              user_id: user.id,
              day_id: dayId,
              cited_explanation: parsed.cited,
              summary: parsed.summary,
              ...(transcriptFromLecture ? { transcript: { segments } } : {}),
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
          linked: true,
          cached: false,
          saved,
          cited: parsed.cited,
          summary: parsed.summary,
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
