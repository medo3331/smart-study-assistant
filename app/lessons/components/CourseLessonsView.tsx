"use client";
/* eslint-disable react-hooks/set-state-in-effect -- fetching course/lesson data from Supabase and syncing the view state is intentional */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  Loader2,
  Lock,
  MessageCircle,
  Plus,
  X,
} from "lucide-react";
import {
  DataNotice,
  EmptyState,
  LoadingSheets,
  PageShell,
} from "@/app/dashboard/components/PageShell";
import { useAuthUser } from "@/app/dashboard/components/use-page-data";
import { fetchCourseLessons, type CourseLesson, type CourseLessonsData } from "@/lib/pages-data";
import { buildLessonSequence } from "@/lib/learning/lesson-sequence";
import { curriculumCreditCost } from "@/lib/ai/credit-pricing";
import { CURRICULUM_MAX_LESSONS } from "@/lib/curriculum/types";

/* ==========================================================================
   دروس مادة واحدة

   - القفل التسلسلي بيتحسب في `buildLessonSequence` (دالة نقية ومختبرة).
   - العنوان الرئيسي هو `topic`، و`title` بقى لافتة صغيرة فوقه.
   - زر التوسيع بيظهر بعد 80% إكمال، والسيرفر بيفرض نفس الشرط.
   ========================================================================== */

const EXPAND_OPTIONS = [5, 10, 20] as const;

const LEVEL_LABEL: Record<string, string> = {
  beginner: "مبتدئ",
  intermediate: "متوسط",
  advanced: "متقدم",
};

type ViewState = "loading" | "ready" | "empty" | "anonymous" | "error";

interface CourseLessonsViewProps {
  configId: string;
}

export function CourseLessonsView({ configId }: CourseLessonsViewProps) {
  const router = useRouter();
  const { supabase, session } = useAuthUser();

  const [data, setData] = useState<CourseLessonsData | null>(null);
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [showExpand, setShowExpand] = useState(false);
  const [expandCount, setExpandCount] = useState<number>(EXPAND_OPTIONS[0]);
  const [expanding, setExpanding] = useState(false);
  const [expandError, setExpandError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session.status === "loading") return;

    if (session.status === "anonymous") {
      setViewState("anonymous");
      return;
    }
    if (session.status === "error") {
      setError(session.message);
      setViewState("error");
      return;
    }
    if (!configId) {
      setError("معرّف المادة غير صالح.");
      setViewState("error");
      return;
    }

    let cancelled = false;

    (async () => {
      setViewState("loading");
      const result = await fetchCourseLessons(supabase, session.user.id, configId);
      if (cancelled) return;

      if (result.error) {
        setError(result.error.message);
        setViewState("error");
        return;
      }
      if (!result.data) {
        setError("المادة مش موجودة أو مش تابعة لحسابك.");
        setViewState("error");
        return;
      }

      setData(result.data);
      setViewState(result.data.lessons.length > 0 ? "ready" : "empty");
    })();

    return () => {
      cancelled = true;
    };
  }, [session, supabase, configId, reloadToken]);

  const sequenced = useMemo(
    () =>
      data
        ? buildLessonSequence(data.lessons, { unlockedDays: data.unlockedDayIds })
        : [],
    [data]
  );

  const total = data?.lessons.length ?? 0;
  const completed = data?.lessons.filter((lesson) => lesson.isCompleted).length ?? 0;
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const xpEarned = data
    ? data.lessons.reduce((sum, lesson) => (lesson.isCompleted ? sum + lesson.xpReward : sum), 0)
    : 0;
  const remainingSlots = Math.max(0, CURRICULUM_MAX_LESSONS - total);
  const expandOptions = EXPAND_OPTIONS.filter((count) => count <= remainingSlots);
  const eligibleForExpansion =
    total > 0 && completed * 5 >= total * 4 && expandOptions.length > 0;

  function openExpandModal() {
    const first = expandOptions[0] ?? EXPAND_OPTIONS[0];
    setExpandCount(first);
    setExpandError(null);
    setShowExpand(true);
  }

  function openLesson(lesson: CourseLesson) {
    router.push(`/lesson/${lesson.id}`);
  }

  function askMentor(lesson: CourseLesson) {
    if (!data) return;
    const params = new URLSearchParams();
    params.set("configId", data.id);
    params.set("lessonDay", String(lesson.dayNumber));
    params.set("subject", data.subject);
    params.set("lesson", lesson.topic);
    if (lesson.title) params.set("title", lesson.title);
    if (lesson.description) params.set("content", lesson.description.slice(0, 4000));
    router.push(`/chat?${params.toString()}`);
  }

  async function handleExpand() {
    if (!data || expanding) return;

    setExpanding(true);
    setExpandError(null);

    try {
      const response = await fetch("/api/curriculum/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configId: data.id,
          additionalCount: expandCount,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.success) {
        throw new Error(
          (payload?.error as string | undefined) ||
            (response.status === 429
              ? "الخدمة مشغولة دلوقتي. استنى شوية وحاول تاني."
              : "مقدرناش نوسّع المنهج. حاول تاني.")
        );
      }

      const added = Number(payload?.data?.added ?? expandCount);
      setShowExpand(false);
      setNotice(`تمت إضافة ${added} دروس للمنهج.`);
      setReloadToken((value) => value + 1);
    } catch (expandFailure) {
      console.error("Curriculum expansion failed:", expandFailure);
      setExpandError(
        expandFailure instanceof Error
          ? expandFailure.message
          : "مقدرناش نوسّع المنهج. حاول تاني."
      );
    } finally {
      setExpanding(false);
    }
  }

  if (viewState === "loading") {
    return (
      <PageShell eyebrow="الدروس" title="الدروس" lede="بنحمّل دروس المادة…">
        <LoadingSheets count={3} />
      </PageShell>
    );
  }

  if (viewState === "error") {
    return (
      <PageShell eyebrow="الدروس" title="الدروس">
        <DataNotice message={error ?? "حصل خطأ غير متوقع."} />
        <button
          type="button"
          onClick={() => router.push("/dashboard/courses")}
          className="btn btn-quiet text-sm"
        >
          رجوع للمواد
        </button>
      </PageShell>
    );
  }

  if (viewState === "anonymous") {
    return (
      <PageShell eyebrow="الدروس" title="الدروس">
        <EmptyState
          icon="🔐"
          title="محتاج تسجّل دخول"
          body="دروسك وتقدمك مربوطين بحسابك. سجّل دخول عشان تكمّل من حيث ما وقفت."
          action={
            <button
              type="button"
              onClick={() => router.push("/login?next=/lessons")}
              className="btn btn-marker text-sm"
            >
              تسجيل الدخول
            </button>
          }
        />
      </PageShell>
    );
  }

  if (!data || viewState === "empty") {
    return (
      <PageShell eyebrow="الدروس" title={data?.subject ?? "الدروس"}>
        <EmptyState
          icon="📖"
          title="مفيش دروس في المادة دي"
          body="ابدأ مادة جديدة أو ارجع للمواد واختار مادة تانية."
          action={
            <button
              type="button"
              onClick={() => router.push("/assessment")}
              className="btn btn-marker text-sm"
            >
              مادة جديدة
            </button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="الدروس"
      title={data.subject}
      lede={`${total} دروس · ${data.category ?? "بدون تصنيف"}${
        data.curriculumLevel ? ` · ${LEVEL_LABEL[data.curriculumLevel]}` : ""
      }`}
      action={
        <button
          type="button"
          onClick={() => router.push("/dashboard/courses")}
          className="btn btn-quiet text-sm"
        >
          كل المواد
        </button>
      }
    >
      {notice && (
        <div className="notice notice-ok">
          <p className="m-0">{notice}</p>
        </div>
      )}

      <section className="sheet-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="tag mb-1.5">تقدم المادة</p>
            <p className="text-sm font-bold text-ink m-0">
              <span className="ltr-num">{completed}</span> /{" "}
              <span className="ltr-num">{total}</span> دروس مكتملة
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {data.isActive && <span className="tag">المادة الحالية</span>}
            <span className="tag tag-quiet">
              <span className="ltr-num">{xpEarned}</span> XP
            </span>
            {eligibleForExpansion && (
              <button
                type="button"
                onClick={openExpandModal}
                className="btn btn-marker text-sm inline-flex items-center gap-1.5"
              >
                <Plus size={14} aria-hidden />
                توسيع المنهج
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="mono text-ink-soft ltr-num">{progressPct}%</span>
            <span className="mono text-[11px] text-ink-soft">القفل التسلسلي</span>
          </div>
          <div
            className="meter meter-sm"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="تقدم المادة"
          >
            <div className="meter-fill bg-ink" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {eligibleForExpansion && (
          <p className="text-[11px] text-ink-soft m-0">
            خلّصت {progressPct}% من المنهج — تقدر تضيف دروس جديدة بنفس المستوى.
          </p>
        )}
      </section>

      <ol className="space-y-3 list-none m-0 p-0">
        {sequenced.map(({ lesson, isLocked, isCurrent, isEarlyUnlocked }) => {
          const isCompleted = lesson.isCompleted;

          return (
            <li key={lesson.id}>
              <div
                className={`sheet-card p-4 transition ${
                  isCurrent ? "sheet-card-live" : ""
                } ${isLocked ? "opacity-65" : "card-interactive"}`}
                aria-disabled={isLocked || undefined}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className={`shrink-0 w-10 h-10 rounded-[var(--r-sm)] flex items-center justify-center font-display font-extrabold text-sm ${
                      isCompleted
                        ? "bg-emerald-500 text-onmarker"
                        : isLocked
                        ? "bg-paper-3 text-ink-soft border border-rule"
                        : "bg-ink text-paper-2"
                    }`}
                  >
                    {isCompleted ? (
                      <Check size={16} />
                    ) : isLocked ? (
                      <Lock size={15} />
                    ) : (
                      lesson.dayNumber
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isCurrent && (
                        <span className="tag tag-box border border-redpen text-redpen">
                          الدرس الحالي
                        </span>
                      )}
                      {isEarlyUnlocked && (
                        <span className="tag tag-box border border-rule-strong text-ink-soft">
                          مفتوح بدري
                        </span>
                      )}
                      {isCompleted && <span className="tag">مكتمل</span>}
                      {isLocked && <span className="tag tag-quiet">مقفول</span>}
                    </div>

                    {/* العنوان الرئيسي هو topic الحقيقي — title سطر صغير تحته */}
                    <h3
                      className={`h3 mt-1.5 ${
                        isCompleted ? "text-ink-soft" : "text-ink"
                      }`}
                    >
                      {lesson.topic}
                    </h3>

                    {lesson.title && (
                      <p className="text-[11px] text-ink-soft mt-0.5 mb-0">
                        {lesson.title}
                      </p>
                    )}

                    {lesson.description && (
                      <p className="text-xs text-ink-soft leading-relaxed mt-1.5 mb-0 line-clamp-2">
                        {lesson.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      <span className="tag tag-quiet">
                        +<span className="ltr-num">{lesson.xpReward}</span> XP
                      </span>
                      {isLocked && (
                        <span className="text-[11px] text-ink-soft">
                          خلّص الدرس اللي قبله عشان يفتح.
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-2">
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => askMentor(lesson)}
                        className="btn btn-quiet text-xs px-2.5 py-2 inline-flex items-center gap-1.5"
                      >
                        <MessageCircle size={14} aria-hidden />
                        <span className="hidden md:inline">اسأل المعلم</span>
                        <span className="sr-only md:hidden">اسأل المعلم الذكي</span>
                      </button>
                    )}

                    {isLocked ? (
                      <span className="tag tag-quiet inline-flex items-center gap-1">
                        <Lock size={12} aria-hidden />
                        مقفول
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openLesson(lesson)}
                        className={`btn text-sm px-3.5 py-2 inline-flex items-center gap-1.5 ${
                          isCompleted ? "btn-quiet" : "btn-marker"
                        }`}
                      >
                        {isCompleted ? "راجع" : isCurrent ? "ابدأ" : "افتح"}
                        <ChevronLeft size={14} aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {showExpand && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expand-curriculum-title"
        >
          <div className="sheet-card card-lift p-6 w-full max-w-md space-y-4" dir="rtl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow eyebrow-flush mb-1.5">توسيع</p>
                <h3 id="expand-curriculum-title" className="h3 m-0">
                  وسّع منهج {data.subject}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowExpand(false)}
                disabled={expanding}
                aria-label="إغلاق"
                className="mono text-ink-soft hover:text-ink px-2 py-1 rounded-[var(--r-sm)] hover:bg-paper-3 transition disabled:opacity-40"
              >
                <X size={16} aria-hidden />
              </button>
            </div>

            <p className="text-xs text-ink-soft leading-relaxed m-0">
              هتضيف دروس جديدة بنفس مستوى «{LEVEL_LABEL[data.curriculumLevel ?? "intermediate"]}»
              وبنفس موضوعات المادة، من غير تكرار.
            </p>

            <div>
              <p className="field-label">عدد الدروس الإضافية</p>
              <div className="grid grid-cols-3 gap-2">
                {expandOptions.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setExpandCount(count)}
                    aria-pressed={expandCount === count}
                    className={`mono p-3 rounded-[var(--r-sm)] border transition ${
                      expandCount === count
                        ? "bg-ink border-ink text-paper-2"
                        : "bg-paper border-rule text-ink-soft hover:text-ink"
                    }`}
                  >
                    {count} دروس
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-paper border border-rule rounded-[var(--r-sm)] p-3 flex items-center justify-between gap-2">
              <span className="tag">التكلفة</span>
              <span className="text-sm font-bold text-ink">
                {curriculumCreditCost(expandCount)} كريدت
              </span>
            </div>

            {expandError && (
              <div className="notice notice-error">
                <p className="m-0">{expandError}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => void handleExpand()}
                disabled={expanding}
                className="btn btn-marker text-sm flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {expanding ? (
                  <>
                    <Loader2 size={15} className="animate-spin" aria-hidden />
                    بيوسّع…
                  </>
                ) : (
                  "تأكيد التوسيع"
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowExpand(false)}
                disabled={expanding}
                className="btn btn-quiet text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
