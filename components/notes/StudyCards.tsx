"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

/* ==========================================================================
   🎴 StudyCards — فلَش كاردز + أسئلة اختياري من النوته
   ══════════════════════════════════════════════════════════════════════════

   بياخد النصوص المكتوبة على صفحة الدفتر وبيبعتها للـ AI عبر /api/chat
   (نفس الكوتة والصلاحيات بتاعة كل أسطح الـ AI)، والرد JSON متحكّم —
   بعدها العرض تفاعلي محلي بالكامل: كارت بيتقلب بضغطة، أسئلة اختياري
   بتصحح فوراً. الديك المولد بيتخزن محلياً (meta store) فمش بيتولد
   تاني مع كل فتح.
   ========================================================================== */

export interface Flashcard {
  q: string;
  a: string;
}

export interface McqQuestion {
  q: string;
  options: string[];
  /** فهرس الإجابة الصحيحة. */
  answer: number;
}

type Deck =
  | { kind: "flashcards"; cards: Flashcard[] }
  | { kind: "mcq"; questions: McqQuestion[] }
  | null;

/** استخراج JSON متسامح — بينظف أي كلام حوالين الـ JSON أو code fences. */
function extractJson(raw: string): unknown {
  const stripped = raw
    .replace(/```json/gi, "```")
    .split("```")
    .map((part) => part.trim())
    .find((part) => part.startsWith("{") || part.startsWith("["));
  const candidate = stripped ?? raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseDeck(kind: "flashcards" | "mcq", raw: string): Deck {
  const data = extractJson(raw) as Record<string, unknown> | null;
  if (!data) return null;
  if (kind === "flashcards") {
    const cards = Array.isArray(data.cards) ? data.cards : [];
    const parsed = cards
      .map((card) => {
        const entry = card as { q?: unknown; a?: unknown; front?: unknown; back?: unknown };
        const q = String(entry.q ?? entry.front ?? "").trim();
        const a = String(entry.a ?? entry.back ?? "").trim();
        return q && a ? { q, a } : null;
      })
      .filter((card): card is Flashcard => card !== null)
      .slice(0, 30);
    return parsed.length > 0 ? { kind: "flashcards", cards: parsed } : null;
  }
  const questions = Array.isArray(data.questions) ? data.questions : [];
  const parsed = questions
    .map((question) => {
      const entry = question as { q?: unknown; options?: unknown; answer?: unknown };
      const q = String(entry.q ?? "").trim();
      const options = Array.isArray(entry.options)
        ? entry.options.map((option) => String(option).trim()).filter(Boolean)
        : [];
      const answer = Number(entry.answer);
      return q && options.length >= 2 && Number.isInteger(answer) && answer >= 0 && answer < options.length
        ? { q, options, answer }
        : null;
    })
    .filter((question): question is McqQuestion => question !== null)
    .slice(0, 20);
  return parsed.length > 0 ? { kind: "mcq", questions: parsed } : null;
}

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
  /** نصوص الصفحة/الدفتر — بيتجمع وقت الفتح. */
  getPageTexts: () => string;
  /** مفتاح التخزين المحلي للديك المولد (per notebook). */
  storageKey: string;
  /** تحميل الديك المحفوظ (meta store) — null لو مفيش. */
  getSavedDeck?: (key: string) => Promise<Deck>;
  /** حفظ الديك المولد محلياً. */
  saveDeck?: (key: string, deck: Deck) => Promise<void>;
}) {
  const [tab, setTab] = useState<"flashcards" | "mcq">("flashcards");
  const [deck, setDeck] = useState<Deck>(null);
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
          setDeck(saved);
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
