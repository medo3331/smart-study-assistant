"use client";
/**
 * FileExporter — زر/شريط تحميل الملفات
 *
 * بيستقبل بيانات متولدة من الـ AI (ملخص/كويز/خطة...) ويعرض أزرار
 * تحميل حسب الأنواع المسموحة. بيضرب /api/ai/file ويحمّل الملف
 * مباشرة في المتصفح.
 *
 * الاستخدام في أي صفحة فيها نتيجة توليد:
 *   <FileExporter
 *     title="ملخص درس الجهاز الهضمي"
 *     content="summary"
 *     data={aiResult}
 *     formats={["pdf", "docx"]}
 *   />
 */
import React, { useState } from "react";
import {
  FileDown,
  FileText,
  FileSpreadsheet,
  Presentation,
  LoaderCircle,
  Lock,
} from "lucide-react";

export type ExportFileType = "pdf" | "docx" | "xlsx" | "pptx";
export type ExportContent = "summary" | "quiz" | "study_plan" | "report" | "flashcards";

interface FileExporterProps {
  title: string;
  content: ExportContent;
  /** البيانات المولدة من الـ AI. */
  data: Record<string, unknown>;
  subject?: string;
  studentName?: string;
  /** الأنواع المعروضة — الافتراضي الكل. */
  formats?: ExportFileType[];
  className?: string;
}

const FORMAT_META: Record<
  ExportFileType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pdf: { label: "PDF", icon: FileDown },
  docx: { label: "Word", icon: FileText },
  xlsx: { label: "Excel", icon: FileSpreadsheet },
  pptx: { label: "PowerPoint", icon: Presentation },
};

const ALL_FORMATS: ExportFileType[] = ["pdf", "docx", "xlsx", "pptx"];

export function FileExporter({
  title,
  content,
  data,
  subject,
  studentName,
  formats = ALL_FORMATS,
  className = "",
}: FileExporterProps) {
  const [busy, setBusy] = useState<ExportFileType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (type: ExportFileType) => {
    if (busy) return;
    setBusy(type);
    setError(null);

    try {
      const res = await fetch("/api/ai/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, content, title, subject, studentName, data }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error?.message ??
            (res.status === 402
              ? "نوع الملف ده غير متاح في باقتك أو وصلت للحد اليومي."
              : "تعذّر إنشاء الملف. حاول مرة تانية.")
        );
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const star = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      const plain = /filename="?([^";]+)"?/.exec(disposition);
      const filename = star?.[1]
        ? decodeURIComponent(star[1])
        : plain?.[1] ?? `${title.replace(/\s+/g, "_")}.${type}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر إنشاء الملف.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={className} dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400 font-semibold ml-1">تحميل كـ:</span>
        {ALL_FORMATS.filter((f) => formats.includes(f)).map((type) => {
          const meta = FORMAT_META[type];
          const Icon = meta.icon;
          const isBusy = busy === type;
          return (
            <button
              key={type}
              onClick={() => download(type)}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 hover:border-purple-500/50 transition-colors disabled:opacity-50"
              type="button"
              title={`تحميل ${meta.label}`}
            >
              {isBusy ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              {meta.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-red-300">
          <Lock className="h-3.5 w-3.5" />
          {error}
        </p>
      )}
    </div>
  );
}
