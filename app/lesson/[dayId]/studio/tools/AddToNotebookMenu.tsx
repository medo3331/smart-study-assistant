"use client";

import React, { useEffect, useRef, useState } from "react";
import { useNotebook, type NotebookDraft } from "../LessonStudioProvider";

/* ==========================================================================
   AddToNotebookMenu — قائمة «حوّل لـ» (§4.3):
   Note (شغّال في P1 — queueDraft ⇒ Preview ⇒ موافقة ⇒ postMessage)
   · Flashcard · MCQ · Mind Map — disabled («جاي قريبًا» — P4/P5).
   ========================================================================== */

export default function AddToNotebookMenu({
  buildDraft,
  label = "أضف للنوتة",
  className = "btn btn-quiet text-xs px-3 py-2",
}: {
  /** بناء مسودة النوتة لحظة الضغط (نص الشرح/الفيديو/الملخص). */
  buildDraft: () => NotebookDraft | null;
  label?: string;
  className?: string;
}) {
  const { queueNotebookDraft } = useNotebook();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // قفل القائمة بأي ضغطة بره — بدون مكتبات.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const upcoming = (label: string) => (
    <button
      key={label}
      type="button"
      disabled
      title="جاي قريبًا"
      className="w-full text-right rounded-lg px-3 py-2 text-xs text-ink-soft opacity-50 cursor-not-allowed flex items-center justify-between gap-2"
    >
      <span>{label}</span>
      <span className="tag tag-quiet text-[9px]">جاي قريبًا</span>
    </button>
  );

  return (
    <div ref={rootRef} className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={className}>
        📝 {label}
      </button>
      {open && (
        <div
          className="absolute bottom-full mb-1.5 left-0 z-50 w-56 rounded-xl border border-[var(--border)] bg-[var(--card-primary)] p-1.5 shadow-[0_10px_30px_var(--shadow)]"
          role="menu"
          dir="rtl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const draft = buildDraft();
              if (draft) queueNotebookDraft(draft);
              setOpen(false);
            }}
            className="w-full text-right rounded-lg px-3 py-2 text-xs font-bold text-ink hover:bg-[var(--card-secondary)] transition flex items-center justify-between gap-2"
          >
            <span>📝 نوتة</span>
            <span className="text-[9px] text-ink-soft">بالعرض قبل الإضافة</span>
          </button>
          {upcoming("🗂️ فلاش كارد")}
          {upcoming("❓ سؤال اختياري (MCQ)")}
          {upcoming("🧠 خريطة ذهنية")}
        </div>
      )}
    </div>
  );
}
