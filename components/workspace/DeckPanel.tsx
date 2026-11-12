"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Presentation,
  LoaderCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  X,
} from "lucide-react";

/* ==========================================================================
   🎬 لوحة توليد العرض التقديمي من مستند
   ============================================================================

   ⚠️ **التوليد on-demand**: كل ضغطة «الجزء التالي» = **نداء واحد**
   (مجموعة صفحات). ده مش اختيار تجميلي — ده اللي بيحمي من حدّ الـ TPM
   بتاع المزوّد (٨٠٠٠ توكن/دقيقة) ومن الـ timeout.

   ⚠️ **الـ source badge**: كل سلايد بيعرض رقم الصفحة/الشريحة/الفقرة
   اللي جاي منها (حسب نوع الملف). النقطة اللي مرجعها مقدرناش نتحقق منه
   بتظهر **من غير** شارة.

   ⚠️ **الصفحات المتقراش**: لو الملف PDF مصوّر، أول ٦ صفحات بس بتتقرا
   بالـ OCR والباقي فاضي ⇒ بنصرّح للطالب بدل ما نعمل كذب.
   ========================================================================== */

type DeckBullet = { text: string; page: number | null };
type DeckSlide = { heading: string; bullets: DeckBullet[]; notes?: string };
type DeckState = {
  version: 1;
  title: string;
  subtitle?: string;
  total_parts: number;
  parts: Array<{
    index: number;
    status: "ready" | "pending" | "failed";
    pages: number[];
    slides: DeckSlide[];
    error: string | null;
  }>;
  source: { file_name: string; page_count: number; unit: "page" | "slide" | "paragraph" };
};

type DocumentRow = {
  id: string;
  title: string;
  file_type: string | null;
  page_count: number;
  status: string;
  unread_pages: number[];
  deck: DeckState | null;
};

const FORMATS = [
  { value: "pptx", label: "PowerPoint" },
  { value: "pdf", label: "PDF" },
  { value: "docx", label: "Word" },
] as const;

function unitLabel(unit: DeckState["source"]["unit"], n: number): string {
  if (unit === "slide") return `شريحة ${n}`;
  if (unit === "paragraph") return `الفقرة ${n}`;
  return `صفحة ${n}`;
}

export function DeckPanel({
  materialId,
  onClose,
}: {
  materialId: string;
  onClose: () => void;
}) {
  const [document, setDocument] = useState<DocumentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [downloading, setDownloading] = useState<string | null>(null);

  // ── جلب المستند ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/documents?materialId=${encodeURIComponent(materialId)}`,
        );
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(body?.error?.message ?? "مقدرناش نقرأ المستند.");
          return;
        }
        setDocument(body.document as DocumentRow);
        // ⚠️ لو فيه deck محفوظ ⇒ نفتح على أول جزء مش متولّد.
        const deck = (body.document as DocumentRow).deck;
        if (deck?.parts) {
          const pending = deck.parts.find((p) => p.status !== "ready");
          setCurrent(pending ? pending.index : 0);
        }
      } catch {
        if (!cancelled) setError("مقدرناش نقرأ المستند.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [materialId]);

  /** يولّد جزء واحد. */
  const generatePart = useCallback(
    async (partIndex: number) => {
      if (!document) return;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch(
          `/api/documents/${encodeURIComponent(document.id)}/slides`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ partIndex }),
          },
        );
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.ok) {
          setError(body?.error?.message ?? "مقدرناش نجهّز الجزء ده.");
          return;
        }
        setDocument((prev) =>
          prev ? { ...prev, deck: body.deck as DeckState } : prev,
        );
        setCurrent(partIndex);
      } catch {
        setError("مقدرناش نجهّز الجزء ده.");
      } finally {
        setBusy(false);
      }
    },
    [document],
  );

  /** ينزّل الملف بالصيغة المطلوبة. */
  const download = useCallback(
    async (format: (typeof FORMATS)[number]["value"]) => {
      if (!document) return;
      setDownloading(format);
      setError(null);
      try {
        const res = await fetch(
          `/api/documents/${encodeURIComponent(document.id)}/slides`,
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
        anchor.download = `${document.title.replace(/[\\/:*?"<>|]/g, "_")}.${format}`;
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
    [document],
  );

  const deck = document?.deck ?? null;
  const part = deck?.parts[current] ?? null;
  const slides = part?.slides ?? [];
  const readyCount = deck?.parts.filter((p) => p.status === "ready").length ?? 0;

  return (
    <div className="rounded-2xl border border-rule bg-[var(--card-primary)] p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <Presentation size={16} aria-hidden />
            <span>عرض تقديمي</span>
          </p>
          <p className="mt-1 truncate text-xs text-ink-soft">{document?.title ?? "…"}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-rule text-ink-soft transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-xs text-ink-soft">
          <LoaderCircle size={14} className="animate-spin" aria-hidden />
          <span>جاري تجهيز المستند…</span>
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-ink"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
          <span>{error}</span>
        </p>
      )}

      {/* ⚠️ **الصفحات المتقراش** — لازم الطالب يعرف إن في جزء ناقص. */}
      {document && document.unread_pages.length > 0 && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-ink">
          ⚠️ {document.unread_pages.length} صفحة في الملف ده مش متقراية (PDF
          مصوّر — بيقري أول ٦ صفحات بس). العرض هيغطي الصفحات المقروءة بس.
        </p>
      )}

      {document && !loading && !error && (
        <>
          {/* ── شريط الأجزاء ── */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const next = current - 1;
                  if (next < 0) return;
                  setCurrent(next);
                  if (deck?.parts[next]?.status !== "ready") void generatePart(next);
                }}
                disabled={current === 0 || busy}
                aria-label="الجزء السابق"
                className="grid h-7 w-7 place-items-center rounded-lg border border-rule text-ink-soft transition-colors hover:border-[var(--accent)] disabled:opacity-40"
              >
                <ChevronRight size={14} aria-hidden />
              </button>
              <span className="min-w-[5.5rem] text-center text-[11px] font-semibold text-ink-soft">
                {`الجزء ${current + 1} من ${deck?.total_parts ?? "?"}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = current + 1;
                  if (!deck || next >= deck.total_parts) return;
                  setCurrent(next);
                  if (deck.parts[next]?.status !== "ready") void generatePart(next);
                }}
                disabled={!deck || current >= deck.total_parts - 1 || busy}
                aria-label="الجزء التالي"
                className="grid h-7 w-7 place-items-center rounded-lg border border-rule text-ink-soft transition-colors hover:border-[var(--accent)] disabled:opacity-40"
              >
                <ChevronLeft size={14} aria-hidden />
              </button>
            </div>
            <span className="text-[11px] text-ink-soft">
              {readyCount} من {deck?.total_parts ?? 0} متولّد
            </span>
          </div>

          {/* ── حالة الجزء ── */}
          {part?.status === "failed" && (
            <button
              type="button"
              onClick={() => void generatePart(current)}
              disabled={busy}
              className="w-full rounded-xl border border-rule bg-[var(--card-secondary)] px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-[var(--accent)] disabled:opacity-50"
            >
              {busy ? "جاري التوليد…" : "أعد توليد الجزء ده"}
            </button>
          )}

          {part?.status !== "ready" && part?.status !== "failed" && (
            <button
              type="button"
              onClick={() => void generatePart(current)}
              disabled={busy}
              className="w-full rounded-xl border border-rule bg-[var(--card-secondary)] px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-[var(--accent)] disabled:opacity-50"
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle size={13} className="animate-spin" aria-hidden />
                  <span>جاري توليد الجزء…</span>
                </span>
              ) : (
                <span>ولّد الجزء ده</span>
              )}
            </button>
          )}

          {/* ── معاينة الشرائح ── */}
          {slides.length > 0 && (
            <div className="space-y-3">
              {slides.map((slide, index) => (
                <div
                  key={`${current}-${index}`}
                  className="rounded-xl border border-rule p-3"
                >
                  <p className="text-sm font-bold text-ink">{slide.heading}</p>
                  <ul className="mt-2 space-y-1.5">
                    {slide.bullets.map((bullet, i) => (
                      <li
                        key={i}
                        className="flex flex-wrap items-baseline gap-x-2 text-xs leading-relaxed text-ink-soft"
                      >
                        <span>• {bullet.text}</span>
                        {bullet.page !== null && (
                          <span className="rounded border border-rule px-1 font-mono text-[10px] text-ink-soft">
                            {unitLabel(deck?.source.unit ?? "page", bullet.page)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* ── التحميل ── */}
          <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-3">
            {FORMATS.map((format) => (
              <button
                key={format.value}
                type="button"
                onClick={() => void download(format.value)}
                disabled={downloading !== null || readyCount === 0}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rule bg-[var(--card-secondary)] px-2.5 text-xs font-semibold text-ink transition-colors hover:border-[var(--accent)] disabled:opacity-50"
              >
                {downloading === format.value ? (
                  <LoaderCircle size={13} className="animate-spin" aria-hidden />
                ) : (
                  <Download size={13} aria-hidden />
                )}
                <span>{format.label}</span>
              </button>
            ))}
          </div>

          {notice && <p className="text-xs text-ink-soft">{notice}</p>}
        </>
      )}
    </div>
  );
}
