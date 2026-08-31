"use client";

import React from "react";
import { AIStudyCoach } from "@/components/AIStudyCoach";
import type { CoachTask } from "@/components/AIStudyCoach";

interface HeroSectionProps {
  displayName: string;
  coachTasks: CoachTask[];
}

/**
 * Phase 4: kept only AIStudyCoach (light mascot briefing).
 * The lower "التركيز الحالي" card removed — it duplicated CurrentStepCard
 * (same currentTask.topic, same progress meter, same scroll handler).
 * CurrentStepCard is now the single WHAT SHOULD I DO NOW surface.
 */
export function HeroSection({ displayName, coachTasks }: HeroSectionProps) {
  return (
    <>
      {/* ورقة ماجيك (AI Study Coach) - رسالة الصباح بمهام اليوم */}
      <AIStudyCoach userName={displayName} tasks={coachTasks} />
    </>
  );
}
