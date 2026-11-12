"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Download,
  Loader2,
  Presentation,
  X,
} from "lucide-react";

import { DeckFormatTiles, type DeckFormatOption } from "@/components/decks/DeckFormatTiles";
import { DeckPartNav } from "@/components/decks/DeckPartNav";
import { DeckSlides } from "@/components/decks/DeckSlides";
import type { DeckState } from "@/lib/ai/slides";

/* ==========================================================================
   🎬 لوحة «ملف المحاضرة» — توليد عرض من مقاطع التفريغ
   ============================================================================

   ⚠️ **المرجع هنا = توقيت**: كل نقطة بتجيب شارة «دقيقة 12:30» (مش
   «صفحة ٤») — لأن وحدات المحاضرة مقاطع، والمرجع بتاع الطالب **زمن**.

   ⚠️ **التوليد on-demand** (زي المستندات): كل جزء = نداء واحد. فبنولّد
      الجزء اللي الطالب واقف عليه بس.

   ⚠️ **كريدت واحد للمحاضرة**: نفس الـ `creditRefId` عبر كل الأجزاء.
   ========================================================================== */

type DeckPart = {
  index: number;
  status: "ready" | "pending" | "failed";
  slides: Array<{
    heading: string;
    bullets: Array<{ text: string; page: number | null; label?: string }>;
  }>;
};

export function LectureDeckPanel({
  lectureId,
  onClose,
}: {
  lectureId: string;
  onClose?: () => void;
}) {
  const [deck, setDeck] = useState<DeckState | null>(null);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState<DeckFormatOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── جلب الـ deck المحفوظ (لو في) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/documents?lectureId=${encodeURIComponent(lectureId)}`);
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && body?.document?.deck) {
          const stored = body.document.deck as DeckState;
          setDeck(stored);
          const pending = stored.parts.find((p) => p.status !== "ready");
          setCurrent(pending ? pending.index : 0);
        }
      } catch {
        /* مفيش deck محفوظ — تمام. */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lectureId]);

  /** يولّد جزء واحد. */
  const generatePart = useCallback(
    async (partIndex: number) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/lectures/${encodeURIComponent(lectureId)}/slides`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ partIndex }),
          },
        );
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.ok) {
          setError(body?.error?.message ?? "مقدرناش نجهّز الجزء ده. جرّب تاني.");
          return null;
        }
        setDeck(body.deck as DeckState);
        setCurrent(partIndex);
        return body.deck as DeckState;
      } catch {
        setError("مقدرناش نجهّز الجزء ده. جرّب تاني.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [lectureId],
  );

  /** ينزّل الملف بالصيغة المطلوبة (بعد ما يتولّد الجزء). */
  const download = useCallback(
    async (format: DeckFormatOption) => {
      setDownloading(format);
      setError(null);
      try {
        const res = await fetch(
          `/api/lectures/${encodeURIComponent(lectureId)}/slides`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ format }),
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error?.message ?? "مقدرناش نجهّز الملف.");
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const anchor = window.document.createElement("a");
        anchor.href = url;
        anchor.download = `محاضرة.${format}`;
        window.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } catch {
        setError("مقدرناش نجهّز الملف.");
      } finally {
        setDownloading(null);
      }
    },
    [lectureId],
  );

  /** يولّد (لو محتاج) وينزّل. */
  const pickFormat = useCallback(
    async (format: DeckFormatOption) => {
      const part = deck?.parts[current];
      if (!part || part.status !== "ready") {
        const next = await generatePart(current);
        if (!next) return;
      }
      await download(format);
    },
    [deck, current, generatePart, download],
  );

  const parts = (deck?.parts ?? []) as DeckPart[];
  const part = parts[current];
  const readyCount = parts.filter((p) => p.status === "ready").length;

  return (
    <div className="rounded-2xl border border-rule bg-[var(--card-primary)] p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <Presentation size={16} aria-hidden />
            <span>ملف المحاضرة</span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            عرض تقديمي من المحاضرة — كل نقطة مرجعها بتوقيتها.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-rule text-ink-soft transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-ink"
        >
          <AlertTriangle
            size={14}
            className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <span>{error}</span>
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-ink-soft">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          <span>جاري تجهيز المحاضرة…</span>
        </p>
      ) : (
        <>
          {/* ── شريط الأجزاء ── */}
          {parts.length > 0 && (
            <DeckPartNav
              total={parts.length}
              current={current}
              readyCount={readyCount}
              statuses={parts.map((p) => p.status)}
              busy={busy}
              onSelect={(index) => {
                if (index < 0 || index >= parts.length) return;
                setCurrent(index);
                if (parts[index]?.status !== "ready") void generatePart(index);
              }}
            />
          )}

          {/* ── المعاينة ── */}
          {part && part.status === "ready" ? (
            <DeckSlides slides={part.slides} unit="segment" />
          ) : (
            <p className="rounded-xl border border-rule bg-black/[0.02] p-3 text-xs leading-relaxed text-ink-soft dark:bg-white/[0.02]">
              {busy
                ? "جاري توليد الجزء ده…"
                : "اضغط على صيغة من تحت عشان نولّد أول جزء من العرض."}
            </p>
          )}

          {/* ── اختيار الصيغة ── */}
          <div className="border-t border-rule pt-3">
            <DeckFormatTiles
              disabled={false}
              busyFormat={downloading ?? (busy ? "pptx" : null)}
              onPick={(format) => void pickFormat(format)}
            />
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-soft">
              <Download size={12} aria-hidden />
              <span>اختر الصيغة ⇒ نولّد لو محتاج وننزّل الملف فوراً.</span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
