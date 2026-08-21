"use client";

import React from "react";
import type { LeaderboardEntry, ThemeStyles } from "../types";

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLoadingLeaderboard: boolean;
  leaderboardEntries: LeaderboardEntry[];
  themeStyles: ThemeStyles;
}

export function LeaderboardModal({
  isOpen,
  onClose,
  isLoadingLeaderboard,
  leaderboardEntries,
  themeStyles,
}: LeaderboardModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-blur-sm p-4">
      <div className="sheet-card card-lift p-6 w-full max-w-md space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="eyebrow eyebrow-flush mb-1.5">الترتيب</p>
            <h3 className="h3">أعلى ١٠ على المنصة</h3>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="mono text-ink-soft hover:text-ink px-2 py-1 rounded-[6px] hover:bg-paper-3 transition">
            ✕
          </button>
        </div>

        <p className="text-[11px] text-ink-soft leading-relaxed">
          أفضل ١٠ مستخدمين على مستوى المنصة، وترتيبك إنت معاهم.
        </p>

        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {isLoadingLeaderboard ? (
            <p className="text-xs text-ink-soft text-center py-6">بيحمّل الترتيب…</p>
          ) : leaderboardEntries.length === 0 ? (
            <p className="text-xs text-ink-soft text-center py-6">مفيش بيانات كفاية لعرض الترتيب دلوقتي.</p>
          ) : (
            leaderboardEntries.map((entry, index) => (
              // الأكسنت محجوز لصفّك إنت — ده معنى "إنت هنا".
              // المركز الأول بياخد مربّع حبر، مش فسفوري.
              <div
                key={entry.id}
                className={`flex items-center justify-between gap-3 p-2.5 rounded-[var(--r-sm)] border ${
                  entry.isYou ? "border-ink bg-paper-3" : "bg-paper border-rule"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-7 h-7 shrink-0 rounded-[var(--r-sm)] flex items-center justify-center font-mono text-xs font-bold ${
                      index === 0 ? "bg-ink text-paper-2" : "bg-paper-3 text-ink-soft"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="text-xs font-bold text-ink truncate">{entry.name}</span>
                  {entry.isYou && <span className="tag shrink-0">إنت</span>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="mono tnum">{entry.streak} يوم</span>
                  <span className={`mono tnum font-bold ${entry.isYou ? themeStyles.accentText : "text-ink"}`}>
                    {entry.xp} XP
                  </span>
                </div>
              </div>
            ))
          )}
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
