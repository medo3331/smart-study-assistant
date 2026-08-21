"use client";

import React from "react";
import type { StudyConfig, StudyDay, ThemeStyles } from "../types";

interface ParentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: StudyConfig | null;
  level: number;
  xp: number;
  days: StudyDay[];
  themeStyles: ThemeStyles;
  onShareReport: () => Promise<void> | void;
}

export function ParentReportModal({
  isOpen,
  onClose,
  config,
  level,
  xp,
  days,
  themeStyles,
  onShareReport,
}: ParentReportModalProps) {
  if (!isOpen || !config) return null;

  const completedCount = days.filter((d) => d.isCompleted).length;

  // كشف درجات: كل سطر لافتة على الشمال وقيمة على اليمين، مفصولين بخط الدفتر
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "المادة", value: config.subject },
    { label: "المستوى", value: <span className="ltr-num tnum">L{level}</span> },
    { label: "النقاط", value: <span className="ltr-num tnum">{xp} XP</span> },
    {
      label: "المنجَز",
      value: (
        <span className="ltr-num tnum">
          {completedCount} / {days.length}
        </span>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-blur-sm p-4">
      <div className="sheet-card card-lift p-6 w-full max-w-md space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="eyebrow eyebrow-flush mb-1.5">تقرير</p>
            <h3 className="h3">الإنجاز والتقدم</h3>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="mono text-ink-soft hover:text-ink px-2 py-1 rounded-[6px] hover:bg-paper-3 transition">
            ✕
          </button>
        </div>

        <dl className="m-0">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3 py-2.5 border-b border-rule last:border-b-0"
            >
              <dt className="tag">{row.label}</dt>
              <dd className="m-0 text-sm font-bold text-ink truncate">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-quiet text-sm">
            إغلاق
          </button>
          <button
            onClick={onShareReport}
            className={`btn text-sm ${themeStyles.accentBg} text-onmarker hover:opacity-90`}
          >
            مشاركة التقرير
          </button>
        </div>
      </div>
    </div>
  );
}
