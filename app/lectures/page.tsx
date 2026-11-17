/* ======================================================================
   📚 محاضراتي — قائمة محاضرات المستخدم + عرض التفريغ (المرحلة ٣)
   ======================================================================
   الصفحة دي **قراءة فقط**: بتعرض اللي اتخزّن فعلاً في `public.lectures`.
   مفيش أي AI هنا (ملخص/شرح/فلاش/أسئلة) — دي مرحلة تانية، والأعمدة
   (`summary` / `explanation`) موجودة في الجدول ومستنية.

   ⚠️ ليه Server Component: الاستعلام بيحصل على السيرفر بعميل الجلسة
   (`createClient`) — فـ RLS شغّال والصفحة **مش** بتملك أي صلاحية
   استثنائية. وكمان بيخلينا نعمل redirect للزائر على السيرفر بدل ما
   نلمّع شاشة فاضية لثانية.

   ⚠️ التصفية بمعرّف المستخدم **مكتوبة صريح** في الاستعلام:
   `.eq("user_id", user.id)`. ده مش تكرار لـ RLS — ده طبقتين:
   RLS بتضمن إن الصف ما يظهرش أصلاً لو الفلتر اتنسى؛ الفلتر الصريح
   بيضمن الفلتر موجود. لو اتشال واحد، التانية لسه واقفة.
   ====================================================================== */

import { type Metadata } from "next";
import Link from "next/link";
import { Mic, FileText } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell, DataNotice, EmptyState } from "@/app/dashboard/components/PageShell";
import { LectureProcessActions } from "@/components/lectures/LectureProcessActions";
import { LectureNote } from "@/components/lectures/LectureNote";
import { LectureSection, LectureToolbar, LectureWorkspace } from "@/components/lectures/LectureWorkspace";
import LectureChat from "@/components/lectures/LectureChat";
import { FlashcardsPanel } from "@/components/lectures/FlashcardsPanel";
import { McqQuiz } from "@/components/lectures/McqQuiz";
import { LectureTranscriptEditor } from "@/components/lectures/LectureTranscriptEditor";
import { LectureTranscriptViewer } from "@/components/lectures/LectureTranscriptViewer";
import { LectureIntensive } from "@/components/lectures/LectureIntensive";
import { LectureCitationProvider } from "@/components/lectures/lecture-citation-context";
import { extractSegments, planParts, reconcileExplanation } from "@/lib/ai/lecture-intensive";
import { INTENSIVE_CHUNK_CHARS } from "@/lib/ai/lecture-intensive-prompts";
import { FeatureGuide } from "@/components/FeatureGuide";
import { guides } from "@/lib/guides";
import type { Flashcard, Mcq } from "@/lib/ai/lecture-study";
import type { IntensiveExplanation } from "@/lib/ai/lecture-intensive";
import type { TimedSegment } from "@/lib/ai/lecture-intensive-prompts";

export const metadata: Metadata = {
  title: "التسجيلات الصوتية والمستندات — Magicly",
  description: "تسجيلاتك الصوتية مع تفريغها، ومستنداتك (PDF/Word) — كلهم في مكانين واضحين.",
};

/** المدة بالثواني → "12:34" أو "1:05:20" (نفس دالة الواجهة). */
function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** التاريخ بصيغة عربية مقروءة. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const SOURCE_LABEL: Record<string, string> = {
  upload: "ملف مرفوع",
  live_recording: "تسجيل مباشر",
};

const STATUS_LABEL: Record<string, string> = {
  processing: "جاري",
  completed: "جاهزة",
  failed: "فشلت",
};

/** صف المحاضرة كما بتقراه الصفحة. */
type LectureListItem = {
  id: string;
  title: string | null;
  original_filename: string | null;
  source_type: string;
  status: string;
  created_at: string;
  duration_seconds: number | null;
  transcript_text: string | null;
  review_status: string | null;
  transcript_reviewed_text: string | null;
  summary: string | null;
  explanation: string | null;
  flashcards: Flashcard[] | null;
  mcqs: Mcq[] | null;
  /** ⚡ الشرح المكثف (Phase 5) — JSON مش Markdown. */
  intensive_explanation: IntensiveExplanation | null;
  /**
   * ⚠️ `transcript_data` jsonb — بيتقرا **على السيرفر** وبيتحوّل لـ
   *    `TimedSegment[]` قبل ما يوصل الكلاينت.
   *
   *    السبب: الـ jsonb فيه `words[]` (آلاف الكلمات بتوقيتها) — حجمه
   *    hundreds of KB. لو مرّرناه للكلاينت كان هيبقى payload تقيل جداً
   *    من غير أي فايدة: الواجهة محتاجة المقاطع بس (هي اللي فيها
   *    التوقيت granularity الكافي للإبراز).
   */
  transcript_data: unknown;
};

export default async function MyLecturesPage({ searchParams }: { searchParams: Promise<{ subject?: string; tab?: string }> }) {
  const resolved = await searchParams;
  const subjectFilter = resolved?.subject?.trim() || null;
  // 🔀 التبويب: «recordings» (تسجيلات صوتية) ولا «documents» (مستندات).
  const activeTab = resolved?.tab === "documents" ? "documents" : "recordings";
  const supabase = await createClient();

  // ١) المصادقة — الزائر يروح لصفحة الدخول (بعده = /lectures عشان يرجع).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/lectures");

  // ٢) محاضرات المستخدم بس + النص (عشان نفتحها من نفس الاستعلام).
  //    ⚠️ `summary` و`explanation` اتضافوا للاختيار عشان نعرف نعرض زرار
  //    المعالجة بس لو المحاضرة **لسه** مالهاش. الاختيار ده مش بيكسر
  //    حاجة: الأعمدة موجودة فعلاً في الجدول من migration #14.
  const lecturesQuery = supabase
    .from("lectures")
    .select(
      "id, title, original_filename, source_type, status, created_at, duration_seconds, transcript_text, review_status, transcript_reviewed_text, summary, explanation, flashcards, mcqs, intensive_explanation, transcript_data",
    )
    .eq("user_id", user.id);
  if (subjectFilter) lecturesQuery.eq("subject_id", subjectFilter);
  const { data, error } = await lecturesQuery.order("created_at", { ascending: false });

  const lectures = (data ?? []) as LectureListItem[];

  // 📄 المستندات (PDF/PPTX/DOCX) — تبويب مستقل: الطالب لازم يفرق بين
  //    «الصوتيات اللي بيتفرّغ» و«الملفات».
  const { data: documentsData } = await supabase
    .from("documents")
    .select("id, title, file_type, page_count, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const documents = (documentsData ?? []) as Array<{
    id: string;
    title: string | null;
    file_type: string | null;
    page_count: number | null;
    status: string | null;
    created_at: string;
  }>;

  return (
    <PageShell
      eyebrow="محتواي"
      title="التسجيلات والملفات 📚"
      lede="تسجيلاتك الصوتية (اللي بيتفريغ نصها) وملفاتك (PDF و PowerPoint) — كلهم في مكانين واضحين."
    >
      <FeatureGuide {...guides.lectures} storageKey="guide:lectures" />

      {/* 🔀 التبويبات — عشان «المحاضرات» ما تبقاش كلمة واحدة بتشيل كل حاجة.
          *  تبويب 1: تسجيلات صوتية (MP3/MP4) · تبويب 2: مستندات (PDF/PPTX/Word).
          *  ⚠️ التبويب في الـURL (`?tab=documents`) — قابل للمشاركة وبيشتغل
          *    من غير JS. */}
      <nav className="mb-4 flex gap-2" aria-label="نوع المحتوى">
        <Link
          href="/lectures"
          aria-current={activeTab === "recordings" ? "page" : undefined}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition ${
            activeTab === "recordings"
              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
              : "border-[var(--rule)] text-ink-soft hover:text-ink"
          }`}
        >
          <Mic size={15} aria-hidden />
          المحاضرات الصوتية
          <span className="text-xs opacity-70 ltr-num">({lectures.length})</span>
        </Link>
        <Link
          href="/lectures?tab=documents"
          aria-current={activeTab === "documents" ? "page" : undefined}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition ${
            activeTab === "documents"
              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
              : "border-[var(--rule)] text-ink-soft hover:text-ink"
          }`}
        >
          <FileText size={15} aria-hidden />
          المستندات
          <span className="text-xs opacity-70 ltr-num">({documents.length})</span>
        </Link>
      </nav>

      {/* CTA — بيتغيّر حسب التبويب: رفع تسجيل صوتي ولا رفع مستند. */}
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Link
          href="/lecture-transcription"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Mic size={16} aria-hidden />
          <span>ابدأ تسجيلًا صوتيًا</span>
        </Link>
        <Link
          href="/dashboard/workspace?tab=files"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule)] px-4 text-sm font-semibold text-ink transition-opacity hover:opacity-80"
        >
          <FileText size={16} aria-hidden />
          <span>ارفع مستند (PDF/Word)</span>
        </Link>
      </div>

      {activeTab === "documents" ? (
        /* 📄 تبويب المستندات */
        documents.length === 0 ? (
          <EmptyState
            icon="📄"
            title="لسه مفيش مستندات"
            body="ارفع PDF أو PowerPoint أو Word من مساحة العمل، وهو يتحفظ هنا وتقدر تعمل منه امتحان."
          />
        ) : (
          <section className="grid gap-4">
            {documents.map((doc) => (
              <article
                key={doc.id}
                className="card-interactive rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-ink">{doc.title ?? "مستند"}</h2>
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-ink-soft dark:bg-white/10">
                    {doc.status === "ready" ? "جاهز" : doc.status === "partial" ? "جزئي" : "مستحيل؟"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  {formatDate(doc.created_at)}
                  {doc.file_type ? ` · ${doc.file_type.toUpperCase()}` : ""}
                  {doc.page_count ? ` · ${doc.page_count} صفحة` : ""}
                </p>
                <p className="mt-2 text-xs text-ink-soft">
                  تقدر تعمل امتحان من الملف ده من{" "}
                  <Link href="/exams?gen=1" className="underline">
                    مولّد الامتحانات
                  </Link>
                  .
                </p>
              </article>
            ))}
          </section>
        )
      ) : error ? (
        /* ⚠️ مافيش fake data: لو الاستعلام فشل بنقولّك صريح. */
        <DataNotice message="مقدرناش نحمّل تسجيلاتك دلوقتي. حاول تاني كمان شوية." />
      ) : lectures.length === 0 ? (
        <EmptyState
          icon="🎙️"
          title="لسه مفيش تسجيلات صوتية"
          body="ارفع تسجيل محاضرة من صفحة تفريغ المحاضرات، وسجّل دخول الأول — وهي تتحفظ هنا."
        />
      ) : (
        <section className="grid gap-4">
          {lectures.map((lecture) => {
            /* ⚠️ المقاطع بتتقصّ **على السيرفر** — الـ jsonb كله (فيه
               `words[]` بآلاف الكلمات) مايوصلش للكلاينت. الواجهة محتاجة
               المقاطع بس: دي اللي فيها دقة التوقيت الكافية للإبراز،
               وهي أصلاً المصدر اللي الـ citations بتشير ليه. */
            const segments: TimedSegment[] = extractSegments(lecture.transcript_data);

            /* ⚠️ حالة الشرح المكثف بتتخطّع عبر `reconcileExplanation`:
               الشكل المخزَّن (v2) بيتطابق مع خطة الأجزاء الحالية. لو
               الشكل قديم (v1) أو المقاطع اتغيّرت ⇒ الأجزاء بترجع
               "pending" والواجهة بتعرض الأرقام الصح. */
            const intensiveState = reconcileExplanation(
              lecture.intensive_explanation,
              planParts(segments, INTENSIVE_CHUNK_CHARS),
            );

            return (
            /* ⚠️ الـ provider بلفّ المحاضرة كلها — هو اللي بيربط
               «الشرح المكثف» (في قسم) بـ «التفريغ» (في قسم تاني).
               من غيره مفيش طريقة الـ chips تعرف تفتح قسم وتبرز مقطع. */
            <LectureCitationProvider key={lecture.id}>
            <article key={lecture.id} className="card-interactive rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-5 shadow-sm">
              <details>
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-ink">
                      {lecture.title ?? lecture.original_filename ?? "محاضرة"}
                    </h2>
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-ink-soft dark:bg-white/10">
                      {STATUS_LABEL[lecture.status] ?? lecture.status}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-ink-soft">
                    {/* ⬇️ لاحظ: كل الحقول دي نصوص من قاعدة البيانات بتترسم
                        كنص عادي (JSX بيهرّبها تلقائياً) — مافيش أي
                        dangerouslySetInnerHTML في الملف، فالنص اللي رجع
                        من ElevenLabs مش يقدر ينفّذ HTML. */}
                    {formatDate(lecture.created_at)}
                    {" · "}
                    {SOURCE_LABEL[lecture.source_type] ?? lecture.source_type}
                    {lecture.duration_seconds !== null && (
                      <>
                        {" · "}
                        {formatDuration(lecture.duration_seconds)}
                      </>
                    )}
                  </p>
                </summary>

                {/* 🎓 مساحة المذاكرة: كل قسم في بلوك قابل للطي.
                    الافتراضي: الملخص مفتوح لو موجود، والباقي مقفول. */}
                <LectureWorkspace defaultOpen={lecture.summary ? ["summary"] : []}>
                  <div className="mt-3">
                    {/* ✨ أدوات التوليد بره الأقسام عشان الطالب يلاقيها الأول. */}
                    <LectureProcessActions
                      lectureId={lecture.id}
                      hasSummary={Boolean(lecture.summary?.trim())}
                      hasExplanation={Boolean(lecture.explanation?.trim())}
                      hasIntensive={Boolean(lecture.intensive_explanation)}
                      hasTimings={segments.length > 0}
                    />
                  </div>

                  <div className="mt-3 space-y-3">
                    {lecture.summary && (
                      <LectureSection
                        id="summary"
                        icon="📝"
                        title="ملخص المحاضرة"
                        lede="مراجعة سريعة لأهم ما ورد في المحاضرة."
                      >
                        <LectureNote kind="summary" content={lecture.summary} />
                      </LectureSection>
                    )}

                    {lecture.explanation && (
                      <LectureSection
                        id="explanation"
                        icon="🧠"
                        title="شرح المحاضرة"
                        lede="شرح مبسّط ومنظّم يساعدك تفهم محتوى المحاضرة."
                        toolbar={<LectureToolbar lectureId={lecture.id} />}
                      >
                        <LectureNote kind="explanation" content={lecture.explanation} />
                      </LectureSection>
                    )}

                    {/* ⚡ الشرح المكثف — كل جملة فيه ليها مصدر بتوقيتها.
                        ⚠️ القسم بيتبان لو فيه شرح متولّد؛ لو لأ، الطالب
                        بيضغط «شرح مكثف مع المصادر» من فوق. */}
                    {intensiveState.parts.length > 0 && (
                      <LectureSection
                        id="intensive"
                        icon="🎯"
                        title="شرح مكثف مع المصادر"
                        lede="شرح مفصّل، وكل معلومة فيه ليها توقيتها في المحاضرة."
                      >
                        <LectureIntensive
                          lectureId={lecture.id}
                          explanation={intensiveState}
                          /* 🔑 معرّف جلسة التوليد — بيتبعت كـ
                             `Idempotency-Key` فكل أجزاء المحاضرة
                             بتتسجّل تحت عملية usage واحدة. (الحجز نفسه
                             كريدت واحد للمحاضرة — المرجع بينحسب
                             في السيرفر من الـ lectureId.) */
                          sessionId={`lecture-${lecture.id}`}
                          /* 📄 المقاطع — عشان «ورقة المصدر» تعرض
                             **الاقتباس الحرفي** من غير أي نداء شبكة
                             (المقاطع موجودة في الصفحة أصلاً). */
                          segments={segments}
                        />
                      </LectureSection>
                    )}

                    {lecture.flashcards && (
                      <LectureSection
                        id="flashcards"
                        icon="🃏"
                        title="بطاقات المذاكرة"
                        lede="اقلب البطاقة عشان تشوف الإجابة."
                      >
                        <FlashcardsPanel cards={lecture.flashcards} />
                      </LectureSection>
                    )}

                    {lecture.mcqs && (
                      <LectureSection
                        id="mcq"
                        icon="❓"
                        title="اختبار المحاضرة"
                        lede="جاوب على الأسئلة وشوف شرح كل إجابة."
                      >
                        <McqQuiz mcqs={lecture.mcqs} />
                      </LectureSection>
                    )}

                    <LectureSection
                      id="transcript"
                      icon="📜"
                      title="التفريغ النصي"
                      lede="نص كلام الدكتور كامل — لمّا تحتاج تراجع الأصل."
                    >
                      {/* ⚠️ العارض الواعي بالمقاطع — هو اللي بيعرف يبرز
                          المقطع لما الطالب يضغط على مرجع في «الشرح المكثف».
                          من غير المقاطع مفيش حاجة تتبرز. */}
                      <LectureTranscriptViewer
                        segments={segments}
                        reviewedText={lecture.transcript_reviewed_text}
                      />

                      {lecture.transcript_text && (
                        <div className="mt-3">
                          <LectureTranscriptEditor lectureId={lecture.id} initialText={lecture.transcript_text} />
                        </div>
                      )}

                     <LectureChat
                       lectureId={lecture.id}
                       contextText={
                         lecture.review_status === "completed" && lecture.transcript_reviewed_text
                           ? lecture.transcript_reviewed_text
                           : (lecture.transcript_text ?? "")
                       }
                     />

                    </LectureSection>
                  </div>
                </LectureWorkspace>
              </details>
            </article>
            </LectureCitationProvider>
            );
          })}
        </section>
      )}
    </PageShell>
  );
}
