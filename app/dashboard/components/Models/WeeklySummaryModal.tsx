"use client";

import React from "react";
import type { ThemeStyles } from "../types";

interface WeeklySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  weeklySummaryData: { days: number; minutes: number } | null;
  themeStyles: ThemeStyles;
}

export function WeeklySummaryModal({ isOpen, onClose, weeklySummaryData, themeStyles }: WeeklySummaryModalProps) {
  if (!isOpen || !weeklySummaryData) return null;

  const message =
    weeklySummaryData.days >= 5
      ? "أسبوع قوي. كمّل بنفس الإيقاع."
      : weeklySummaryData.days >= 2
      ? "بداية كويسة — زوّد يوم أو اتنين الأسبوع الجاي."
      : "الأسبوع ده كان هادي. نبدأ من النهارده.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-blur-sm p-4">
      <div className="sheet-card sheet-card-live card-lift p-6 w-full max-w-md space-y-4">
        <div>
          <p className="eyebrow eyebrow-flush mb-1.5">مراجعة</p>
          {/* الضربة الوحيدة في الشاشة دي */}
          <h3 className="h2">
            <span className="mark mark-tilt">أسبوعك اللي فات</span>
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-paper rounded-[var(--r-sm)] p-4">
            <p className="tag mb-1.5">أيام نشطة</p>
            <p className="ltr-num font-display font-extrabold text-2xl text-ink leading-none tnum">
              {weeklySummaryData.days} / 7
            </p>
          </div>
          <div className="bg-paper rounded-[var(--r-sm)] p-4">
            <p className="tag mb-1.5">دقائق تركيز</p>
            <p className="ltr-num font-display font-extrabold text-2xl text-ink leading-none tnum">
              {weeklySummaryData.minutes}
            </p>
          </div>
        </div>

        <p className="text-sm text-ink-soft">{message}</p>

        <button
          onClick={onClose}
          className={`btn btn-block text-sm ${themeStyles.accentBg} text-onmarker hover:opacity-90`}
        >
          تمام، يلا نكمّل
        </button>
      </div>
    </div>
  );
}
