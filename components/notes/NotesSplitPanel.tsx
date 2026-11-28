// components/notes/NotesSplitPanel.tsx
//
// 🖥️ وضع المذاكرة — النوت جانب أي صفحة مذاكرة.
//
// زر «🖥️ نوت جانبية» بيفتح لوحة على نص الشاشة فيها محرر النوت
// (iframe نفس الأوريجن — فالتخزين والقفل والكوتة شغالين زي أي تبويب)
// وبعد إغلاقه الطالب يقيّم الميزة والتقييم بيتبعت للأدمن.

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

const FEEDBACK_OPEN_AFTER_MS = 90_000; // التقييم بيظهر بعد دقيقة ونص استخدام

/** ⭐ نافذة تقييم الميزة — النتيجة بتبعت للأدمن كتذكرة «رأي طالب». */
export function StudyFeedbackDialog({
  open,
  onClose,
  context,
}: {
  open: boolean;
  onClose: () => void;
  context?: string;
}) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!rating || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/notes/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating, comment, context }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error?.message ?? "مقدرناش نسجّل تقييمك — جرّب تاني.");
        return;
      }
      setDone(true);
      setTimeout(onClose, 2200);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div
      className="notes-modal-backdrop"
      onClick={onClose}
      role="presentation"
      style={{ zIndex: 80 }}
    >
      <div
        className="notes-modal"
        role="dialog"
        aria-modal="true"
        aria-label="تقييم ميزة النوت الجانبية"
        onClick={(event) => event.stopPropagation()}
      >
        {done ? (
          <p className="notes-modal-sub" style={{ textAlign: "center" }}>
            شكراً ليك! تقييمك وصل فريق Magicly 💜
          </p>
        ) : (
          <>
            <h2 className="notes-modal-title">⭐ قيّم ميزة النوت الجانبية</h2>
            <p className="notes-modal-sub">
              رأيك بيوصلنا في «آراء الطلاب» وبيساعدنا نطوّر الميزة.
            </p>
            <div
              dir="ltr"
              style={{ display: "flex", gap: 6, justifyContent: "center", fontSize: 28 }}
              role="radiogroup"
              aria-label="التقييم من 1 إلى 5"
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  onMouseEnter={() => setHovered(value)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setRating(value)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    filter: "grayscale(1)",
                    opacity: (hovered || rating) >= value ? 1 : 0.35,
                    transition: "opacity .15s",
                  }}
                  aria-label={`${value} نجوم`}
                >
                  ⭐
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={
                rating && rating <= 3
                  ? "قولنا إيه اللي محتاج يتحسن…"
                  : "رأيك (اختياري) — إيه اللي عجبك؟"
              }
              className="notes-input"
              style={{ minHeight: 72, marginTop: 8, width: "100%" }}
              maxLength={2000}
            />
            {error ? (
              <p className="notes-hint" style={{ color: "#c0392b" }}>{error}</p>
            ) : null}
            <div className="notes-modal-actions">
              <div className="notes-spacer" />
              <button
                type="button"
                onClick={onClose}
                className="notes-btn notes-btn-sm"
              >
                مش دلوقتي
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!rating || busy}
                data-tone="primary"
                className="notes-btn"
              >
                {busy ? "بيتبعت…" : "ابعت التقييم"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 🖥️ زر تفعيل وضع المذاكرة — بيفتح النوت في نص الشاشة.
 * نفس API زر «نوت جانبية» القديم عشان يستبدله/يتراكب عليه بسهولة.
 */
export default function NotesSplitToggle({
  label = "🖥️ نوت جانبية",
  className,
  title = "افتح النوتة جنب الشرح — تقسيم شاشة فوري",
}: {
  label?: string;
  className?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const startedAt = useRef<number>(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    const used = Date.now() - startedAt.current;
    if (used >= FEEDBACK_OPEN_AFTER_MS && typeof window !== "undefined") {
      const key = "notes:feedback-asked";
      // مرة كل 3 أيام — من غير إزعاج.
      const last = Number(localStorage.getItem(key) ?? 0);
      if (Date.now() - last > 3 * 24 * 3_600_000) {
        localStorage.setItem(key, String(Date.now()));
        setTimeout(() => setFeedbackOpen(true), 400);
      }
    }
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          startedAt.current = Date.now();
          setOpen(true);
        }}
        className={className}
        title={title}
      >
        {label}
      </button>
      {open ? (
        <NotesSplitPanel onClose={close} onFeedback={() => setFeedbackOpen(true)} />
      ) : null}
      <StudyFeedbackDialog
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        context="النوت الجانبية (تقسيم الشاشة)"
      />
    </>
  );
}

/** اللوحة نفسها — نص الشاشة شمال (RTL) فيها محرر النوت. */
function NotesSplitPanel({
  onClose,
  onFeedback,
}: {
  onClose: () => void;
  onFeedback: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Esc = إغلاق — الطالب بيرجع للشرح بضغطة.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="notes-split-restore"
        title="رجّع النوت"
      >
        📝 النوت
      </button>
    );
  }

  return (
    <div className="notes-split-panel" dir="rtl">
      <div className="notes-split-header">
        <span className="notes-split-title">📝 النوتة</span>
        <span className="notes-split-actions">
          <button
            type="button"
            onClick={onFeedback}
            className="notes-split-btn"
            title="قيّم الميزة"
          >
            ⭐
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="notes-split-btn"
            title="اطوي اللوحة (رجعة بضغطة)"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={onClose}
            className="notes-split-btn"
            title="إغلاق (Esc)"
          >
            ✕
          </button>
        </span>
      </div>
      {/* نفس الأوريجن — IndexedDB والكوتة بيتقاسموا مع الرئيسية طبيعي */}
      <iframe
        src="/notes?beside=1"
        title="النوتة — وضع جانبي"
        className="notes-split-frame"
      />
    </div>
  );
}
