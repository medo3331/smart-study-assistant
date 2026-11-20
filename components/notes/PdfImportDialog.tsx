// components/notes/PdfImportDialog.tsx
//
// 📥 حوار استيراد PDF — عرض فقط (dumb component).
//
// كل المنطق (قراءة الملف، الكوتة، إنشاء الصفحات) فضل في NotebookEditor —
// الحوار ده بيعرض الحالات التلاتة: بنقرا… / اختار المصدر / اختار النطاق.

"use client";

import React from "react";

/** أعلى عدد صفحات PDF في عملية استيراد واحدة. */
import { MAX_PDF_PAGES_PER_IMPORT } from "@/lib/notes/pdf";

export interface PdfLibraryEntry {
  id: string;
  file_name: string;
  file_type: string;
}

export interface PdfImportDialogProps {
  open: boolean;
  busy: boolean;
  /** رسالة تقدم — موجودة = بنشتغل. */
  progress: string | null;
  pageCount: number;
  from: number;
  to: number;
  onFromChange: (value: number) => void;
  onToChange: (value: number) => void;
  onConfirm: () => void;
  onClose: () => void;
  /** زر «اختار ملف من جهازك» — بيفتح حوار الملفات المخفي. */
  onPickDeviceFile: () => void;
  /** قايمة مكتبة «ملفاتي» — null = لسه متجابتش. */
  libraryList: PdfLibraryEntry[] | null;
  onReloadLibrary: () => void;
  onPickLibraryFile: (fileId: string, fileName: string) => void;
}

export default function PdfImportDialog({
  open,
  busy,
  progress,
  pageCount,
  from,
  to,
  onFromChange,
  onToChange,
  onConfirm,
  onClose,
  onPickDeviceFile,
  libraryList,
  onReloadLibrary,
  onPickLibraryFile,
}: PdfImportDialogProps) {
  if (!open) return null;
  return (
    <div
      className="notes-modal-backdrop"
      onClick={() => {
        if (!busy) onClose();
      }}
      role="presentation"
    >
      <div
        className="notes-modal"
        role="dialog"
        aria-modal="true"
        aria-label="استيراد PDF"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="notes-modal-title">استيراد PDF</h2>
        <p className="notes-modal-sub">
          كل صفحة PDF بتبقى خلفية لصفحة نوته — تكتب وترسم وتظلل عليها بكل
          الأدوات، وبتفضل محفوظة على جهازك.
        </p>
        {progress ? (
          <p className="notes-hint" aria-live="polite">{progress}</p>
        ) : pageCount > 0 ? (
          <>
            <p className="notes-modal-sub">
              الملف فيه {pageCount} صفحة. اختار النطاق (حد أقصى {MAX_PDF_PAGES_PER_IMPORT} صفحة في المرة):
            </p>
            <div className="notes-modal-actions">
              <label className="notes-label">
                من
                <input
                  type="number"
                  min={1}
                  max={pageCount}
                  value={from}
                  onChange={(event) => onFromChange(Number(event.target.value))}
                  className="notes-input notes-btn-sm"
                />
              </label>
              <label className="notes-label">
                إلى
                <input
                  type="number"
                  min={1}
                  max={pageCount}
                  value={to}
                  onChange={(event) => onToChange(Number(event.target.value))}
                  className="notes-input notes-btn-sm"
                />
              </label>
            </div>
            <div className="notes-modal-actions">
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
                onClick={onConfirm}
                disabled={busy}
                data-tone="primary"
                className="notes-btn"
              >
                {busy ? "بنستورد…" : "استيراد"}
              </button>
            </div>
          </>
        ) : (
          // 📁 منتقي المصدر: ملف محلي أو PDF من مكتبة «ملفاتي».
          <>
            <div className="notes-modal-actions">
              <div className="notes-spacer" />
              <button
                type="button"
                onClick={onPickDeviceFile}
                className="notes-btn"
                data-tone="primary"
              >
                اختار ملف من جهازك
              </button>
              <button
                type="button"
                onClick={onClose}
                className="notes-btn notes-btn-sm"
              >
                إلغاء
              </button>
            </div>
            <p className="notes-modal-sub">أو استورد من مكتبة «ملفاتي»:</p>
            {libraryList === null ? (
              <p className="notes-hint">
                <button
                  type="button"
                  onClick={onReloadLibrary}
                  className="notes-btn notes-btn-sm"
                >
                  اعرض ملفاتي
                </button>
              </p>
            ) : libraryList.length === 0 ? (
              <p className="notes-hint">
                مفيش PDF في مكتبتك —{" "}
                <a href="/files" className="notes-link">ارفع من صفحة «ملفاتي»</a>.
              </p>
            ) : (
              <ul className="notes-import-library">
                {libraryList.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => onPickLibraryFile(entry.id, entry.file_name)}
                      className="notes-btn notes-btn-sm"
                      title={entry.file_name}
                    >
                      📕 {entry.file_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
