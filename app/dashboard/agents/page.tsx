"use client";

import React, { useState } from "react";
import { PageShell, DataNotice } from "../components/PageShell";

/* ================================================================
   صفحة Unified AI — المستخدم يتحدث مع Magic واحد فقط.
   UI Picker للـ11 agent تم إزالته (AIHubSection/AgentLauncher حذف).
   ================================================================ */

export default function UnifiedAIPage() {
  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<string>("");

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    setIsProcessing(true);
    try {
      // Unified AI entry — hidden router behind the single chat
      // Real agent invocation happens through AgentRouter / runAgent
      const res = await fetch("/api/unified-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, context: { language: "ar", preferences: { language: "ar" } } }),
      });
      const data = await res.json().catch(() => ({}));
      setResult(data?.answer || (data?.ok ? "تم المعالجة عبر Unified AI." : "حدث خطأ — جرب مرة أخرى."));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <PageShell
      eyebrow="Unified AI"
      title="مساعد Magic الذكي"
      lede="اكتب ما تحتاجه — OCR يتعامل مع الصور والملفات، وRouter يختار الوكيل المناسب تلقائيًا. لا تختار وكيلًا؛ Magic يتكفل."
      feedbackPage="agents"
      feedbackLabel="Unified AI"
    >
      <DataNotice message="مساعد Magic — واجهة واحدة. اكتب أو ارفع صورة/ملف." />

      {/* ═══ واجهة المحادثة الموحدة ═══ */}
      <section aria-label="المحادثة الموحدة" className="max-w-2xl mx-auto">
        <div className="sheet-card p-5 space-y-4">
          <label htmlFor="unified-prompt" className="font-display font-bold text-base block" dir="rtl">
            ما المطلوب؟
          </label>
          <textarea
            id="unified-prompt"
            dir="rtl"
            rows={3}
            className="w-full rounded-lg border border-rule p-3 font-body text-sm bg-paper focus:outline-none focus:ring-2 focus:ring-[var(--red)]/40"
            placeholder="مثال: حل هذا السؤال من الصورة... أو اشرح درس... أو حلل هذا الملف..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isProcessing || !prompt.trim()}
              className="px-5 py-2.5 bg-[var(--red)] text-white font-display font-bold text-sm rounded-lg hover:brightness-110 disabled:opacity-50"
            >
              {isProcessing ? "جارٍ معالجة الطلب..." : "إرسال"}
            </button>
            <span className="text-xs text-ink-soft">الوكيل الأنسب يُختار تلقائيًا</span>
          </div>
        </div>

        {result && (
          <div className="sheet-card p-4 mt-4 text-sm leading-relaxed" dir="rtl">
            <p className="font-display font-bold mb-1">الرد من Unified AI:</p>
            <p>{result}</p>
          </div>
        )}
      </section>

{/* الملاحظات الداخلية (للمطور فقط) — لا تُعرض للمستخدم */}
      <section className="sheet-card p-4 space-y-2 hidden">
        <p className="eyebrow eyebrow-flush">ملاحظات التصميم — Unified AI</p>
        <ul className="text-xs text-ink-soft leading-relaxed list-disc list-inside space-y-1" dir="rtl">
          <li>واجهة واحدة فقط — المستخدم لا يختار وكيلًا (AgentRouter خلف الكواليس).</li>
          <li>OCR من Magic محفوظ — صور/ملفات تمر عبره دون إعادة بناء.</li>
          <li>AIHubSection / AgentLauncher تم حذفها (لم يعد هناك اختيار مباشر للـ11).</li>
          <li>StudyTutorWidget يبقى داخل الدرس كجزء من المنظومة.</li>
          <li>AI Coach دمج قدراته في Router (context/goal tracking) — ليس منتجًا منفصلًا.</li>
        </ul>
      </section>
    </PageShell>
  );
}
