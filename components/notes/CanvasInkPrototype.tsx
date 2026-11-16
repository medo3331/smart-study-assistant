"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * Phase 1A — Canvas Ink Prototype
 * =================================
 * Tests: Pointer Events, pressure, coalesced events, resize, 1000-stroke perf.
 * No persistence, no IndexedDB, no sync.
 */

type Point = { x: number; y: number; pressure: number };

type Stroke = { id: string; points: Point[]; color: string; baseWidth: number };

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const FALLBACK_PRESSURE = 0.5;

function normalizePressure(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return FALLBACK_PRESSURE;
  if (raw > 1) return 1;
  return raw;
}

export default function CanvasInkPrototype() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const isDrawingRef = useRef(false);
  const dprRef = useRef(1);

  const [strokeCount, setStrokeCount] = useState(0);
  const [lastPressure, setLastPressure] = useState(FALLBACK_PRESSURE);
  const [perfMs, setPerfMs] = useState<number | null>(null);
  const [coalescedSupported, setCoalescedSupported] = useState<boolean | null>(null);

  // ---- low-level helpers (defined first to avoid TDZ) ----
  const getContext = useCallback((): CanvasRenderingContext2D | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  }, []);

  const drawSegment = useCallback(
    (ctx: CanvasRenderingContext2D, a: Point, b: Point, color: string, baseWidth: number) => {
      const dpr = dprRef.current;
      ctx.strokeStyle = color;
      ctx.lineWidth = baseWidth * (0.5 + a.pressure * 1.0) * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(a.x * dpr, a.y * dpr);
      ctx.lineTo(b.x * dpr, b.y * dpr);
      ctx.stroke();
    },
    []
  );

  const toPoint = useCallback((e: PointerEvent | React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX / dprRef.current,
      y: (e.clientY - rect.top) * scaleY / dprRef.current,
      pressure: normalizePressure(e.pressure),
    };
  }, []);

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokesRef.current) {
      for (let i = 1; i < stroke.points.length; i++) {
        drawSegment(ctx, stroke.points[i - 1], stroke.points[i], stroke.color, stroke.baseWidth);
      }
    }
  }, [getContext, drawSegment]);

  // ---- canvas sizing ----
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    redrawAll();
  }, [redrawAll]);

  // ---- pointer handlers ----
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      isDrawingRef.current = true;
      const pt = toPoint(e.nativeEvent);
      const stroke: Stroke = {
        id: uid(),
        points: [pt],
        color: "#1f2937",
        baseWidth: 3,
      };
      currentStrokeRef.current = stroke;
      strokesRef.current.push(stroke);
      setStrokeCount(strokesRef.current.length);
      setLastPressure(pt.pressure);
    },
    [toPoint]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current || !currentStrokeRef.current) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      const ctx = getContext();
      if (!canvas || !ctx) return;

      const native = e.nativeEvent;
      const events: PointerEvent[] =
        typeof native.getCoalescedEvents === "function"
          ? (native.getCoalescedEvents() as PointerEvent[])
          : [native];

      if (coalescedSupported === null) {
        setCoalescedSupported(typeof native.getCoalescedEvents === "function");
      }

      const stroke = currentStrokeRef.current;
      for (const ev of events) {
        const pt = toPoint(ev);
        const prev = stroke.points[stroke.points.length - 1];
        stroke.points.push(pt);
        drawSegment(ctx, prev, pt, stroke.color, stroke.baseWidth);
        setLastPressure(pt.pressure);
      }
    },
    [getContext, drawSegment, toPoint, coalescedSupported]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    currentStrokeRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // On cancel, discard the in-progress stroke entirely (do not leave a
    // stray single-point stroke or inflate the stroke count).
    const stroke = currentStrokeRef.current;
    if (stroke) {
      const idx = strokesRef.current.lastIndexOf(stroke);
      if (idx >= 0) strokesRef.current.splice(idx, 1);
    }
    isDrawingRef.current = false;
    currentStrokeRef.current = null;
    const ctx = getContext();
    const canvas = canvasRef.current;
    if (ctx && canvas) redrawAll();
    setStrokeCount(strokesRef.current.length);
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, [getContext, redrawAll]);

  // ---- resize observer ----
  useEffect(() => {
    resizeCanvas();
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(container);
    window.addEventListener("resize", resizeCanvas);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [resizeCanvas]);

  // ---- 1000-stroke benchmark ----
  const runBenchmark = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    const dpr = dprRef.current;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    strokesRef.current = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      const x0 = Math.random() * w;
      const y0 = Math.random() * h;
      const x1 = x0 + (Math.random() - 0.5) * 60;
      const y1 = y0 + (Math.random() - 0.5) * 60;
      const pressure = 0.3 + Math.random() * 0.7;
      const stroke: Stroke = {
        id: uid(),
        points: [
          { x: x0, y: y0, pressure },
          { x: x1, y: y1, pressure },
        ],
        color: "#1f2937",
        baseWidth: 3,
      };
      strokesRef.current.push(stroke);
      drawSegment(ctx, stroke.points[0], stroke.points[1], stroke.color, stroke.baseWidth);
    }
    const t1 = performance.now();
    setStrokeCount(strokesRef.current.length);
    setPerfMs(t1 - t0);
  }, [getContext, drawSegment]);

  const clearAll = useCallback(() => {
    strokesRef.current = [];
    const ctx = getContext();
    const canvas = canvasRef.current;
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStrokeCount(0);
    setPerfMs(null);
  }, [getContext]);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold">Canvas Ink Prototype (Phase 1A)</span>
        <span>Strokes: {strokeCount}</span>
        <span>Last pressure: {lastPressure.toFixed(2)}</span>
        <span>Coalesced events: {coalescedSupported === null ? "—" : coalescedSupported ? "supported" : "not supported"}</span>
        {perfMs !== null && <span>1000-stroke draw time: {perfMs.toFixed(2)} ms</span>}
        <button
          type="button"
          onClick={runBenchmark}
          className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700"
        >
          Run 1000-stroke benchmark
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded bg-gray-500 px-3 py-1 text-white hover:bg-gray-600"
        >
          Clear
        </button>
      </div>
      <div
        ref={containerRef}
        className="relative h-[400px] w-full overflow-hidden rounded border border-gray-300 bg-white"
        style={{ touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          style={{ touchAction: "none" }}
        />
      </div>
      <p className="text-xs text-gray-500">
        Draw with mouse, touch, or pen. Pressure affects stroke width (fallback 0.5 for mouse/touch).
      </p>
    </div>
  );
}
