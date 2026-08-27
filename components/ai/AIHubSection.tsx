"use strict";
import React from "react";
import { AgentLauncher } from "@/components/ai/AgentLauncher";

export interface RoleAgentCard { agentId: string; title: string; description: string; mode?: string; }

export function AIHubSection({ role = "student", initialContext }: { role?: string; initialContext?: any }) {
  const cards: RoleAgentCard[] = role === "freelancer"
    ? [
        { agentId: "freelance", title: "Freelance Assistant", description: "نظم مشروعك / العميل / السعر" },
        { agentId: "writing", title: "Writing Assistant", description: "اكتب مسودة أو مراجعة", mode: "writing" },
        { agentId: "document_analyzer", title: "Document Analyzer", description: "ارفع وثيقة / ملف", mode: "analyze" },
        { agentId: "research", title: "Research Assistant", description: "جرب بحثًا", mode: "general" },
        { agentId: "planner", title: "Planner", description: "نظم يومك", mode: "planning" },
        { agentId: "language", title: "Language Tutor", description: "تعلم لغة جديدة", mode: "conversation" },
      ]
    : role === "graduate"
    ? [
        { agentId: "career", title: "Career Coach", description: "توجيه مهني", mode: "career_guidance" },
        { agentId: "study_tutor", title: "Study Tutor", description: "اشرح درس", mode: "conversation" },
        { agentId: "exam_solver", title: "Exam Solver", description: "حلل سؤال", mode: "general" },
        { agentId: "quiz_generator", title: "Quiz Generator", description: "اختبر نفسك", mode: "general" },
        { agentId: "document_analyzer", title: "Document Analyzer", description: "تحليل وثيقة", mode: "analyze" },
        { agentId: "research", title: "Research Assistant", description: "ابحث", mode: "general" },
        { agentId: "planner", title: "Planner", description: "خطة يوم / هدف", mode: "planning" },
        { agentId: "language", title: "Language Tutor", description: "تعلم لغة", mode: "conversation" },
      ]
    : [ // student
        { agentId: "study_tutor", title: "Study Tutor", description: "اشرح درس", mode: "conversation" },
        { agentId: "exam_solver", title: "Exam Solver", description: "حل سؤال خطوة بخطوة", mode: "general" },
        { agentId: "quiz_generator", title: "Quiz Generator", description: "اختبر نفسك", mode: "general" },
        { agentId: "document_analyzer", title: "Document Analyzer", description: "ارفع ملف وخليه يتفهم", mode: "analyze" },
        { agentId: "research", title: "Research Assistant", description: "ابحث حسب السياق", mode: "general" },
        { agentId: "language", title: "Language Tutor", description: "تعلم لغة", mode: "conversation" },
        { agentId: "planner", title: "Planner", description: "نظم خطة دراسة", mode: "planning" },
        { agentId: "image", title: "Image Agent", description: "فهم / تحليل / طلب صورة", mode: "general" },
      ];

  return (
    <section aria-label="AI Tools" className="max-w-[720px] mx-auto px-4 py-5" dir="rtl">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-2 h-2 rounded-full bg-[var(--red)]" aria-hidden />
        <h2 className="font-display font-bold text-[1.1rem] text-[var(--ink)]">الأدوات الذكية — حسب دورك</h2>
        <span className="font-mono text-[11px] text-[var(--ink-soft)] bg-[var(--paper-3)] rounded-full px-2.5 py-0.5">{role}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(c => (
          <AgentLauncher
            key={c.agentId}
            agentId={c.agentId}
            title={c.title}
            description={c.description}
            userRole={role}
            context={initialContext || { role, preferences: { language: "ar", level: "intermediate" } }}
            mode={c.mode}
          />
        ))}
      </div>
    </section>
  );
}
