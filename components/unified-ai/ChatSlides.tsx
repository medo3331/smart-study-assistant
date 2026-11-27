"use client";

/**
 * 📊 عارض شرائح داخل الشات — من جواب المساعد مباشرة عبر /api/generate-slides.
 *
 * 🚨 **ليه هنا:** خط توليد الشرائح كان موجود بس محبوس في صفحة
 *    /dashboard/slides — الطالب اللي بيشرح في الشات كان لازم يسيب الشات.
 *    العرض كله client-side (نفس فلسفة generate-slides: الـ route بيرجّع JSON بس).
 */

import { useState } from "react";

export interface ChatSlide {
  title: string;
  bullets: string[];
  note: string;
  code: string | null;
}

export function ChatSlides({ topic, slides }: { topic: string; slides: ChatSlide[] }) {
  const [idx, setIdx] = useState(0);
  const slide = slides[Math.min(idx, slides.length - 1)];
  if (!slide) return null;

  return (
    <div className="mt-2 rounded-xl border border-[var(--rule)] bg-paper overflow-hidden" dir="rtl">
      <div className="flex items-center justify-between px-3 py-2 bg-paper-3 border-b border-[var(--rule)]">
        <span className="text-xs font-bold text-ink truncate">{topic}</span>
        <span className="text-[10px] text-ink-soft whitespace-nowrap">{idx + 1} / {slides.length}</span>
      </div>
      <div className="px-4 py-3">
        <h4 className="text-sm font-bold text-ink mb-2">{slide.title}</h4>
        <ul className="list-disc pe-5 space-y-1 text-[13px] text-ink">
          {slide.bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
        {slide.note && <p className="mt-2 text-[11px] text-ink-soft border-t border-[var(--rule)] pt-2">🗣 {slide.note}</p>}
        {slide.code && (
          <pre className="mt-2 bg-slate-900 text-purple-200 rounded-lg p-2 text-xs overflow-x-auto" dir="ltr">
            <code>{slide.code}</code>
          </pre>
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--rule)]">
        <button
          type="button"
          onClick={() => setIdx((v) => Math.max(0, v - 1))}
          disabled={idx === 0}
          className="text-xs font-bold px-3 py-1 rounded-lg border border-[var(--rule)] text-ink disabled:opacity-40 hover:bg-paper-3 transition"
        >
          ‹ السابق
        </button>
        <div className="flex gap-1">
          {slides.map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === idx ? "bg-[var(--accent)]" : "bg-rule"}`} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setIdx((v) => Math.min(slides.length - 1, v + 1))}
          disabled={idx === slides.length - 1}
          className="text-xs font-bold px-3 py-1 rounded-lg border border-[var(--rule)] text-ink disabled:opacity-40 hover:bg-paper-3 transition"
        >
          التالي ›
        </button>
      </div>
    </div>
  );
}
