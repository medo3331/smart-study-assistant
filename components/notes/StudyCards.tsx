"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { parseDeck, type StudyDeck } from "@/lib/notes/study-deck";

/* ==========================================================================
   🎴 StudyCards — فلَش كاردز + أسئلة اختياري من النوته
   ══════════════════════════════════════════════════════════════════════════

   بياخد النصوص المكتوبة على صفحة النوتة وبيبعتها للـ AI عبر /api/chat
   (نفس الكوتة والصلاحيات بتاعة كل أسطح الـ AI)، والرد JSON متحكّم —
   بعدها العرض تفاعلي محلي بالكامل: كارت بيتقلب بضغطة، أسئلة اختياري
   بتصحح فوراً. الديك المولد بيتخزن محلياً (meta store) فمش بيتولد
   تاني مع كل فتح.
   ========================================================================== */

export default function StudyCards({
  open,
  onClose,
  getPageTexts,
  storageKey,
  getSavedDeck,
  saveDeck,
}: {
  open: boolean;
  onClose: () => void;
  /** نصوص الصفحة/النوتة — بيتجمع وقت الفتح. */
  getPageTexts: () => string;
  /** مفتاح التخزين المحلي للديك المولد (per notebook). */
  storageKey: string;
  /** تحميل الديك المحفوظ (meta store) — null لو مفيش. */
  getSavedDeck?: (key: string) => Promise<StudyDeck | null>;
  /** حفظ الديك المولد محلياً. */
  saveDeck?: (key: string, deck: StudyDeck | null) => Promise<void>;
}) {
  const [tab, setTab] = useState<"flashcards" | "mcq">("flashcards");
  const [deck, setDeck] = useState<StudyDeck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 📥 تحميل الديك المحفوظ أول ما يتفتح — من غير ما نستهلك AI تاني.
  useEffect(() => {
    if (!open || !getSavedDeck) return;
    let cancelled = false;
    void (async () => {
      try {
        const saved = await getSavedDeck(storageKey);
        if (!cancelled && saved) {
          setDeck(saved as StudyDeck | null);
          setError(null);
        }
      } catch {
        // فشل التحميل مش مهم — الطالب يقدر يولّد من جديد.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, getSavedDeck, storageKey]);

  // حالة الفلَش كاردز
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [shuffled, setShuffled] = useState(false);

  // حالة الـ MCQ
  const [mcqIndex, setMcqIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);

  const flashcards = deck?.kind === "flashcards" ? deck.cards : null;
  const questions = deck?.kind === "mcq" ? deck.questions : null;

  const generate = useCallback(async () => {
    const texts = getPageTexts().slice(0, 6000);
    if (!texts.trim()) {
      setError("اكتب نص على الصفحة الأول — المساعد بيشتغل من المحتوى المكتوب.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const instruction =
        tab === "flashcards"
          ? 'انت مولّد بطاقات مراجعة. رجّع JSON فقط بدون أي كلام إضافي بالشكل ده: {"cards":[{"q":"سؤال قصير","a":"إجابة سطر أو سطرين"}]} — من 8 إلى 12 بطاقة تغطي أهم النقاط والتعريفات والمصطلحات. النصوص عربية.'
          : 'انت مولّد أسئلة اختيار من متعدد. رجّع JSON فقط بدون أي كلام إضافي بالشكل ده: {"questions":[{"q":"السؤال","options":["خيار1","خيار2","خيار3","خيار4"],"answer":0}]} — 5 إلى 8 أسئلة، answer هو فهرس الإجابة الصحيحة، والخيارات الأربعة كلها منطقية ومقنعة. النصوص عربية.';
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: `المحتوى:\n\n${texts}` }],
          systemInstruction: instruction,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "فشل الاتصال بالمساعد. حاول تاني.");
      }
      const raw =
        data?.answer ??
        data?.choices?.[0]?.message?.content ??
        data?.content ??
        "";
      const parsed = parseDeck(tab, typeof raw === "string" ? raw : "");
      if (!parsed) {
        throw new Error("الرد مش مفهوم — جرّب تاني.");
      }
      setDeck(parsed);
      setCardIndex(0);
      setFlipped(false);
      setMcqIndex(0);
      setPicked(null);
      setScore(0);
      setAnsweredCount(0);
      setShuffled(false);
      // 💾 حفظ محلي — الفتح الجاي مش هيستهلك AI تاني.
      void saveDeck?.(storageKey, parsed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "حصل خطأ غير متوقع.");
    } finally {
      setBusy(false);
    }
  }, [getPageTexts, saveDeck, storageKey, tab]);

  const shuffleCards = useCallback(() => {
    if (!flashcards) return;
    const shuffledCards = [...flashcards];
    for (let i = shuffledCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledCards[i], shuffledCards[j]] = [shuffledCards[j], shuffledCards[i]];
    }
    setDeck({ kind: "flashcards", cards: shuffledCards });
    setShuffled(true);
    setCardIndex(0);
    setFlipped(false);
  }, [flashcards]);

  const pickOption = useCallback(
    (index: number) => {
      if (picked !== null || !questions) return;
      setPicked(index);
      setAnsweredCount((count) => count + 1);
      if (index === questions[mcqIndex].answer) {
        setScore((value) => value + 1);
      }
    },
    [mcqIndex, picked, questions],
  );

  const nextQuestion = useCallback(() => {
    if (!questions) return;
    setPicked(null);
    setMcqIndex((index) => Math.min(index + 1, questions.length - 1));
  }, [questions]);

  const progressLabel = useMemo(() => {
    if (deck?.kind === "flashcards") {
      return `${cardIndex + 1} / ${deck.cards.length}`;
    }
    if (deck?.kind === "mcq") {
      return `${mcqIndex + 1} / ${deck.questions.length} — صح: ${score}`;
    }
    return "";
  }, [cardIndex, deck, mcqIndex, score]);

  if (!open) return null;

  return (
    <div
      className="notes-modal-backdrop"
      onClick={busy ? undefined : onClose}
      role="presentation"
    >
      <div
        className="notes-modal notes-study-modal"
        role="dialog"
        aria-modal="true"
        aria-label="مذاكرة من النوته"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="notes-modal-title">🎴 مذاكرة من النوته</h2>
        <div className="notes-study-tabs">
          <button
            type="button"
            className="notes-btn notes-btn-sm"
            data-active={tab === "flashcards"}
            onClick={() => setTab("flashcards")}
          >
            فلَش كاردز
          </button>
          <button
            type="button"
            className="notes-btn notes-btn-sm"
            data-active={tab === "mcq"}
            onClick={() => setTab("mcq")}
          >
            اختيار من متعدد
          </button>
          <span className="notes-spacer" />
          {deck ? <span className="notes-hint">{progressLabel}</span> : null}
        </div>

        {!deck && !busy && !error ? (
          <>
            <p className="notes-modal-sub">
              هنبعت النصوص المكتوبة على صفحة النوته للمساعد، وهيبني لك{" "}
              {tab === "flashcards" ? "بطاقات مراجعة (سؤال/إجابة)" : "أسئلة اختيار من متعدد"}{" "}
              تذاكر منها دلوقتي.
            </p>
            <div className="notes-modal-actions">
              <div className="notes-spacer" />
              <button type="button" onClick={onClose} className="notes-btn notes-btn-sm">
                إلغاء
              </button>
              <button type="button" onClick={() => void generate()} data-tone="primary" className="notes-btn">
                🎯 اعملها
              </button>
            </div>
          </>
        ) : null}

        {busy ? <p className="notes-hint" aria-live="polite">المساعد بيجهّز البطاقات…</p> : null}
        {error ? <p className="notes-alert" data-tone="error" style={{ margin: 0 }}>{error}</p> : null}

        {flashcards ? (
          <div className="notes-study-cards">
            <button
              type="button"
              className={`notes-flashcard${flipped ? " notes-flashcard--back" : ""}`}
              onClick={() => setFlipped((value) => !value)}
              title="اضغط تقلب الكارت"
            >
              <span className="notes-flashcard-side">
                {flipped ? flashcards[cardIndex].a : flashcards[cardIndex].q}
              </span>
              <span className="notes-flashcard-hint">
                {flipped ? "↩ السؤال" : "اضغط للإجابة"}
              </span>
            </button>
            <div className="notes-modal-actions">
              <button
                type="button"
                className="notes-btn notes-btn-sm"
                disabled={cardIndex === 0}
                onClick={() => {
                  setCardIndex((index) => index - 1);
                  setFlipped(false);
                }}
              >
                › السابقة
              </button>
              <button type="button" className="notes-btn notes-btn-sm" onClick={shuffleCards} title={shuffled ? "متخلط" : "خلط"}>
                🔀 خلط
              </button>
              <div className="notes-spacer" />
              <button type="button" className="notes-btn notes-btn-sm" onClick={() => void generate()}>
                ↻ أعِد التوليد
              </button>
              <button
                type="button"
                className="notes-btn notes-btn-sm"
                disabled={cardIndex >= flashcards.length - 1}
                onClick={() => {
                  setCardIndex((index) => index + 1);
                  setFlipped(false);
                }}
              >
                التالية ‹
              </button>
            </div>
          </div>
        ) : null}

        {questions ? (
          <div className="notes-study-cards">
            <p className="notes-mcq-question">{questions[mcqIndex].q}</p>
            <div className="notes-mcq-options">
              {questions[mcqIndex].options.map((option, index) => {
                const isAnswer = index === questions[mcqIndex].answer;
                const chosen = picked === index;
                return (
                  <button
                    key={index}
                    type="button"
                    className="notes-btn notes-btn-sm notes-mcq-option"
                    data-state={
                      picked === null
                        ? undefined
                        : isAnswer
                          ? "correct"
                          : chosen
                            ? "wrong"
                            : "dim"
                    }
                    disabled={picked !== null}
                    onClick={() => pickOption(index)}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <div className="notes-modal-actions">
              <div className="notes-spacer" />
              {mcqIndex >= questions.length - 1 ? (
                <span className="notes-hint">
                  خلصت! {score} صح من {answeredCount}
                </span>
              ) : (
                <button
                  type="button"
                  className="notes-btn"
                  data-tone="primary"
                  disabled={picked === null}
                  onClick={nextQuestion}
                >
                  التالية ‹
                </button>
              )}
              <button type="button" className="notes-btn notes-btn-sm" onClick={() => void generate()}>
                ↻ أعِد التوليد
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
