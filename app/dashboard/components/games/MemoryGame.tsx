'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: proper typing requires architecture change, tracked separately */

import React, { useState, useEffect } from 'react';

interface Card {
  id: number;
  content: string;
  pairId: number;
  isFlipped: boolean;
  isMatched: boolean;
}

interface MemoryGameProps {
  lessonText?: string; // النص اللي هيتبعت للـ AI عشان يولد الأسئلة
}

export default function MemoryGame({ lessonText = "برمجة الويب وتطوير التطبيقات باستخدام TypeScript و React" }: MemoryGameProps) {
  const [cards, setCards] = useState<Card[]>([]);
  const [firstSelection, setFirstSelection] = useState<Card | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // جلب الأسئلة من الـ AI API عند تحميل اللعبة
  useEffect(() => {
    async function fetchQuestions() {
      try {
        setIsLoading(true);
        const res = await fetch('/api/generate-game-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonText })
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'فشل في توليد الأسئلة');
        }

        if (data.pairs && Array.isArray(data.pairs)) {
          const generatedCards: Card[] = [];
          data.pairs.forEach((item: { question: string; answer: string }, index: number) => {
            generatedCards.push(
              { id: index * 2, content: item.question, pairId: index, isFlipped: false, isMatched: false },
              { id: index * 2 + 1, content: item.answer, pairId: index, isFlipped: false, isMatched: false }
            );
          });
          // لخبطة الكروت عشوائياً
          setCards(generatedCards.sort(() => Math.random() - 0.5));
        } else {
          throw new Error('بيانات الأسئلة غير صالحة');
        }
      } catch (err: any) {
        console.error("Failed to load AI questions", err);
        setError(err.message || 'حدث خطأ أثناء تحميل اللعبة');
      } finally {
        setIsLoading(false);
      }
    }

    fetchQuestions();
  }, [lessonText]);

  // التعامل مع ضغط الكارت
  const handleCardClick = (clickedCard: Card) => {
    if (isChecking || clickedCard.isFlipped || clickedCard.isMatched) return;

    // اقلب الكارت الحالي
    setCards(prev =>
      prev.map(card => card.id === clickedCard.id ? { ...card, isFlipped: true } : card)
    );

    if (!firstSelection) {
      setFirstSelection(clickedCard);
    } else {
      setIsChecking(true);
      // تحقق هل الكارتين متطابقين
      if (firstSelection.pairId === clickedCard.pairId && firstSelection.id !== clickedCard.id) {
        setCards(prev =>
          prev.map(card => card.pairId === clickedCard.pairId ? { ...card, isMatched: true } : card)
        );
        setScore(prev => prev + 10);
        resetTurn();
        
        // التحقق من انتهاء اللعبة
        setTimeout(() => {
          checkGameCompletion();
        }, 300);
      } else {
        // لو مش متطابقين، نرجع نتقلبهم بعد ثانية
        setTimeout(() => {
          setCards(prev =>
            prev.map(card => card.id === firstSelection.id || card.id === clickedCard.id ? { ...card, isFlipped: false } : card)
          );
          resetTurn();
        }, 1000);
      }
    }
  };

  const resetTurn = () => {
    setFirstSelection(null);
    setIsChecking(false);
  };

  const checkGameCompletion = () => {
    setCards(currentCards => {
      if (currentCards.length > 0 && currentCards.every(card => card.isMatched)) {
        setIsCompleted(true);
        // هنا تقدر تبعت النتيجة للباك إند لو حابب
      }
      return currentCards;
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-slate-900 text-white rounded-xl shadow-xl max-w-2xl mx-auto min-h-[300px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
        <p className="text-slate-300 text-lg">جاري تجهيز اللعبة بالذكاء الاصطناعي خصيصاً للدرس...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-slate-900 text-white rounded-xl shadow-xl max-w-2xl mx-auto text-center">
        <p className="text-red-400 text-lg mb-4">⚠️ {error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-semibold transition"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-slate-900 text-white rounded-xl shadow-xl max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">لعبة مطابقة المصطلحات الذكية</h2>
      <p className="text-slate-400 mb-6">طابق المصطلح العلمي أو السؤال بتعريفه الصحيح</p>
      
      <div className="flex justify-between w-full mb-4 px-4 text-lg">
        <span>النقاط: <strong className="text-emerald-400">{score}</strong></span>
      </div>

      {isCompleted ? (
        <div className="text-center py-10">
          <h3 className="text-3xl font-bold text-emerald-400 mb-2">🎉 برافو عليك! أنهيت اللعبة بنجاح</h3>
          <p className="text-slate-300 mb-6">مجموع نقاطك: {score}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-semibold transition"
          >
            إلعب مرة أخرى
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
          {cards.map(card => (
            <div
              key={card.id}
              onClick={() => handleCardClick(card)}
              className={`h-28 flex items-center justify-center p-3 text-center rounded-xl cursor-pointer select-none transition-all duration-300 text-sm font-medium ${
                card.isFlipped || card.isMatched
                  ? 'bg-indigo-600 text-white shadow-md scale-105'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              {card.isFlipped || card.isMatched ? card.content : '❓'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}