"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Headphones, Pause, Play, Loader2, AlertTriangle } from "lucide-react";

import { useLectureCitation, formatTimestamp } from "./lecture-citation-context";
import type { TimedSegment } from "@/lib/ai/lecture-intensive-prompts";

/* ==========================================================================
   🎧 مشغّل الاستوديو — Phase 23 + 24ب
   ==========================================================================
   تجربة «استوديو المحاضرة»: الصوت + التفريغ + الشرح المكثف في تزامن واحد.

   - الصوت مش بيتحمّل ولا الرابط بيتولّد غير عند أول ضغطة تشغيل (lazy) —
     صفحة القائمة فيها محاضرات كتير، ومفيش داعي N روابط موقّعة.
   - ⚠️ التشغيل مش معتمد على `autoPlay` بعد الـ fetch: المتصفحات (خصوصًا
     Safari/iOS) بتحجب التشغيل التلقائي اللي بيحصل بعد عملية شبكة بره
     إيماءة المستخدم. الحل: بنطلب `play()` فعليًا أول ما العنصر والرابط
     يبقوا جاهزين (pendingPlay)، ولو اتمنع بنورّي رسالة واضحة وزر إعادة المحاولة.
   - أخطاء التحميل (`onError`) مش بتفضل صامتة زي زمان — بتظهر للطالب.
   - كل قفزة زمنية في الكارت (chip مرجع، مقطع تفريغ) بتعدي `seekTo` في
     السياق — فالتشغيل بينتقل مع المحتوى.
   - «تتبّع»: أثناء التشغيل بنحدّد المقطع الحالي عبر focusSegment — فيتلون
     ويتمرّر له تلقائيًا في التفريغ وفي عبارات الشرح المكثف.
   ========================================================================== */

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

const PLAY_BLOCKED_MESSAGE = "المتصفح منع التشغيل التلقائي — اضغط زر التشغيل مرة تانية.";
const PLAY_FAILED_MESSAGE = "حصلت مشكلة في تشغيل الصوت — جرّب تاني.";
const LOAD_ERROR_MESSAGE = "حصلت مشكلة في تحميل الصوت — جرّب تاني أو حدّث الصفحة.";

function isAutoplayBlock(err: unknown): boolean {
  return err instanceof DOMException && err.name === "NotAllowedError";
}

export function LectureAudioPlayer({
  lectureId,
  durationSeconds,
  segments,
}: {
  lectureId: string;
  /** المدة المعروفة من قاعدة البيانات — fallback قبل ما الميتاداتا تيجي. */
  durationSeconds: number | null;
  /** المقاطع بتوقيتها — للنقطة (تتبّع الصوت في التفريغ والشرح). */
  segments: TimedSegment[];
}) {
  const { registerAudio, focusSegment } = useLectureCitation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSegRef = useRef<number | null>(null);

  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const [pendingPlay, setPendingPlay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(durationSeconds ?? 0);
  const [rate, setRate] = useState<number>(1);
  const [follow, setFollow] = useState(true);

  /** محاولة تشغيل فعلية — بترفض بهدوء مش بصمت: أي رفض بيبان للطالب. */
  const attemptPlay = useCallback((el: HTMLAudioElement) => {
    el.play()
      .then(() => setPlaying(true))
      .catch((err: unknown) => {
        setPlaying(false);
        setPlayError(isAutoplayBlock(err) ? PLAY_BLOCKED_MESSAGE : PLAY_FAILED_MESSAGE);
      })
      .finally(() => setPendingPlay(false));
  }, []);

  /** أول تشغيل → نجيب رابطًا موقّعًا (مرة واحدة). */
  const ensureUrl = useCallback(async () => {
    if (url || loading) return url;
    setLoading(true);
    setError(null);
    setPlayError(null);
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
    setPlayError(null);
    const el = audioRef.current;
    if (!el) {
      const next = await ensureUrl();
      if (!next) return;
      setPendingPlay(true);
      return;
    }
    if (el.paused) {
      attemptPlay(el);
    } else {
      el.pause();
    }
  }, [attemptPlay, ensureUrl]);

  // بعد ما الرابط يوصل والعنصر يتولّد — نشغّل فعليًا بدل الاعتماد على
  // autoPlay اللي المتصفحات بتحجبه بعد fetch خارج إيماءة المستخدم.
  useEffect(() => {
    if (!pendingPlay || !url) return;
    const el = audioRef.current;
    if (!el) return;
    attemptPlay(el);
  }, [attemptPlay, pendingPlay, url]);

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
  const visibleError = error ?? playError;

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
          disabled={loading}
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

      {visibleError && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600" role="alert">
          <AlertTriangle size={12} aria-hidden />
          {visibleError}
        </p>
      )}

      <audio
        ref={(el) => {
          audioRef.current = el;
          registerAudio(el);
        }}
        src={url ?? undefined}
        preload={url ? "metadata" : "none"}
        onPlay={() => {
          setPlaying(true);
          setPlayError(null);
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
        onError={() => {
          setPlaying(false);
          setPendingPlay(false);
          if (url) setPlayError(LOAD_ERROR_MESSAGE);
        }}
        className="hidden"
      />
    </div>
  );
}
