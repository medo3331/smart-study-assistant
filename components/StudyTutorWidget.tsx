"use client";
import React, { useState } from "react";
import { studyTutorAgent } from "@/lib/ai/agents/study-tutor";

export interface StudyTutorWidgetProps {
  userRole?: string;
  field?: string;
  subject?: string;
  studentLevel?: string;
  currentLesson?: string;
  progress?: string;
  language?: string;
  onResult?: (r: any) => void;
}

export function StudyTutorWidget(props: StudyTutorWidgetProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleAsk = async () => {
    if (!input.trim()) return;
    setLoading(true);
    try {
      const ctx = {
        role: props.userRole ?? "student",
        language: props.language ?? "ar",
        educationLevel: props.studentLevel,
        preferences: {
          subject: props.subject ?? "unknown",
          field: props.field ?? props.subject ?? "unknown",
          currentLesson: props.currentLesson ?? "current",
          progress: props.progress ?? "unknown",
          learningStyle: "mixed",
        },
      };
      // Direct agent call passes context; router/inference handled by agent layer or router
      const r = await studyTutorAgent({ prompt: input, context: ctx });
      setResult(r);
      props.onResult?.(r);
    } catch (e: any) {
      setResult({ ok: false, agent: "study_tutor", code: "WIDGET_ERROR", message: e?.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  };

  const isAr = (props.language ?? "ar").startsWith("ar");

  return (
    <div className="p-4 rounded-xl border border-rule bg-paper-2" dir={isAr ? "rtl" : "ltr"}>
      <h3 className="font-display font-bold text-ink text-base mb-3">{isAr ? "المساعد الشخصي — الدرس" : "Study Tutor — Lesson"}</h3>
      <div className="flex gap-2 mb-3">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAsk()}
          placeholder={isAr ? "اشرح لي الجزء ده / اختبرني / مش فاهم النقطة دي" : "Explain this / Test me / I don\'t get this point"}
          className="flex-1 rounded-md px-3 py-2 text-sm bg-white border border-rule text-ink"
        />
        <button onClick={handleAsk} disabled={loading} className="rounded-md px-4 py-2 text-sm font-bold text-white bg-gradient-to-b" style={{ background: "linear-gradient(180deg,#F5DE72,#E2C95C)" }}>
          {loading ? (isAr ? "جارٍ..." : "...") : (isAr ? "اسأل" : "Ask")}
        </button>
      </div>
      {result && (
        <div className="rounded-lg p-3 bg-paper-3 text-sm leading-relaxed text-ink whitespace-pre-line">{result.ok ? (result.content ?? (isAr ? "تم الرد." : "Answered.")) : (result.message ?? (isAr ? "حدث خطأ — جرب مرة أخرى." : "Error — retry."))}</div>
      )}
      <div className="mt-2 text-[11px] text-ink-soft font-mono">agent: study_tutor · provider: {result?.provider ?? "router"}</div>
    </div>
  );
}
