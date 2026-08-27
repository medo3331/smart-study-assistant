"use client";

import React, { useState } from "react";
import { PageShell, DataNotice } from "../components/PageShell";
import { AgentLauncher } from "@/components/ai/AgentLauncher";

/* ================================================================
   صفحة وكلاء الذكاء — تعرض الـ 10 وكلاء نصوص حقيقيين مع
   AgentLauncher حقيقي (AgentRouter / AiRouter / NVIDIA).
   ================================================================ */

const TEXT_AGENTS = [
  { id: "study_tutor", title: "Study Tutor", description: "اشرح درس أو مفهوم خطوة بخطوة حسب مستواك", mode: "conversation" },
  { id: "exam_solver", title: "Exam Solver", description: "حلّ سؤال خطوة بخطوة مع توضيح الإجابة", mode: "general" },
  { id: "quiz_generator", title: "Quiz Generator", description: "ولّد اختبارًا من درس أو وثيقة", mode: "general" },
  { id: "document_analyzer", title: "Document Analyzer", description: "ارفع وثيقة أو ملف وخليه يتفهم ويستخرج منه", mode: "analyze" },
  { id: "research", title: "Research", description: "تحليل ومقارنات وتقارير بناءً على السياق", mode: "general" },
  { id: "writing", title: "Writing Assistant", description: "مساعد كتابة أكاديمي ومحتوى عام", mode: "writing" },
  { id: "language", title: "Language Tutor", description: "تدريب لغات ومحادثة موجّهة حسب المستوى", mode: "conversation" },
  { id: "planner", title: "Planner", description: "خطط للدراسة والمهام بجداول زمنية", mode: "planning" },
  { id: "career", title: "Career Coach", description: "توجيه مهني وسير ذاتية ومقابلات", mode: "career_guidance" },
  { id: "freelance", title: "Freelance Assistant", description: "عروض، تفاوض، وإدارة مشاريع", mode: "writing" },
];

export default function AgentsPage() {
  const [selectedAgentId, setSelectedAgentId] = useState<string>(TEXT_AGENTS[0].id);
  const selectedAgent = TEXT_AGENTS.find((a) => a.id === selectedAgentId) || TEXT_AGENTS[0];

  return (
    <PageShell
      eyebrow="AI Agents"
      title="وكلاء الذكاء"
      lede="اختَر الوكيل وشغّله مباشرة — الـRouter يختار المزود المناسب تلقائيًا (NVIDIA أولًا)."
      feedbackPage="agents"
      feedbackLabel="وكلاء الذكاء"
    >
      <DataNotice message="كل وكيل يستخدم AgentRouter / AiRouter الحقيقي مع NVIDIA كأولوية." />

      {/* ═══ شبكة الوكلاء الـ 10 ═══ */}
      <section aria-label="الوكلاء المتاحة" className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {TEXT_AGENTS.map((agent) => (
          <button
            key={agent.id}
            type="button"
            onClick={() => setSelectedAgentId(agent.id)}
            aria-pressed={selectedAgentId === agent.id}
            className={`sheet-card p-4 text-right transition border-2 ${
              selectedAgentId === agent.id ? "border-[var(--red)] bg-paper-3" : "border-rule hover:border-rule-strong"
            }`}
          >
            <p className="font-display font-extrabold text-sm">{agent.title}</p>
            <p className="text-xs text-ink-soft leading-relaxed mt-1">{agent.description}</p>
            <p className="font-mono text-[10px] text-[var(--ink-soft)] mt-2">agent: {agent.id}</p>
          </button>
        ))}
      </section>

      {/* ═══ تشغيل الوكيل المحدد ═══ */}
      <section aria-label="تشغيل الوكيل" className="max-w-2xl mx-auto">
        <AgentLauncher
          agentId={selectedAgent.id}
          title={selectedAgent.title}
          description={selectedAgent.description}
          userRole="student"
          context={{ language: "ar", preferences: { language: "ar", level: "intermediate" } }}
          mode={selectedAgent.mode}
          initialPrompt={selectedAgent.id === "study_tutor" ? "اشرح قانون نيوتن الثاني في سطر واحد." : ""}
        />
      </section>

      {/* ═══ ملاحظة التصميم ═══ */}
      <section className="sheet-card p-4 space-y-2">
        <p className="eyebrow eyebrow-flush">ملاحظات التصميم</p>
        <ul className="text-xs text-ink-soft leading-relaxed list-disc list-inside space-y-1">
          <li>Image Agent مؤجل (Deferred) — غير معروض هنا.</li>
          <li>كل وكيل يستخدم AgentRouter حقيقي (لا Fake Result).</li>
          <li>NVIDIA هو المزود الأساسي للمهمة "tutor"؛ الراوتر يختاره تلقائيًا.</li>
          <li>الصفحة لا تُعيد تنفيذ أي منطق وكيل — فقط تعرضهم عبر AgentLauncher.</li>
          <li>صفحة /dashboard لا تعرض قسم AI Tools بعد الآن.</li>
        </ul>
      </section>
    </PageShell>
  );
}
