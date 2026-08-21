"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, EmptyState, LoadingSheets, DataNotice, usePenTheme } from "../components/PageShell";
import { useAuthUser, formatArabicDate } from "../components/use-page-data";
import { THEME_STYLES } from "../components/theme-helpers";
import {
  fetchCourses,
  fetchActiveCourseId,
  setActiveCourse,
  deleteCourse,
  type CourseSummary,
} from "@/lib/pages-data";

/* ==========================================================================
   الكورسات — كل تراكاتك في مكان واحد

   الداشبورد بتشتغل على تراك واحد في المرة. الصفحة دي بتوري كل التراكات اللي
   عملتها، وبتخليك تبدّل بينهم أو تشيل اللي خلص.

   التبديل بيتخزن في الحساب (profiles.active_config_id) مش على الجهاز —
   تختار تراك من اللابتوب تلاقيه مفتوح على الموبايل.

   الجداول (study_configs + study_days) موجودة من الأصل. الجديد هو عمود
   active_config_id في profiles — موجود في db/pages.sql.
   ========================================================================== */

/** نسبة الخلاص. صفر أيام = صفر بالمية، مش قسمة على صفر. */
function progressPercent(course: CourseSummary): number {
  if (course.totalDays === 0) return 0;
  return Math.round((course.completedDays / course.totalDays) * 100);
}

export default function CoursesPage() {
  const router = useRouter();
  const { supabase, session } = useAuthUser();
  const themeStyles = THEME_STYLES[usePenTheme()];

  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  // التراك المفتوح حالياً — بيتقرا من الحساب مش الجهاز
  const [activeId, setActiveId] = useState<string | null>(null);

  // التراك اللي بيتشال دلوقتي — عشان نقفل زراره بس هو
  const [busyId, setBusyId] = useState<string | null>(null);

  // جلب التراك المفتوح من البروفايل
  useEffect(() => {
    if (session.status !== "ready") return;
    (async () => {
      const { data, error } = await fetchActiveCourseId(supabase, session.user.id);
      // العمود ناقص أو الاستعلام فشل؟ نسيب activeId فاضي — العرض بيرجع
      // لأحدث تراك، وهو نفس اللي الداشبورد هتفتحه. رسالة الخطأ بتيجي من
      // تحميل التراكات نفسه، فمافيش داعي نكرّرها هنا.
      if (!error) setActiveId(data);
    })();
  }, [session, supabase]);

  /* ---- تحميل التراكات ---- */
  useEffect(() => {
    if (session.status === "loading") return;

    if (session.status === "anonymous") {
      router.push("/dashboard");
      return;
    }
    if (session.status === "error") {
      setNotice(session.message);
      setIsLoading(false);
      return;
    }

    (async () => {
      const { data, error } = await fetchCourses(supabase, session.user.id);
      if (error) setNotice(error.message);
      else setCourses(data);
      setIsLoading(false);
    })();
  }, [session, supabase, router]);

  /* ---- افتح تراك: اكتب الاختيار في الحساب وارجع للداشبورد ---- */
  const handleOpen = async (course: CourseSummary) => {
    if (session.status !== "ready") return;

    const { error } = await setActiveCourse(supabase, session.user.id, course.id);
    if (error) {
      setNotice(error.message);
      return;
    }

    setActiveId(course.id);
    router.push("/dashboard");
  };

  /* ---- شيل تراك ---- */
  const handleDelete = async (course: CourseSummary) => {
    if (session.status !== "ready") return;

    const isActive = effectiveActiveId === course.id;
    const warning = isActive
      ? `«${course.subject}» هو التراك المفتوح حالياً. لو شيلته هتتنقل لتراك تاني.\n\n`
      : "";

    if (!confirm(`${warning}متأكد إنك عايز تشيل «${course.subject}» وكل أيامه؟ الخطوة دي لا يمكن التراجع عنها.`)) {
      return;
    }

    setBusyId(course.id);
    const { error } = await deleteCourse(supabase, course.id);
    setBusyId(null);

    if (error) {
      setNotice(error.message);
      return;
    }

    setCourses((prev) => prev.filter((c) => c.id !== course.id));

    // لو المختار اتشال، الداشبورد هترجع لأحدث تراك لوحدها
    // (profiles.active_config_id اتصفّر لوحده بـ on delete set null)
    if (activeId === course.id) {
      setActiveId(null);
    }
  };

  /* ---- التراك اللي الداشبورد فعلاً هتفتحه ----
     لو مافيش اختيار محفوظ (أو المحفوظ اتشال)، الداشبورد بتفتح أحدث تراك.
     فبنوري نفس الحقيقة دي مش «مافيش مفتوح». */
  const effectiveActiveId = activeId && courses.some((c) => c.id === activeId) ? activeId : courses[0]?.id ?? null;

  const newCourseButton = (
    <button onClick={() => router.push("/assessment")} className="btn btn-marker text-sm">
      تراك جديد
    </button>
  );

  return (
    <PageShell
      eyebrow="الكورسات"
      title="تراكاتك"
      lede="كل خطة مذاكرة عملتها موجودة هنا. اختار اللي عايز تكمّل فيه والداشبورد بتفتح عليه، أو ابدأ تراك جديد لموضوع تاني."
      action={newCourseButton}
      feedbackPage="courses"
      feedbackLabel="صفحة الكورسات"
    >
      {notice && <DataNotice message={notice} />}

      {isLoading ? (
        <LoadingSheets count={3} />
      ) : courses.length === 0 ? (
        <EmptyState
          icon="📚"
          title="مافيش تراكات لسه"
          body="ابدأ أول تراك — قول إيه اللي عايز تتعلمه والخطة بتتولّد لك على مراحل."
          action={newCourseButton}
        />
      ) : (
        <div className="space-y-3">
          <p className="tag">
            <span className="ltr-num">{courses.length}</span> تراك
          </p>

          {courses.map((course) => {
            const percent = progressPercent(course);
            const isActive = course.id === effectiveActiveId;

            return (
              <div
                key={course.id}
                className={`sheet-card p-5 space-y-4 ${isActive ? "sheet-card-live" : ""}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-display font-extrabold text-base text-ink leading-tight break-words">
                        {course.subject}
                      </h2>
                      {isActive && <span className="tag">مفتوح حالياً</span>}
                    </div>
                    <p className="tag mt-1">
                      {course.category && <span>{course.category}</span>}
                      {course.subCategory && <span>{course.subCategory}</span>}
                      <span>{formatArabicDate(course.createdAt)}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isActive && (
                      <button onClick={() => handleOpen(course)} className="btn btn-marker text-sm">
                        افتحه
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(course)}
                      disabled={busyId === course.id}
                      className="mono text-ink-soft hover:text-redpen px-2 py-1.5 rounded-[6px] transition disabled:opacity-50"
                    >
                      {busyId === course.id ? "بيشيل…" : "شيله"}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="tag">
                      <span className="ltr-num">
                        {course.completedDays}/{course.totalDays || course.daysCount}
                      </span>
                      <span>مرحلة خلصت</span>
                    </p>
                    <span className="mono text-ink-soft ltr-num">{percent}%</span>
                  </div>
                  <div className="meter meter-sm">
                    <div
                      className={`meter-fill ${themeStyles.accentBg}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
