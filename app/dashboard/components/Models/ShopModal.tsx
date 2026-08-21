"use client";

import React from "react";
import type { UiText } from "../types";

interface ShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  xp: number;
  onBuyStreakFreeze: () => void;
  canUnlockNextDayEarly: boolean;
  nextLockedDay: number;
  uiText: UiText;
  onUnlockNextDayEarly: () => void;
}

export function ShopModal({
  isOpen,
  onClose,
  xp,
  onBuyStreakFreeze,
  canUnlockNextDayEarly,
  nextLockedDay,
  uiText,
  onUnlockNextDayEarly,
}: ShopModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-blur-sm p-4">
      <div className="sheet-card card-lift p-6 w-full max-w-md space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="eyebrow eyebrow-flush mb-1.5">المتجر</p>
            <h3 className="h3">اصرف نقاطك</h3>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="mono text-ink-soft hover:text-ink px-2 py-1 rounded-[6px] hover:bg-paper-3 transition">
            ✕
          </button>
        </div>

        <div className="flex items-baseline justify-between bg-paper rounded-[var(--r-sm)] px-4 py-3">
          <span className="tag">رصيدك</span>
          <span className="ltr-num font-display font-extrabold text-xl text-ink tnum">{xp} XP</span>
        </div>

        <div className="bg-paper p-4 rounded-[var(--r-sm)] border border-rule flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-ink mb-0.5">تجميد السلسلة</h4>
            <p className="text-[11px] text-ink-soft leading-relaxed">بيحمي سلسلتك يوم واحد لو غبت.</p>
          </div>
          <button onClick={onBuyStreakFreeze} className="btn btn-marker text-xs shrink-0 tnum">
            200 XP
          </button>
        </div>

        <div
          className={`bg-paper p-4 rounded-[var(--r-sm)] border border-rule flex items-center justify-between gap-3 ${
            canUnlockNextDayEarly ? "" : "opacity-55"
          }`}
        >
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-ink mb-0.5">افتح اللي بعده بدري</h4>
            <p className="text-[11px] text-ink-soft leading-relaxed">
              {canUnlockNextDayEarly
                ? `هيفتحلك ${uiText.stepPrefix} ${nextLockedDay} من غير ما تستنى تخلّص الحالي.`
                : "مفيش خطوة تانية تقدر تفتحها دلوقتي."}
            </p>
          </div>
          <button
            onClick={onUnlockNextDayEarly}
            disabled={!canUnlockNextDayEarly}
            className="btn btn-marker text-xs shrink-0 tnum disabled:opacity-40 disabled:cursor-not-allowed"
          >
            150 XP
          </button>
        </div>

        <div className="flex justify-end">
          <button onClick={onClose} className="btn btn-quiet text-sm">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
