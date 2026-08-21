"use client";

import React from "react";
import { motion } from "framer-motion";
import { AIStudyCoach } from "@/components/AIStudyCoach";
import type { CoachTask } from "@/components/AIStudyCoach";
import type { StudyDay, ThemeStyles, UiText } from "./types";

interface HeroSectionProps {
  displayName: string;
  coachTasks: CoachTask[];
  days: StudyDay[];
  currentDayNumber: number;
  completedCount: number;
  themeStyles: ThemeStyles;
  uiText: UiText;
}

export function HeroSection({
  displayName,
  coachTasks,
  days,
  currentDayNumber,
  completedCount,
  themeStyles,
  uiText,
}: HeroSectionProps) {
  const currentTask = days.find((d) => d.day === currentDayNumber);
  const progress = days.length > 0 ? Math.round((completedCount / days.length) * 100) : 0;

  const handleStartStudying = () => {
    if (!currentTask) return;
    const el = document.getElementById(`day-${currentTask.day}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <>
      {/* ✅ ورقة ماجيك (AI Study Coach) - رسالة الصباح بمهام اليوم */}
      <AIStudyCoach userName={displayName} tasks={coachTasks} />

      {/* ✅ "التركيز الحالي" — أهم كارت في الصفحة، فهو الوحيد اللي بياخد
          ضربة القلم الفسفوري على عنوان الدرس. باقي الصفحة بتفضل هادية
          عشان الضربة دي تفضل معناها "دي المهمة اللي قدامك". */}
      {days.length > 0 && currentTask && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="sheet-card sheet-card-live p-6 space-y-4"
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow eyebrow-flush">{uiText.stepPrefix} الحالي</p>
            <span className="mono text-ink-soft shrink-0">
              <span className="ltr-num tnum">
                <span className="font-bold text-ink">{completedCount}</span> / {days.length}
              </span>{" "}
              مكتمل
            </span>
          </div>

          <h2 className="h2">
            <span className="mark mark-tilt">{currentTask.topic}</span>
          </h2>

          {currentTask.description && (
            <p className="small muted m-0">{currentTask.description}</p>
          )}

          <div className="meter meter-sm">
            <motion.div
              className={`meter-fill ${themeStyles.accentBg}`}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          </div>

          {/* الإجراء الأساسي بلون قلم المستخدم، مش الأصفر الثابت — المستخدم
              اختار قلمه من الإعدادات، فالزرار المهم يفضل بنفس اللون ده. */}
          <button
            onClick={handleStartStudying}
            className={`btn btn-block ${themeStyles.accentBg} text-onmarker hover:opacity-90`}
          >
            ابدأ المذاكرة
          </button>
        </motion.div>
      )}
    </>
  );
}
