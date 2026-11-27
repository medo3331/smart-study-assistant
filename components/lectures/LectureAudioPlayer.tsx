"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Headphones, Pause, Play, Loader2, AlertTriangle } from "lucide-react";

import { useLectureCitation, formatTimestamp } from "./lecture-citation-context";
import type { TimedSegment } from "@/lib/ai/lecture-intensive-prompts";

/* ==========================================================================
   🎧 مشغّل الاستوديو — Phase 23
   ==========================================================================
   تجربة «استوديو المحاضرة»: الصوت + التفريغ + الشرح المكثف في تزامن واحد.

   - الصوت مش بيتحمّل ولا الرابط بيتولّد غير عند أول ضغطة تشغيل (lazy) —
     صفحة القائمة فيها محاضرات كتير، ومفيش داعي N روابط موقّعة.
   - كل قفزة زمنية في الكارت (chip مرجع، مقطع تفريغ) بتعدي `seekTo` في
     السياق — فالتشغيل بينتقل مع المحتوى.
   - «تتبّع»: أثناء التشغيل بنحدّد المقطع الحالي عبر focusSegment — فيتلوّن
     ويتمرّر له تلقائيًا في التفريغ وفي عبارات الشرح المكثف.
   ========================================================================== */

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

export function LectureAudioPlayer({
  lectureId,
  durationSeconds,
  segments,
}: {
  lectureId: string;
  /** المدة المعروفة من قاعدة البيانات — fallback قبل ما الميتاداتا تيجي. */
  durationSeconds: number | null;
  /** المقاطع بتوقيتها — للنقطية (تتبّع الصوت في التفريغ والشرح). */
  segments: TimedSegment[];
}) {
  const { registerAudio, focusSegment } = useLectureCitation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSegRef = useRef<number | null>(null);

  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(durationSeconds ?? 0);
  const [rate, setRate] = useState<number>(1);
  const [follow, setFollow] = useState(true);

  /** أول تشغيل → نجيب رابطًا موقّعًا (مرة واحدة). */
  const ensureUrl = useCallback(async () => {
    if (url || loading) return url;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/lectures/${lectureId}/audio`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data?.url) {
        setError(data?.error?.message || "مقدرناش نجهّز الصوت. جرّب تاني.");
        return null;
      }
      setUrl(data.url as string);
      if (typeof data.durationSeconds === "number" && data.durationSeconds > 0) {
        setTotal((t) => t || data.durationSeconds);
      }
      return data.url as string;
    } catch {
      setError("حصلت مشكلة شبكة — جرّب تاني.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [lectureId, url, loading]);

  const onToggle = useCallback(async () => {
    const el = audioRef.current;
    if (!el) {
      const next = await ensureUrl();
      if (!next) return;
      setPlaying(true);
      return;
    }
    if (el.paused) {
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [ensureUrl]);

  /** تتبّع: المقطع الحالي = آخر مقطع بدايته ≤ currentTime. */
  const onTimeUpdate = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    setCurrent(el.currentTime);
    if (!follow || el.paused || segments.length === 0) return;
    let lo = 0;
    let hi = segments.length - 1;
    let found: number | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (segments[mid].start <= el.currentTime) {
        found = segments[mid].index;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (found !== null && found !== lastSegRef.current) {
      lastSegRef.current = found;
      focusSegment(found);
    }
  }, [follow, focusSegment, segments]);

  const onLoadedMetadata = useCallback(() => {
    const el = audioRef.current;
    if (el && Number.isFinite(el.duration) && el.duration > 0) setTotal(el.duration);
  }, []);

  const onEnded = useCallback(() => {
    setPlaying(false);
    lastSegRef.current = null;
  }, []);

  const seek = useCallback((seconds: number) => {
    const el = audioRef.current;
    if (el) {
      el.currentTime = Math.max(0, seconds);
    }
    setCurrent(Math.max(0, seconds));
  }, []);

  const applyRate = useCallback((next: number) => {
    setRate(next);
    const el = audioRef.current;
    if (el) el.playbackRate = next;
  }, []);

  // ⚠️ unregister عند الخروج — عشان context ميفضلش شايل عنصر من كارت تاني.
  useEffect(() => {
    return () => registerAudio(null);
  }, [registerAudio]);

  const dur = total > 0 ? formatTimestamp(total) : null;

  return (
    <div className="rounded-xl border border-[var(--rule)] bg-[var(--card-primary)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
          <Headphones size={14} aria-hidden />
          استوديو المحاضرة
        </span>

        <button
          type="button"
          onClick={onToggle}
          disabled={loading || Boolean(error)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          aria-label={playing ? "إيقاف مؤقت" : "تشغيل التسجيل"}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : playing ? (
            <Pause size={16} aria-hidden />
          ) : (
            <Play size={16} aria-hidden />
          )}
        </button>

        <span className="text-xs text-ink-soft ltr-num">
          {formatTimestamp(current)}
          {dur ? ` / ${dur}` : ""}
        </span>

        <input
          type="range"
          min={0}
          max={Math.max(1, total)}
          step={1}
          value={Math.min(current, total || 0)}
          onChange={(e) => seek(Number(e.target.value))}
          className="h-1.5 min-w-[120px] flex-1 accent-[var(--accent)]"
          aria-label="شريط التقدّم"
        />

        <label className="flex items-center gap-1 text-xs text-ink-soft">
          <span className="sr-only">السرعة</span>
          <select
            value={rate}
            onChange={(e) => applyRate(Number(e.target.value))}
            className="rounded-lg border border-[var(--rule)] bg-transparent px-1.5 py-1 text-xs"
            aria-label="سرعة التشغيل"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s} className="ltr-num">
                {s}×
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => setFollow((v) => !v)}
          aria-pressed={follow}
          className={`rounded-lg border px-2 py-1 text-xs font-semibold transition ${
            follow
              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
              : "border-[var(--rule)] text-ink-soft hover:text-ink"
          }`}
        >
          تتبّع
        </button>
      </div>

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600" role="alert">
          <AlertTriangle size={12} aria-hidden />
          {error}
        </p>
      )}

      {url && (
        <audio
          ref={(el) => {
            audioRef.current = el;
            registerAudio(el);
          }}
          src={url}
          preload="metadata"
          autoPlay={playing}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          onEnded={onEnded}
          className="hidden"
        />
      )}
    </div>
  );
}
