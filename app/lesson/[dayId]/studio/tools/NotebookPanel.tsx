"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLessonStudio, useNotebook, MAX_NOTE_DRAFT_CHARS } from "../LessonStudioProvider";

/* ==========================================================================
   NotebookPanel (§4.3) — النوتة المرتبطة بالدرس: **نافذة عائمة** (P2 مطلب 2).
   - Desktop (lg+): نافذة قابلة للسحب من الهيدر لأي مكان فوق مساحة العمل،
     قابلة للتصغير (لـ pill عائم) وقابلة للإخفاء (زر استعادة عائم بيرجّعها).
   - Mobile (< lg): bottom sheet زي ما هي — السحب الحر مش مفيد للشاشات الصغيرة،
     بنفس أزرار التصغير/الإخفاء/الاستعادة.
   - الموضع والحالة (مصغّرة/مخفية) بتتحفظ في localStorage لكل درس:
     `lesson-notes-float:<dayId>`.
   مسار الإضافة (قرار مقفول §7.1-2 — postMessage مباشر):
     queueNotebookDraft ⇒ Preview ⇒ موافقة الطالب ⇒ postMessage للـ iframe
     بحدث `magicly:append-note` (نفس الأوريجين فقط) ⇒ Undo يرجّع آخر إضافة.
   ========================================================================== */

type NotebookFloatState = {
  /** موضع النافذة (px — أعلى/يسار الشاشة). RTL: بنستخدم left فعليًا للتموضع الثابت. */
  pos: { x: number; y: number } | null;
  minimized: boolean;
  hidden: boolean;
};

const DEFAULT_FLOAT_STATE: NotebookFloatState = { pos: null, minimized: false, hidden: false };

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth < 1024;
}

/** حدود النافذة داخل الشاشة — منع خروجها بالكامل عن الطريق. */
function clampPosition(pos: { x: number; y: number }): { x: number; y: number } {
  const margin = 8;
  const width = typeof window !== "undefined" ? window.innerWidth : 1024;
  const height = typeof window !== "undefined" ? window.innerHeight : 768;
  const x = Math.min(Math.max(pos.x, margin), Math.max(margin, width - 320));
  const y = Math.min(Math.max(pos.y, margin), Math.max(margin, height - 160));
  return { x, y };
}

export default function NotebookPanel() {
  const { lesson } = useLessonStudio();
  const { notebook, openNotebook, closeNotebook, approvePendingDraft, dismissPendingDraft, undoLastAppend } = useNotebook();
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  // ── حالة النافذة العائمة — بتتريّه من localStorage لكل درس ──
  const [floatState, setFloatState] = useState<NotebookFloatState>(DEFAULT_FLOAT_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`lesson-notes-float:${lesson.dayId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<NotebookFloatState>;
        // مزامنة مع نظام خارجي (localStorage) — نمط LessonProgressPanel المعتمد.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFloatState({
          pos: parsed.pos && typeof parsed.pos.x === "number" && typeof parsed.pos.y === "number" ? clampPosition(parsed.pos) : null,
          minimized: parsed.minimized === true,
          hidden: parsed.hidden === true,
        });
      }
    } catch {
      /* تجاهل — localStorage مش متاح أو المحتوى تالف */
    } finally {
      setHydrated(true);
    }
  }, [lesson.dayId]);

  const persistFloatState = useCallback(
    (next: NotebookFloatState) => {
      setFloatState(next);
      try {
        localStorage.setItem(`lesson-notes-float:${lesson.dayId}`, JSON.stringify(next));
      } catch {
        /* تجاهل */
      }
    },
    [lesson.dayId]
  );

  // الحالة الفعّالة: المخفية = مخفية محليًا أو مش مفتوحة من الـ provider.
  const visible = notebook.open && !floatState.hidden;
  const minimized = floatState.minimized;
  const mobile = hydrated && isMobileViewport();

  /** إخفاء — بتفضل مخفية لحد ما الطالب يرجّعها (بيتحفظ لكل درس). */
  const handleHide = () => {
    persistFloatState({ ...floatState, hidden: true });
    closeNotebook();
  };

  /** استعادة — من زر عائم دائم. */
  const handleRestore = () => {
    persistFloatState({ ...floatState, hidden: false });
    openNotebook();
  };

  const toggleMinimize = () => persistFloatState({ ...floatState, minimized: !minimized });

  // فتح النوتة من أي مكان (NotesTab / «أضف للنوتة») يلغي الإخفاء المحفوظ.
  useEffect(() => {
    if (notebook.open && floatState.hidden) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- إلغاء الإخفاء المحفوظ لما النوتة تتفتح من أي مصدر.
      persistFloatState({ ...floatState, hidden: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- عند تغيّر فتح/قفل النوتة بس.
  }, [notebook.open]);

  // ── السحب (Desktop بس) — pointer events على الهيدر ──
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mobile || minimized) return;
    if ((e.target as HTMLElement).closest("button")) return; // الأزرار مش مقابض سحب
    const base = floatState.pos ?? defaultPosition();
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: base.x, baseY: base.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = clampPosition({ x: drag.baseX + (e.clientX - drag.startX), y: drag.baseY + (e.clientY - drag.startY) });
    setFloatState((prev) => ({ ...prev, pos: next }));
  };

  const onHeaderPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    // حفظ الموضع النهائي — من آخر state (مش closure قديم).
    setFloatState((prev) => {
      try {
        localStorage.setItem(`lesson-notes-float:${lesson.dayId}`, JSON.stringify(prev));
      } catch {
        /* تجاهل */
      }
      return prev;
    });
  };

  /** الموضع الافتراضي: فوق يسار مساحة العمل (RTL — بعيد عن الـ Navigator اليمين). */
  function defaultPosition(): { x: number; y: number } {
    const width = typeof window !== "undefined" ? window.innerWidth : 1024;
    return { x: Math.max(16, Math.round(width * 0.12)), y: 96 };
  }

  /** إرسال حدث للنوتة — نفس الأوريجين فقط، بلا هدف ⇒ تجاهل صامت. */
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

  const pos = floatState.pos ?? defaultPosition();

  return (
    <>
      <AnimatePresence>
        {visible && !minimized && (
          <motion.div
            key="notebook-window"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.2 }}
            dir="rtl"
            /* الموبايل: bottom sheet ثابت — الديسكتوب: نافذة عائمة بموضع حر */
            className={mobile ? "fixed inset-x-0 bottom-0 z-[65] mx-auto w-full px-3 pb-3" : "fixed z-[65] w-[min(560px,90vw)]"}
            style={mobile ? undefined : { left: pos.x, top: pos.y }}
            role="complementary"
            aria-label="النوتة المرتبطة بالدرس"
          >
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-primary)] shadow-[0_8px_40px_var(--shadow)] overflow-hidden">
              {/* ─── الهيدر: مقبض السحب + Preview/Undo + تصغير/إخفاء/إغلاق ─── */}
              <div
                onPointerDown={onHeaderPointerDown}
                onPointerMove={onHeaderPointerMove}
                onPointerUp={onHeaderPointerUp}
                className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--card-secondary)] ${
                  mobile ? "" : "cursor-grab active:cursor-grabbing select-none touch-none"
                }`}
              >
                <span className="text-[12.5px] font-bold text-ink flex items-center gap-1.5 min-w-0">
                  {!mobile && <span aria-hidden className="text-ink-soft text-[10px]">⠿</span>}
                  📝 النوتة المرتبطة بالدرس
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={!notebook.lastAppended}
                    className="btn btn-quiet text-[11px] px-2.5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="رجّع آخر إضافة اتضافت للنوتة"
                  >
                    ↩️ تراجع
                  </button>
                  <button
                    type="button"
                    onClick={toggleMinimize}
                    className="btn btn-quiet text-[11px] px-2.5 py-1.5"
                    aria-label={minimized ? "استعادة النافذة" : "تصغير النافذة"}
                    title={minimized ? "استعادة" : "تصغير"}
                  >
                    ─
                  </button>
                  <button
                    type="button"
                    onClick={handleHide}
                    className="btn btn-quiet text-[11px] px-2.5 py-1.5"
                    aria-label="إخفاء النوتة"
                    title="إخفاء — تقدر ترجّعها من الزر العائم"
                  >
                    🚫
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
                className={mobile ? "w-full h-[45vh] border-0 block" : "w-full h-[50vh] border-0 block"}
              />
            </div>
          </motion.div>
        )}

        {/* ─── المصغّرة: pill عائم صغير بيرجّع النافذة ─── */}
        {visible && minimized && (
          <motion.button
            key="notebook-minimized"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            type="button"
            onClick={toggleMinimize}
            className="fixed bottom-24 left-4 z-[65] inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card-primary)] px-3.5 h-10 text-[11.5px] font-bold text-ink shadow-[0_8px_24px_var(--shadow)]"
            aria-label="استعادة النوتة"
          >
            📝 النوتة
          </motion.button>
        )}
      </AnimatePresence>

      {/* ─── زر الاستعادة العائم — النوتة مخفية (إخفاء صريح أو مقفولة من الأول) ─── */}
      {(!visible || floatState.hidden) && (
        <button
          type="button"
          onClick={handleRestore}
          className="fixed bottom-36 left-4 z-[64] inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card-primary)]/90 backdrop-blur px-3.5 h-10 text-[11.5px] font-bold text-ink-soft hover:text-ink shadow-[0_6px_20px_var(--shadow)] transition"
          aria-label="إظهار النوتة المرتبطة بالدرس"
          title="إظهار النوتة"
        >
          📝 النوتة
        </button>
      )}
    </>
  );
}
