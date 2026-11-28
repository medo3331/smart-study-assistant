"use client";

import React from "react";
import { Reveal } from "../components/LessonChrome";
import { LessonBreadcrumb, LessonUnitProgress } from "../components/LessonBreadcrumb";
import { LessonHero } from "../components/LessonHero";
import type { SpecializationContext } from "@/lib/education/specialization";
import { useLessonStudio } from "./LessonStudioProvider";
import { StudioBottomBar, StudioTabsBar } from "./StudioTabs";
import StudyNavigator from "./navigator/StudyNavigator";
import LearnTab, { type LearningStyle, type ResourceLink } from "./tabs/LearnTab";
import VideoCenterTab from "./tabs/VideoCenterTab";
import NotesTab from "./tabs/NotesTab";
import PracticeLabTab from "./tabs/PracticeLabTab";
import TutorTab from "./tabs/TutorTab";
import TutorPanel, { TutorChatHost } from "./tools/TutorPanel";
import NotebookPanel from "./tools/NotebookPanel";
import MiniVideoPlayer from "./video/MiniVideoPlayer";

/* ==========================================================================
   StudioShell (P1-3) — تخطيط الـ Studio:
   Header (مسار + تقدّم الوحدة + Hero) ثم grid RTL:
     Navigator (يمين، قابل للقفل) | منطقة المحتوى (التابات) | AI Panel (شمال، xl+)
   التابات **keep-mounted** بـ CSS `hidden` — مش unmount — عشان الـ state مايتمسش.
   الموبايل: تابات علوية + Bottom Action Bar + أدوات bottom sheet/panel.
   ========================================================================== */

interface StudioShellProps {
  subject?: string;
  title: string;
  description: string;
  xpReward: number;
  dayNumber: number;
  isCompleted: boolean;
  ctaState: "start" | "continue" | "review";
  isSaved: boolean;
  onToggleSave: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onShare: () => void;
  examHref?: string;
  unitDays: { day_number: number; is_completed: boolean }[];
  planProgress: { completed: number; total: number } | null;
  dayId: string;
  topic: string;
  quizSubject: string;
  quizDescription: string;
  nextDayId: string | null;
  onComplete: () => void;
  onCelebrationToggle: (open: boolean) => void;
  edu: { stage?: string; grade?: string; track?: string; faculty?: string };
  learningStyle: LearningStyle;
  onLearningStyleChange: (style: LearningStyle) => void;
  resourceLinks: ResourceLink[];
  onResourceLinksChange: (links: ResourceLink[]) => void;
  specToolsCtx: SpecializationContext;
  feedback: React.ReactNode;
}

export default function StudioShell(props: StudioShellProps) {
  const studio = useLessonStudio();
  const { activeTab, navigatorOpen, toggleNavigator } = studio;

  return (
    <div className="min-h-screen p-4 pb-28 sm:p-6 sm:pb-28 lg:pb-10 md:p-10 font-sans text-[var(--text)]" dir="rtl">
      <div className="mx-auto max-w-[1500px] space-y-5">
        {/* ─── فاتحة الصفحة: مسار التنقل ─── */}
        <Reveal index={0}>
          <LessonBreadcrumb subject={props.subject} title={props.title} />
        </Reveal>

        {/* ─── تقدّم الوحدة المجزّأ ─── */}
        {props.unitDays.length > 0 && (
          <Reveal index={1}>
            <LessonUnitProgress days={props.unitDays} currentDayNumber={props.dayNumber} />
          </Reveal>
        )}

        {/* ─── هيرو الدرس — CTA بيبدّل لتاب Learn بدل scroll ─── */}
        <Reveal index={2}>
          <LessonHero
            subject={props.subject}
            title={props.title}
            description={props.description}
            xpReward={props.xpReward}
            state={props.ctaState}
            onStart={() => studio.setActiveTab("learn")}
            isSaved={props.isSaved}
            onToggleSave={props.onToggleSave}
            isFavorite={props.isFavorite}
            onToggleFavorite={props.onToggleFavorite}
            onShare={props.onShare}
            examHref={props.examHref}
          />
        </Reveal>

        {/* ─── شريط التابات العلوي ─── */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <StudioTabsBar />
          </div>
          <button
            onClick={toggleNavigator}
            aria-pressed={navigatorOpen}
            className="btn btn-quiet text-xs px-3 py-2.5 shrink-0"
            title="أقسام الدرس والتقدّم"
          >
            🧭 الدرس
          </button>
        </div>

        {/* ─── الصف الرئيسي (RTL): Navigator يمين | المحتوى | AI Panel شمال (xl+) ─── */}
        <div className="flex flex-col lg:flex-row gap-4 lg:items-start">
          {/* Navigator — drawer من اليمين على الموبايل */}
          {navigatorOpen && (
            <>
              <div className="lg:hidden fixed inset-0 z-[58] bg-ink/45" onClick={toggleNavigator} aria-hidden />
              <aside className="lg:hidden fixed top-0 right-0 bottom-0 z-[59] w-80 max-w-[85vw] overflow-y-auto bg-[var(--app-bg)] p-4 border-s border-[var(--border)]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-bold text-ink">🧭 التنقّل في الدرس</span>
                  <button onClick={toggleNavigator} className="btn btn-quiet text-xs px-2.5 py-1.5" aria-label="إغلاق التنقّل">
                    ✕
                  </button>
                </div>
                <StudyNavigator planProgress={props.planProgress} />
              </aside>
              {/* عمود ثابت على الشاشات الواسعة */}
              <aside className="hidden lg:block w-60 xl:w-64 shrink-0 lg:sticky lg:top-4">
                <StudyNavigator planProgress={props.planProgress} />
              </aside>
            </>
          )}

          {/* منطقة المحتوى — التابات الخمسة keep-mounted (CSS hidden) */}
          <main className="flex-1 min-w-0">
            <div className={activeTab === "learn" ? "" : "hidden"}>
              <LearnTab
                dayId={props.dayId}
                topic={props.topic}
                subject={props.quizSubject}
                edu={props.edu}
                learningStyle={props.learningStyle}
                onLearningStyleChange={props.onLearningStyleChange}
                resourceLinks={props.resourceLinks}
                onResourceLinksChange={props.onResourceLinksChange}
                specToolsCtx={props.specToolsCtx}
              />
            </div>
            <div className={activeTab === "video" ? "" : "hidden"}>
              <VideoCenterTab subject={props.quizSubject} topic={props.topic} learningStyle={props.learningStyle} />
            </div>
            <div className={activeTab === "notes" ? "" : "hidden"}>
              <NotesTab />
            </div>
            <div className={activeTab === "practice" ? "" : "hidden"}>
              <PracticeLabTab
                dayId={props.dayId}
                topic={props.topic}
                subject={props.quizSubject}
                description={props.quizDescription}
                xpReward={props.xpReward}
                isCompleted={props.isCompleted}
                onComplete={props.onComplete}
                nextDayId={props.nextDayId}
                dayNumber={props.dayNumber}
                onCelebrationToggle={props.onCelebrationToggle}
              />
            </div>
            <div className={activeTab === "tutor" ? "" : "hidden lg:hidden"}>
              <TutorTab />
            </div>
          </main>

          {/* AI Panel — شمال، docked على xl+ */}
          <aside className="hidden xl:block w-80 shrink-0 xl:sticky xl:top-4 h-[calc(100dvh-8rem)]">
            <TutorPanel />
          </aside>
        </div>

        {/* الموبايل (< xl): زر عائم يفتح تاب الـ Tutor */}
        <button
          onClick={() => studio.setActiveTab("tutor")}
          className="xl:hidden fixed bottom-24 right-4 z-[60] inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] text-[var(--on-marker)] px-4 h-11 text-xs font-bold shadow-[0_8px_24px_color-mix(in_srgb,var(--accent)_40%,transparent)]"
        >
          ✨ المساعد
        </button>

        {props.feedback}
      </div>

      {/* ─── الطبقات العائمة: النوتة + الميني بلاير + الشات الواحد ─── */}
      <NotebookPanel />
      <MiniVideoPlayer />
      <TutorChatHost />
      <StudioBottomBar />
    </div>
  );
}
