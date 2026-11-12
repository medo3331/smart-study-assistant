"use client";

import { FileText, FileType, Presentation, Loader2 } from "lucide-react";

/* ==========================================================================
   🎬 بلاطات اختيار صيغة العرض — مشترك بين المستندات والمحاضرات
   ============================================================================

   ⚠️ **ليه «مكدّسة ورق» مش زرار عادي؟**: الغرض من(tileالاختيار) هو
   إن الطالب يفهم إنه بيختار **ملف** هينزل — مش بيختار «صيغة».
   الورق المكدّسة بتقول «ملف» من غير كلمة.

   ⚠️ **ليه مشترك؟**: مسارين (مستند / محاضرة) ولازم الشكل واحد.
   ========================================================================== */

export type DeckFormatOption = "pptx" | "pdf" | "docx";

const FORMATS: Array<{
  value: DeckFormatOption;
  ext: string;
  label: string;
  icon: typeof Presentation;
}> = [
  { value: "pptx", ext: "PPTX", label: "عرض تقديمي", icon: Presentation },
  { value: "pdf", ext: "PDF", label: "ملف PDF", icon: FileText },
  { value: "docx", ext: "DOCX", label: "مستند Word", icon: FileType },
];

export function DeckFormatTiles({
  disabled,
  busyFormat,
  onPick,
}: {
  /** كل البلاطات معطّلة (مفيش شرائح جاهزة). */
  disabled?: boolean;
  /** الصيغة اللي بتتحمّل دلوقتي (لو اتنين). */
  busyFormat?: DeckFormatOption | null;
  onPick: (format: DeckFormatOption) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {FORMATS.map((format) => {
        const Icon = format.icon;
        const busy = busyFormat === format.value;
        return (
          <button
            key={format.value}
            type="button"
            onClick={() => onPick(format.value)}
            disabled={disabled || busyFormat !== null}
            aria-label={`توليد وتنزيل ${format.label}`}
            className="deck-format-tile"
          >
            <span className="deck-format-sheet">
              {busy ? (
                <Loader2 size={16} className="animate-spin" aria-hidden />
              ) : (
                <Icon size={18} aria-hidden />
              )}
            </span>
            <span className="deck-format-label">
              <span className="ltr-num block font-mono">{format.ext}</span>
              <span className="mt-0.5 block">{format.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
