"use client";

import React, { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNotebook, MAX_NOTE_DRAFT_CHARS } from "../LessonStudioProvider";

/* ==========================================================================
   NotebookPanel (§4.3) — النوتة المرتبطة بالدرس: panel بيتفتح فوق مساحة العمل
   فيه iframe لـ /notes (نفس نمط NotesSplitPanel — same-origin).
   مسار الإضافة (قرار مقفول §7.1-2 — postMessage مباشر):
     queueNotebookDraft ⇒ Preview ⇒ موافقة الطالب ⇒ postMessage للـ iframe
     بحدث `magicly:append-note` (نفس الأوريجين فقط) ⇒ Undo يرجّع آخر إضافة.
   ========================================================================== */

export default function NotebookPanel() {
  const { notebook, closeNotebook, approvePendingDraft, dismissPendingDraft, undoLastAppend } = useNotebook();
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  /** إرسال الحدث للنوتة — نفس الأوريجين فقط، بلا هدف ⇒ تجاهل صامت. */
  const postToNotebook = (type: string) => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage({ type }, window.location.origin);
    } catch {
      /* تجاهل */
    }
  };

  const handleApprove = () => {
    const approved = approvePendingDraft();
    if (!approved) return;
    // payload محدود الحجم — نفس حدود الـ listener على الطرف التاني.
    const payload = {
      title: approved.title.slice(0, 300),
      body: approved.body.slice(0, MAX_NOTE_DRAFT_CHARS),
      source: approved.source.slice(0, 200),
    };
    try {
      frameRef.current?.contentWindow?.postMessage(
        { type: "magicly:append-note", payload },
        window.location.origin // same-origin فقط — القرار المقفول
      );
    } catch {
      /* تجاهل — الحقن best-effort */
    }
  };

  const handleUndo = () => {
    postToNotebook("magicly:undo-append");
    undoLastAppend();
  };

  return (
    <AnimatePresence>
      {notebook.open && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.2 }}
          dir="rtl"
          className="fixed inset-x-0 bottom-0 z-[65] mx-auto w-full max-w-5xl px-3 pb-3"
          role="complementary"
          aria-label="النوتة المرتبطة بالدرس"
        >
          <div className="rounded-t-2xl border border-[var(--border)] bg-[var(--card-primary)] shadow-[0_-8px_40px_var(--shadow)] overflow-hidden">
            {/* ─── الهيدر: العنوان + Preview/Undo + إغلاق ─── */}
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--card-secondary)]">
              <span className="text-[12.5px] font-bold text-ink">📝 النوتة المرتبطة بالدرس</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={!notebook.lastAppended}
                  className="btn btn-quiet text-[11px] px-2.5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="رجّع آخر إضافة اتضافت للنوتة"
                >
                  ↩️ تراجع عن آخر إضافة
                </button>
                <button
                  type="button"
                  onClick={closeNotebook}
                  className="btn btn-quiet text-[11px] px-2.5 py-1.5"
                  aria-label="إغلاق النوتة"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* ─── Preview: النص اللي هيضاف + المصدر — قبل الكتابة ─── */}
            {notebook.pendingDraft && (
              <div className="mx-4 mt-3 rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="tag">معاينة قبل الإضافة</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={dismissPendingDraft}
                      className="btn btn-quiet text-[11px] px-2.5 py-1.5"
                    >
                      تجاهل
                    </button>
                    <button type="button" onClick={handleApprove} className="btn btn-marker text-[11px] px-3 py-1.5">
                      أضف للنوتة
                    </button>
                  </div>
                </div>
                <p className="text-[12px] font-bold text-ink">{notebook.pendingDraft.title}</p>
                <p className="text-[11.5px] text-ink-soft leading-relaxed line-clamp-4 whitespace-pre-wrap">
                  {notebook.pendingDraft.body}
                </p>
                <p className="text-[10px] text-ink-soft">المصدر: {notebook.pendingDraft.source}</p>
              </div>
            )}

            {/* ─── نفس الأوريجين — IndexedDB والكوتة بيتقاسموا مع الرئيسية ─── */}
            <iframe
              ref={frameRef}
              src="/notes?beside=1"
              title="النوتة — مرتبطة بالدرس"
              className="w-full h-[45vh] border-0 block"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
