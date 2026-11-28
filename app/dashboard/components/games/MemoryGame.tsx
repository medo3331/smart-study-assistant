"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: proper typing requires architecture change, tracked separately */

import { useCallback, useState, useEffect } from "react";

interface Card {
  id: number;
  content: string;
  pairId: number;
  side: "q" | "a"; // سؤال أو إجابة — عشان تمييز بصري يسهّل المطابقة
  isFlipped: boolean;
  isMatched: boolean;
}

interface MemoryGameProps {
  lessonText?: string; // النص اللي هيتبعت للـ AI عشان يولد الأسئلة
  /** بتتنادى أول ما الطالب يخلّص كل الأزواج — للمكافأة (claim_break_game) */
  onWin?: () => Promise<void>;
}

/**
 * 🧠 Memory Match الذكية — نسخة أسهل:
 *   - ٤ أزواج بس (٨ كروت كبيرة).
 *   - كروت الأسئلة عليها ❓ وكروت الإجابات عليها 💡 — المطابقة بقت بصرية.
 *   - زمن الرجوع للكارت الغلط ٧٠٠ms بدل ثانية.
 *   - النقاط + مكافأة أول ما تخلّص.
 */
export default function MemoryGame({ lessonText = "برمجة الويب وتطوير التطبيقات باستخدام TypeScript و React", onWin }: MemoryGameProps) {
  const [cards, setCards] = useState<Card[]>([]);
  const [firstSelection, setFirstSelection] = useState<Card | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [tries, setTries] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [rewarded, setRewarded] = useState(false);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setIsCompleted(false);
      setScore(0);
      setTries(0);
      const res = await fetch("/api/generate-game-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل في توليد الأسئلة");
      if (data.pairs && Array.isArray(data.pairs)) {
        const generatedCards: Card[] = [];
        data.pairs.forEach((item: { question: string; answer: string }, index: number) => {
          generatedCards.push(
            { id: index * 2, content: item.question, pairId: index, side: "q", isFlipped: false, isMatched: false },
            { id: index * 2 + 1, content: item.answer, pairId: index, side: "a", isFlipped: false, isMatched: false },
          );
        });
        setCards(generatedCards.sort(() => Math.random() - 0.5));
      } else {
        throw new Error("بيانات الأسئلة غير صالحة");
      }
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء تحميل اللعبة");
    } finally {
      setIsLoading(false);
    }
  }, [lessonText]);

  useEffect(() => { void load(); }, [load]);

  const handleCardClick = (clickedCard: Card) => {
    if (isChecking || clickedCard.isFlipped || clickedCard.isMatched) return;

    setCards((prev) =>
      prev.map((card) => (card.id === clickedCard.id ? { ...card, isFlipped: true } : card)),
    );

    if (!firstSelection) {
      setFirstSelection(clickedCard);
    } else {
      setIsChecking(true);
      setTries((t) => t + 1);

      if (firstSelection.pairId === clickedCard.pairId && firstSelection.id !== clickedCard.id) {
        setCards((prev) =>
          prev.map((card) => (card.pairId === clickedCard.pairId ? { ...card, isMatched: true } : card)),
        );
        setScore((prev) => prev + 10);
        setFirstSelection(null);
        setIsChecking(false);

        // التحقق من انتهاء اللعبة
        setTimeout(() => {
          setCards((current) => {
            if (current.length > 0 && current.every((card) => card.isMatched)) {
              setIsCompleted(true);
              // مكافأة واحدة عند الإكمال
              if (onWin && !rewarded) {
                setRewarded(true);
                void onWin();
              }
            }
            return current;
          });
        }, 300);
      } else {
        // نرجّع الكارتين بعد ٧٠٠ms — أسرع وأسهل
        setTimeout(() => {
          setCards((prev) =>
            prev.map((card) =>
              card.id === firstSelection.id || card.id === clickedCard.id
                ? { ...card, isFlipped: false }
                : card,
            ),
          );
          setFirstSelection(null);
          setIsChecking(false);
        }, 700);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl p-10">
        <div className="h-10 w-10 animate-spin rounded-full border-t-2 border-b-2 border-marker" />
        <p className="text-sm text-ink-soft">جاري تجهيز اللعبة بالذكاء الاصطناعي خصيصاً للدرس...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl p-8 text-center">
        <p className="text-red-600">⚠️ {error}</p>
        <button onClick={() => void load()} className="btn btn-quiet text-sm">إعادة المحاولة</button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span>النقاط: <strong className="text-marker">{score}</strong></span>
        <span className="text-ink-soft">محاولات: {tries}</span>
        <button onClick={() => void load()} className="btn btn-quiet text-xs">خلط جديد</button>
      </div>

      {isCompleted ? (
        <div className="sheet-card space-y-2 p-6 text-center">
          <h3 className="h3">🎉 برافو عليك! طابقت كل الأزواج</h3>
          <p className="text-sm text-ink-soft">مجموع نقاطك: {score} · محاولات: {tries}</p>
          <button onClick={() => void load()} className="btn btn-marker text-sm">إلعب مرة أخرى</button>
        </div>
      ) : (
        <div className="grid w-full grid-cols-2 gap-3">
          {cards.map((card) => {
            const shown = card.isFlipped || card.isMatched;
            return (
              <button
                key={card.id}
                onClick={() => handleCardClick(card)}
                className={`flex h-24 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center text-sm font-medium transition-all duration-300 sm:h-28 ${
                  card.isMatched
                    ? "border-marker/50 bg-marker/10 text-marker"
                    : shown
                      ? "border-marker bg-paper-2 text-ink shadow-md scale-[1.03]"
                      : "border-rule bg-paper-2/50 text-ink-soft hover:border-marker/50 hover:bg-paper-2"
                }`}
              >
                <span className="text-base">{card.isMatched ? "✅" : card.side === "q" ? "❓" : "💡"}</span>
                <span className="line-clamp-3">{shown ? card.content : "دوس هنا"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
