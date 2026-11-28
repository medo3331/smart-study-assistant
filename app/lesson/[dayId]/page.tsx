"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: proper typing requires architecture change, tracked separately */

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { buildLessonSequence } from "@/lib/learning/lesson-sequence";
import { fetchUnlockedDayIds } from "@/lib/pages-data";

// ✅ P1 — Unified Workspace: الصفحة shell بسيط — تحميل الداتا + Provider + Shell.
// كل الـ Studio في studio/ (التابات والـ Navigator والفيديو والنوتة والمساعد).
import { LessonShell } from "./components/LessonChrome";
import { LessonStudioProvider, type LessonStudioLesson } from "./studio/LessonStudioProvider";
import StudioShell from "./studio/StudioShell";
import { LessonLoadingScreen, LessonLockedScreen, LessonNotFoundScreen } from "./studio/LessonGateStates";
import type { LearningStyle, ResourceLink } from "./studio/tabs/LearnTab";
import type { SpecializationContext } from "@/lib/education/specialization";

/** صفّ مبسّط لأيام الخطة — من استعلام study_days الموجود أصلًا. */
interface UnitDayLite {
  day_number: number;
  is_completed: boolean;
}

type CategoryType = "عمل ومشاريع" | "تعلم مهارة" | "دراسة أكاديمية" | "تطوير شخصي";

interface DayRow {
  id: string;
  config_id: string;
  user_id: string;
  day_number: number;
  title: string;
  topic: string;
  description: string;
  is_completed: boolean;
  xp_reward: number;
  learning_style: LearningStyle;
  resource_links: ResourceLink[];
}

interface ConfigRow {
  subject: string;
  category: CategoryType;
}

export default function LessonDetailPage() {
  const router = useRouter();
  const params = useParams();
  const dayId = params?.dayId as string;
  const [supabase] = useState(() => createClient());

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [dayRow, setDayRow] = useState<DayRow | null>(null);
  const [config, setConfig] = useState<ConfigRow | null>(null);

  // تقدم الخطة الكلي + أيام الخطة (لشريط الوحدة) + روابط الدرس التالي/السابق
  const [planProgress, setPlanProgress] = useState<{ completed: number; total: number } | null>(null);
  const [planDays, setPlanDays] = useState<UnitDayLite[]>([]);
  const [nextDayId, setNextDayId] = useState<string | null>(null);
  const [previousDayId, setPreviousDayId] = useState<string | null>(null);
  const [isLockedBySequence, setIsLockedBySequence] = useState(false);

  // حالة أزرار الإجراءات السريعة (حفظ/مفضلة) - بصرية بحتة
  const [isSaved, setIsSaved] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);

  // سياق التعليم (stage/grade/track/faculty) — لبحث الفيديو lazy
  const [eduVideoCtx, setEduVideoCtx] = useState<{ stage?: string; grade?: string; track?: string; faculty?: string }>({});
  const [userProfileField, setUserProfileField] = useState<string | null>(null);
  // مودال الاحتفال مفتوح ⇒ الـ FeedbackWidget يتعطّل (نفس السلوك القديم)
  const [celebrationOpen, setCelebrationOpen] = useState(false);

  // 🔴 تحميل بيانات الدرس والمادة والبروفايل — نفس الاستعلامات القديمة بالحرف
  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: day, error: dayError } = await supabase
        .from("study_days")
        .select("*")
        .eq("id", dayId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (dayError || !day) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const typedDay = { ...day, resource_links: day.resource_links || [] } as DayRow;
      setDayRow(typedDay);

      const { data: cfg } = await supabase
        .from("study_configs")
        .select("subject, category")
        .eq("id", day.config_id)
        .maybeSingle();
      if (cfg) setConfig(cfg as ConfigRow);

      const { data: profile } = await supabase.from("profiles").select("xp, education_stage_id, education_grade_id, education_track_id, faculty_name, edu_year, field").eq("id", user.id).maybeSingle();
      setUserProfileField((profile as { field?: string | null } | null)?.field ?? null);
      // Step 3 — resolve education labels for smart video (مادة + شعبة/مسار + درس)
      try {
        const p = profile as { education_stage_id?: string | null; education_grade_id?: string | null; education_track_id?: string | null; faculty_name?: string | null; edu_year?: number | null } | null;
        const nextCtx: { stage?: string; grade?: string; track?: string; faculty?: string } = {};
        if (p?.faculty_name) nextCtx.faculty = p.faculty_name;
        if (p?.education_stage_id) {
          const { data: s } = await supabase.from("education_stages").select("code").eq("id", p.education_stage_id).maybeSingle();
          if (s) nextCtx.stage = (s as { code: string }).code;
          if (nextCtx.stage === "UNIVERSITY" && p?.edu_year) nextCtx.grade = String(p.edu_year);
        }
        if (p?.education_grade_id && nextCtx.stage !== "UNIVERSITY") {
          const { data: g } = await supabase.from("education_grades").select("name, code").eq("id", p.education_grade_id).maybeSingle();
          if (g) nextCtx.grade = (g as { name: string }).name;
        }
        if (p?.education_track_id) {
          const { data: t } = await supabase.from("education_tracks").select("name, code").eq("id", p.education_track_id).maybeSingle();
          if (t) {
            const code = (t as { code: string }).code;
            const label = code === "SEC_SCI" ? "علمي علوم" : code === "SEC_MATH" ? "علمي رياضة" : code === "SEC_LIT" ? "أدبي" : code.startsWith("MED") ? "طب وعلوم حياة" : code.startsWith("ENG") ? "هندسة وعلوم حاسب" : code.startsWith("BUS") ? "قطاع أعمال" : code.startsWith("HUM") ? "آداب وفنون" : (t as { name: string }).name;
            nextCtx.track = label;
          }
        }
        if (Object.keys(nextCtx).length > 0) setEduVideoCtx(nextCtx);
      } catch {}

      // جلب كل أيام الخطة: التقدم الكلي + أيام الوحدة + التالي/السابق + القفل التسلسلي
      const { data: allDays } = await supabase
        .from("study_days")
        .select("id, day_number, is_completed")
        .eq("config_id", day.config_id)
        .eq("user_id", user.id)
        .order("day_number", { ascending: true });

      if (allDays) {
        const completed = allDays.filter((d: { is_completed: boolean }) => d.is_completed).length;
        setPlanProgress({ completed, total: allDays.length });
        setPlanDays(
          allDays.map((d: { day_number: number; is_completed: boolean }) => ({
            day_number: d.day_number,
            is_completed: d.is_completed,
          }))
        );
        const next = allDays.find((d: { day_number: number }) => d.day_number === typedDay.day_number + 1);
        setNextDayId(next ? (next as any).id : null);
        const previous = allDays.find((d: { day_number: number }) => d.day_number === typedDay.day_number - 1);
        setPreviousDayId(previous ? (previous as any).id : null);

        // 🔓 الفتح المبكر بقى من الداتابيز — نفس المصدر اللي صفحة الدروس بتقرأ منه.
        const unlockedResult = await fetchUnlockedDayIds(
          supabase,
          user.id,
          allDays.map((d: { id: string }) => d.id)
        );
        const unlockedDays = unlockedResult.error ? [] : unlockedResult.data;

        const sequence = buildLessonSequence(
          allDays.map((d: { id: string; day_number: number; is_completed: boolean }) => ({
            id: d.id,
            dayNumber: d.day_number,
            isCompleted: Boolean(d.is_completed),
          })),
          { unlockedDays }
        );
        const current = sequence.find((item) => item.lesson.id === typedDay.id);
        setIsLockedBySequence(Boolean(current?.isLocked));
      }

      setLoading(false);
    };
    if (dayId) load();
  }, [dayId, supabase, router]);

  // 🎨 تغيير نمط التعلم لهذا الدرس
  const changeLearningStyle = async (style: LearningStyle) => {
    if (!dayRow) return;
    setDayRow({ ...dayRow, learning_style: style });
    await supabase.from("study_days").update({ learning_style: style }).eq("id", dayRow.id);
  };

  const handleShareLesson = async () => {
    const text = `📚 بذاكر "${dayRow?.topic}" في ${config?.subject}! 🔥`;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ text });
      } catch {
        /* المستخدم لغى المشاركة */
      }
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        alert("تم النسخ.");
      } catch {
        alert(text);
      }
    }
  };

  if (loading) return <LessonLoadingScreen />;

  if (notFound || !dayRow) return <LessonNotFoundScreen />;

  if (isLockedBySequence) {
    return <LessonLockedScreen previousDayId={previousDayId} configId={dayRow.config_id} />;
  }

  const unitDays: UnitDayLite[] = (planDays ?? []).slice().sort((a, b) => a.day_number - b.day_number);
  /* 🎯 حالة الـ CTA من الحالة الفعلية فقط:
     مكتمل → راجع · متُرك بدون إكمال وفيه أيام أبعد فُتحت → تابع · غير ده → ابدأ */
  const ctaState: "start" | "continue" | "review" = dayRow.is_completed
    ? "review"
    : unitDays.some((d) => !d.is_completed && d.day_number > dayRow.day_number)
      ? "continue"
      : "start";

  const lesson: LessonStudioLesson = {
    dayId,
    topic: dayRow.topic,
    title: dayRow.title,
    description: dayRow.description,
    subject: config?.subject ?? "",
    category: config?.category ?? "",
    learningStyle: dayRow.learning_style,
    xpReward: dayRow.xp_reward,
    isCompleted: dayRow.is_completed,
    dayNumber: dayRow.day_number,
  };

  const specToolsCtx: SpecializationContext = {
    lesson: {
      dayId,
      topic: dayRow.topic,
      description: dayRow.description,
      subject: config?.subject || dayRow.topic || "",
      learningStyle: dayRow.learning_style,
    },
    profile: {
      stage: eduVideoCtx.stage,
      grade: eduVideoCtx.grade,
      track: eduVideoCtx.track,
      faculty: eduVideoCtx.faculty,
      field: userProfileField,
    },
    planProgress,
    supabase,
  };

  return (
    <LessonShell>
      <LessonStudioProvider lesson={lesson} edu={eduVideoCtx}>
        <StudioShell
          subject={config?.subject}
          title={dayRow.topic}
          description={dayRow.description}
          xpReward={dayRow.xp_reward}
          dayNumber={dayRow.day_number}
          isCompleted={dayRow.is_completed}
          ctaState={ctaState}
          isSaved={isSaved}
          onToggleSave={() => setIsSaved((v) => !v)}
          isFavorite={isBookmarked}
          onToggleFavorite={() => setIsBookmarked((v) => !v)}
          onShare={handleShareLesson}
          examHref={`/exams?gen=1${config?.subject ? `&subject=${encodeURIComponent(config.subject)}` : ""}&dayId=${encodeURIComponent(dayId)}`}
          unitDays={unitDays}
          planProgress={planProgress}
          dayId={dayId}
          topic={dayRow.topic}
          quizSubject={config?.subject || ""}
          quizDescription={dayRow.description}
          nextDayId={nextDayId}
          onComplete={() =>
            setPlanProgress((prev) => (prev ? { ...prev, completed: Math.min(prev.completed + 1, prev.total) } : prev))
          }
          onCelebrationToggle={setCelebrationOpen}
          edu={eduVideoCtx}
          learningStyle={dayRow.learning_style}
          onLearningStyleChange={(style) => void changeLearningStyle(style)}
          resourceLinks={dayRow.resource_links}
          onResourceLinksChange={(links) => setDayRow((prev) => (prev ? { ...prev, resource_links: links } : prev))}
          specToolsCtx={specToolsCtx}
          feedback={<FeedbackWidget page="lesson" featureLabel="صفحة الدرس" enabled={!celebrationOpen} />}
        />
      </LessonStudioProvider>
    </LessonShell>
  );
}
