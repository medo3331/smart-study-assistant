"use client";

/**
 * 🎬 PresentMode — وضع العرض التقديمي التفاعلي.
 *
 * يحوّل صفحات الدفتر إلى سلايدات بملء الشاشة:
 * - تنقّل بالأسهم / المسافة / الأزرار (اتجاه RTL: السهم الشمال = التالي).
 * - قلم ليزر مؤقت للإشارة أثناء الشرح، وقلم رسم لطبقة شروح فوق السلايد.
 * - نظرة عامة على كل السلايدات (O)، عدّاد، مؤقّت، وملء شاشة (F).
 * - كل حاجة in-memory: الرسومات التوضيحية تختفي عند الخروج ومفيش أي حفظ.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { paintStroke } from "@/lib/notes/canvas";
import type { UiPage } from "@/lib/notes/editor-kit";
import type { Stroke } from "@/lib/notes/types";

export type PresentModeProps = {
  pages: UiPage[];
  initialIndex: number;
  pageSize: { width: number; height: number };
  /** يرسم محتوى الصفحة (ورق + مسكات + نصوص + صور) داخل أي سياق. */
  renderPage: (
    page: UiPage,
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => void;
  onClose: () => void;
};

type LaserPoint = { x: number; y: number; t: number };

const LASER_LIFE_MS = 700;
const LASER_COLOR = "#ef4444";

/** 🖌️ رسم طبقة الشروح فوق السلايد. */
function paintAnnotations(
  ctx: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
): void {
  for (const stroke of strokes) paintStroke(ctx, stroke);
}

export default function PresentMode({
  pages,
  initialIndex,
  pageSize,
  renderPage,
  onClose,
}: PresentModeProps) {
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(initialIndex, pages.length - 1)),
  );
  const [overview, setOverview] = useState(false);
  const [laserOn, setLaserOn] = useState(true);
  const [penColor, setPenColor] = useState("#ef4444");
  const [penMode, setPenMode] = useState(false);

  const slideRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  /** المقاس المعروض للسلايد — بيتحسب عشان طبقة الرسم تطابق السلايد بالبكسل. */
  const [display, setDisplay] = useState(() => ({ w: pageSize.width, h: pageSize.height }));
  /** شروح كل صفحة — in-memory فقط، بتتمسح عند الخروج. */
  const annotationsRef = useRef<Map<string, Stroke[]>>(new Map());
  const drawingRef = useRef<Stroke | null>(null);
  const laserRef = useRef<LaserPoint[]>([]);
  const laserRafRef = useRef(0);
  const startedAtRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  const page = pages[index] ?? null;

  // ---- رسم السلايد الحالي + طبقة الشروح ----

  const repaint = useCallback(() => {
    const slide = slideRef.current;
    const ink = inkRef.current;
    if (!slide || !ink) return;
    const dpr = window.devicePixelRatio || 1;
    const scale = dpr * 2;
    slide.width = Math.round(pageSize.width * scale);
    slide.height = Math.round(pageSize.height * scale);
    const ctx = slide.getContext("2d");
    if (ctx) {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageSize.width, pageSize.height);
      if (page) renderPage(page, ctx, pageSize.width, pageSize.height);
    }
    ink.width = Math.round(pageSize.width * scale);
    ink.height = Math.round(pageSize.height * scale);
    const inkCtx = ink.getContext("2d");
    if (inkCtx) {
      inkCtx.setTransform(scale, 0, 0, scale, 0, 0);
      inkCtx.clearRect(0, 0, pageSize.width, pageSize.height);
      paintAnnotations(inkCtx, annotationsRef.current.get(page?.id ?? "") ?? []);
    }
  }, [page, pageSize, renderPage]);

  useEffect(() => {
    repaint();
  }, [repaint]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const compute = () => {
      const rect = stage.getBoundingClientRect();
      const pad = 44;
      const availW = Math.max(120, rect.width - pad * 2);
      const availH = Math.max(90, rect.height - pad * 2);
      const ratio = pageSize.width / pageSize.height;
      let w = availW;
      let h = w / ratio;
      if (h > availH) {
        h = availH;
        w = h * ratio;
      }
      setDisplay({ w: Math.floor(w), h: Math.floor(h) });
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [pageSize]);

  // ---- مؤقّت العرض ----

  useEffect(() => {
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  // ---- حلقة الليزر ----

  const repaintLaser = useCallback(() => {
    const ink = inkRef.current;
    const ctx = ink?.getContext("2d");
    if (!ink || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const scale = dpr * 2;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, pageSize.width, pageSize.height);
    paintAnnotations(ctx, annotationsRef.current.get(page?.id ?? "") ?? []);
    const now = Date.now();
    laserRef.current = laserRef.current.filter((point) => now - point.t < LASER_LIFE_MS);
    for (const point of laserRef.current) {
      const age = (now - point.t) / LASER_LIFE_MS;
      ctx.beginPath();
      ctx.fillStyle = LASER_COLOR;
      ctx.globalAlpha = 1 - age;
      ctx.arc(point.x, point.y, 5 * (1 - age * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [page, pageSize]);

  useEffect(() => {
    if (!laserOn) {
      laserRef.current = [];
      return;
    }
    const loop = () => {
      repaintLaser();
      laserRafRef.current = window.requestAnimationFrame(loop);
    };
    laserRafRef.current = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(laserRafRef.current);
  }, [laserOn, repaintLaser]);

  // ---- التنقّل ----

  const go = useCallback(
    (delta: number) => {
      setIndex((value) => Math.max(0, Math.min(pages.length - 1, value + delta)));
    },
    [pages.length],
  );

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void container.requestFullscreen().catch(() => undefined);
  }, []);

  // ---- لوحة المفاتيح (RTL: الشمال = التالي) ----

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (overview) setOverview(false);
        else onClose();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      switch (event.key) {
        case "ArrowLeft":
        case "PageDown":
        case " ":
          event.preventDefault();
          go(1);
          break;
        case "ArrowRight":
        case "PageUp":
          event.preventDefault();
          go(-1);
          break;
        case "Home":
          setIndex(0);
          break;
        case "End":
          setIndex(pages.length - 1);
          break;
        case "o":
        case "O":
          setOverview((value) => !value);
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [go, onClose, overview, pages.length, toggleFullscreen]);

  // ---- الإشارة/الرسم على السلايد ----

  const toPageCoords = useCallback((event: React.PointerEvent): [number, number] | null => {
    const ink = inkRef.current;
    if (!ink) return null;
    const rect = ink.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return [
      ((event.clientX - rect.left) / rect.width) * pageSize.width,
      ((event.clientY - rect.top) / rect.height) * pageSize.height,
    ];
  }, [pageSize]);

  const onPointerDown = (event: React.PointerEvent) => {
    const point = toPageCoords(event);
    if (!point || !page) return;
    if (penMode) {
      drawingRef.current = {
        id: `present-${Date.now()}`,
        tool: "ink",
        color: penColor,
        thickness: 4,
        opacity: 0.9,
        points: [point],
        pressure: 0.5,
      };
    } else {
      laserRef.current.push({ x: point[0], y: point[1], t: Date.now() });
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const point = toPageCoords(event);
    if (!point) return;
    const stroke = drawingRef.current;
    if (stroke) {
      stroke.points.push(point);
      const ink = inkRef.current;
      const inkCtx = ink?.getContext("2d");
      if (inkCtx) {
        const dpr = window.devicePixelRatio || 1;
        const scale = dpr * 2;
        inkCtx.setTransform(scale, 0, 0, scale, 0, 0);
        inkCtx.clearRect(0, 0, pageSize.width, pageSize.height);
        paintAnnotations(inkCtx, [...(annotationsRef.current.get(page?.id ?? "") ?? []), stroke]);
      }
    } else if (laserOn) {
      laserRef.current.push({ x: point[0], y: point[1], t: Date.now() });
    }
  };

  const onPointerUp = () => {
    const stroke = drawingRef.current;
    if (!stroke || !page) return;
    drawingRef.current = null;
    const list = annotationsRef.current.get(page.id) ?? [];
    annotationsRef.current.set(page.id, [...list, stroke]);
    repaint();
  };

  const clearAnnotations = () => {
    if (!page) return;
    annotationsRef.current.set(page.id, []);
    laserRef.current = [];
    repaint();
  };

  // ---- نظرة عامة ----

  const ThumbCanvas = useCallback(
    ({ thumbPage }: { thumbPage: UiPage }) => {
      const ref = useRef<HTMLCanvasElement>(null);
      useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const width = 160;
        const scale = width / pageSize.width;
        canvas.width = width * 2;
        canvas.height = Math.round(pageSize.height * scale) * 2;
        ctx.setTransform(2 * scale, 0, 0, 2 * scale, 0, 0);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageSize.width, pageSize.height);
        renderPage(thumbPage, ctx, pageSize.width, pageSize.height);
      }, [thumbPage, renderPage, pageSize]);
      return <canvas ref={ref} aria-hidden="true" className="present-thumb-canvas" />;
    },
    [renderPage, pageSize],
  );

  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="present-root" ref={containerRef} role="dialog" aria-modal="true" aria-label="العرض التقديمي">
      <div className="present-stage" ref={stageRef}>
        <div className="present-sheet" style={{ width: display.w, height: display.h }}>
          <canvas
            ref={slideRef}
            className="present-slide"
            style={{ width: display.w, height: display.h }}
            aria-label={`سلايد ${index + 1}`}
          />
          <canvas
            ref={inkRef}
            className="present-ink"
            style={{ width: display.w, height: display.h }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        </div>
        {index > 0 ? (
          <button type="button" className="present-nav present-prev" onClick={() => go(-1)} aria-label="السلايد السابق">
            ›
          </button>
        ) : null}
        {index < pages.length - 1 ? (
          <button type="button" className="present-nav present-next" onClick={() => go(1)} aria-label="السلايد التالي">
            ‹
          </button>
        ) : null}
      </div>

      <div className="present-bar">
        <div className="present-bar-side">
          <button type="button" className="present-btn" onClick={() => go(-1)} disabled={index === 0}>
            ▶ السابق
          </button>
          <span className="present-counter">
            {index + 1} / {pages.length}
          </span>
          <button type="button" className="present-btn" onClick={() => go(1)} disabled={index === pages.length - 1}>
            التالي ◀
          </button>
        </div>

        <div className="present-bar-side present-bar-tools">
          <button
            type="button"
            className="present-btn"
            data-active={laserOn}
            onClick={() => {
              setLaserOn((value) => !value);
              setPenMode(false);
            }}
            title="قلم ليزر — أشر بيدك على الشرح"
          >
            🔴 ليزر
          </button>
          <button
            type="button"
            className="present-btn"
            data-active={penMode}
            onClick={() => setPenMode((value) => !value)}
            title="قلم شرح — ارسم فوق السلايد أثناء العرض"
          >
            🖊️ قلم شرح
          </button>
          {penMode ? (
            <input
              type="color"
              className="present-color"
              value={penColor}
              onChange={(event) => setPenColor(event.target.value)}
              aria-label="لون قلم الشرح"
            />
          ) : null}
          <button type="button" className="present-btn" onClick={clearAnnotations} title="امسح رسومات الشرح على السلايد">
            🧽 مسح
          </button>
        </div>

        <div className="present-bar-side">
          <span className="present-timer" title="مدة العرض">
            ⏱ {minutes}:{seconds}
          </span>
          <button type="button" className="present-btn" data-active={overview} onClick={() => setOverview((value) => !value)} title="نظرة عامة على السلايدات (O)">
            ▦ الشرائح
          </button>
          <button type="button" className="present-btn" onClick={toggleFullscreen} title="ملء الشاشة (F)">
            ⛶
          </button>
          <button type="button" className="present-btn present-close" onClick={onClose} title="خروج (Esc)">
            ✕ خروج
          </button>
        </div>
      </div>

      <div className="present-progress" aria-hidden="true">
        <span style={{ width: `${((index + 1) / Math.max(1, pages.length)) * 100}%` }} />
      </div>

      {overview ? (
        <div className="present-overview" onClick={() => setOverview(false)}>
          <div className="present-overview-grid" onClick={(event) => event.stopPropagation()}>
            {pages.map((thumbPage, thumbIndex) => (
              <button
                key={thumbPage.id}
                type="button"
                className="present-thumb"
                data-active={thumbIndex === index}
                onClick={() => {
                  setIndex(thumbIndex);
                  setOverview(false);
                }}
                aria-label={`انتقل للسلايد ${thumbIndex + 1}`}
              >
                <ThumbCanvas thumbPage={thumbPage} />
                <span>{thumbIndex + 1}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
