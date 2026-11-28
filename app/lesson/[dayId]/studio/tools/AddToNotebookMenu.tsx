"use client";

import React, { useEffect, useRef, useState } from "react";
import { useNotebook, type NotebookDraft } from "../LessonStudioProvider";

/* ==========================================================================
   AddToNotebookMenu — قائمة «حوّل لـ» (§4.3):
   · Note — شغّال: buildDraft ⇒ Preview ⇒ موافقة ⇒ postMessage.
   · Flashcard / MCQ (P4) — توليد AI اقتصادي (action convert_note في
     /api/lesson-content، بكاش «ولّد مرة») ⇒ الناتج نص منسق بيدخل النوتة
     بنفس الـ postMessage الموجود (magicly:append-note) — بدون أي تعديل
     في NotebookEditor (القرار المقفول: اللمسة الوحيدة).
   · Mind Map — disabled («جاي قريبًا»).
   ========================================================================== */

type ConversionKind = "flashcard" | "mcq";

export default function AddToNotebookMenu({
  buildDraft,
  /** نص المصدر للتحويل (الشرح/الملخص) — مطلوب للفلاش كارد/MCQ. */
  convertSource,
  dayId,
  label = "أضف للنوتة",
  className = "btn btn-quiet text-xs px-3 py-2",
}: {
  buildDraft: () => NotebookDraft | null;
  convertSource?: () => string | null;
  dayId?: string;
  label?: string;
  className?: string;
}) {
  const { queueNotebookDraft } = useNotebook();
  const [open, setOpen] = useState(false);
  const [converting, setConverting] = useState<ConversionKind | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);
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

  /** 🃏/❓ تحويل للمحتوى المحدد — نص منسق بيتقفل في النوتة كنوتة عادية. */
  const handleConvert = async (kind: ConversionKind) => {
    const source = convertSource?.() ?? null;
    const draft = buildDraft();
    if (!source?.trim() || !draft || converting) return;
    setConverting(kind);
    setConvertError(null);
    try {
      const response = await fetch("/api/lesson-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId, action: "convert_note", kind, text: source }),
      });
      const data = await response.json().catch(() => null);
      const body = typeof data?.body === "string" && data.body.trim() ? data.body : null;
      if (!response.ok || !body) {
        throw new Error(data?.error?.message || "التحويل فشل — جرّب تاني.");
      }
      queueNotebookDraft({
        title: draft.title,
        body,
        source: kind === "flashcard" ? "فلاش كارد" : "سؤال اختياري",
      });
      setOpen(false);
    } catch (error) {
      setConvertError(error instanceof Error ? error.message : "التحويل فشل — جرّب تاني.");
    } finally {
      setConverting(null);
    }
  };

  const conversionButton = (kind: ConversionKind, label: string) => {
    const disabled = !convertSource || converting !== null;
    return (
      <button
        key={kind}
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={() => void handleConvert(kind)}
        title={disabled ? "محتاج نص شرح متاح للتحويل" : undefined}
        className="w-full text-right rounded-lg px-3 py-2 text-xs font-bold text-ink hover:bg-[var(--card-secondary)] transition flex items-center justify-between gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>{label}</span>
        <span className="text-[9px] text-ink-soft">{converting === kind ? "بيحوّل…" : "AI — بالنوتة"}</span>
      </button>
    );
  };

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
          {conversionButton("flashcard", "🗂️ فلاش كارد")}
          {conversionButton("mcq", "❓ سؤال اختياري (MCQ)")}
          {upcoming("🧠 خريطة ذهنية")}
          {convertError && <p className="px-3 py-1.5 text-[10px] text-redpen">{convertError}</p>}
        </div>
      )}
    </div>
  );
}
