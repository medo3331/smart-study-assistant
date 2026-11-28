// components/notes/PdfExportDialog.tsx
//
// 📤 حوار تصدير PDF — عرض فقط (dumb component).
//
// بناء ملف الـ PDF نفسه (exportPdf) فضل في NotebookEditor — الحوار ده
// بيعرض قايمة الصفحات مع خانات اختيار وأزرار التحديد.

"use client";

import React from "react";
import type { UiPage } from "@/lib/notes/editor-kit";

export interface PdfExportDialogProps {
  open: boolean;
  pages: UiPage[];
  selected: ReadonlySet<string>;
  exporting: boolean;
  onToggle: (pageId: string, checked: boolean) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onExport: () => void;
  onClose: () => void;
}

export default function PdfExportDialog({
  open,
  pages,
  selected,
  exporting,
  onToggle,
  onSelectAll,
  onClearSelection,
  onExport,
  onClose,
}: PdfExportDialogProps) {
  if (!open) return null;
  return (
    <div
      className="notes-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="notes-modal"
        role="dialog"
        aria-modal="true"
        aria-label="تصدير PDF"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="notes-modal-title">تصدير PDF</h2>
        <p className="notes-modal-sub">
          اختار الصفحات اللي عايز تطلعها في الملف — بيتصدّروا بنفس ترتيب النوتة.
        </p>
        <div className="notes-modal-pages">
          {pages.map((page, index) => (
            <label key={page.id} className="notes-modal-page">
              <input
                type="checkbox"
                checked={selected.has(page.id)}
                onChange={(event) => onToggle(page.id, event.target.checked)}
              />
              <span>صفحة {index + 1}</span>
              <span className="notes-modal-page-meta">
                {page.content.strokes.length} خط
                {page.content.images.length > 0 ? ` · ${page.content.images.length} صورة` : ""}
              </span>
            </label>
          ))}
        </div>
        <div className="notes-modal-actions">
          <button
            type="button"
            onClick={onSelectAll}
            className="notes-btn notes-btn-sm"
          >
            تحديد الكل
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            className="notes-btn notes-btn-sm"
          >
            إلغاء التحديد
          </button>
          <div className="notes-spacer" />
          <button
            type="button"
            onClick={onClose}
            className="notes-btn notes-btn-sm"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={selected.size === 0 || exporting}
            data-tone="primary"
            className="notes-btn"
          >
            {exporting ? "بنجهّز الملف…" : `تصدير (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
