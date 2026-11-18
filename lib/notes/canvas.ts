// lib/notes/canvas.ts
//
// Pure rendering + geometry for the notebook canvas.
//
// Everything here is deterministic: the same stroke always paints the same
// pixels. In particular the taper is derived from the stored geometry, never
// from timers or randomness — a re-render after a reload must be identical to
// the original, otherwise the saved page would look different from the page
// the student drew.
//
// The module is DOM-free at import time (functions take a 2D context), so the
// geometry helpers are unit-testable in Node.

import type { NotesTemplate, Stroke } from "./types";

/** A4 at 96dpi. Page coordinates are stored in this space. */
export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;

export const TEMPLATE_OPTIONS: readonly { id: NotesTemplate; label: string }[] = [
  { id: "lined", label: "مسطّر" },
  { id: "grid", label: "مربعات" },
  { id: "dotted", label: "نقط" },
  { id: "blank", label: "فاضي" },
];

export type ToolStyle = {
  /** Multiplier on the stroke's own thickness. */
  widthScale: number;
  /** Multiplier on the stroke's own opacity. */
  alpha: number;
  composite: GlobalCompositeOperation;
};

export const TOOL_STYLE: Record<Stroke["tool"], ToolStyle> = {
  pen: { widthScale: 1, alpha: 1, composite: "source-over" },
  ink: { widthScale: 1.25, alpha: 1, composite: "source-over" },
  pencil: { widthScale: 0.6, alpha: 0.55, composite: "source-over" },
  highlighter: { widthScale: 3.4, alpha: 0.28, composite: "multiply" },
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Width of a single stroke, before per-segment taper. */
export function strokeBaseWidth(stroke: Stroke): number {
  const style = TOOL_STYLE[stroke.tool] ?? TOOL_STYLE.pen;
  return Math.max(0.6, stroke.thickness * style.widthScale);
}

/** Widest point of a stroke — used as the eraser hit radius. */
export function strokeMaxWidth(stroke: Stroke): number {
  return strokeBaseWidth(stroke) * 1.05;
}

/**
 * Per-segment width.
 *
 * A stylus reports pressure, which is the honest signal. Without one we taper
 * on speed: a fast flick is thinner than a deliberate draw. Both paths are
 * pure functions of the stored points, so replay is stable.
 */
export function segmentWidth(stroke: Stroke, index: number): number {
  const base = strokeBaseWidth(stroke);
  const points = stroke.points;
  if (index < 1 || index >= points.length) return base;

  if (typeof stroke.pressure === "number" && stroke.pressure > 0) {
    return base * (0.65 + 0.7 * clamp01(stroke.pressure));
  }

  const [x0, y0] = points[index - 1];
  const [x1, y1] = points[index];
  const speed = Math.hypot(x1 - x0, y1 - y0);
  return base * Math.max(0.55, 1.05 - speed / 40);
}

/** Shortest distance from a point to a finite segment. */
export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);

  // Projection of AP onto AB, clamped to the segment.
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * True when a point lands on a stroke, within `tolerance` page pixels.
 *
 * Used by the stroke eraser: you erase a stroke by touching it, which is how
 * a real notebook behaves, instead of deleting whatever you drew last.
 */
export function hitTestStroke(
  stroke: Stroke,
  x: number,
  y: number,
  tolerance = 4,
): boolean {
  const points = stroke.points;
  if (points.length === 0) return false;

  const radius = strokeMaxWidth(stroke) / 2 + tolerance;

  if (points.length === 1) {
    return Math.hypot(points[0][0] - x, points[0][1] - y) <= radius;
  }

  for (let i = 1; i < points.length; i += 1) {
    const distance = distanceToSegment(
      x,
      y,
      points[i - 1][0],
      points[i - 1][1],
      points[i][0],
      points[i][1],
    );
    if (distance <= radius) return true;
  }

  return false;
}

/** Index of the topmost stroke under a point, or -1. Later strokes win. */
export function strokeAt(
  strokes: readonly Stroke[],
  x: number,
  y: number,
  tolerance = 4,
): number {
  for (let i = strokes.length - 1; i >= 0; i -= 1) {
    if (hitTestStroke(strokes[i], x, y, tolerance)) return i;
  }
  return -1;
}

function midpoint(
  a: [number, number],
  b: [number, number],
): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** Paint the paper: white sheet plus the chosen ruling. */
export function paintPageBackground(
  ctx: CanvasRenderingContext2D,
  template: NotesTemplate,
  width: number,
  height: number,
): void {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  if (template !== "blank") {
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#e5e7eb";

    if (template === "lined") {
      const gap = 32;
      for (let y = gap; y < height; y += gap) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
        ctx.stroke();
      }
      ctx.strokeStyle = "#fca5a5";
      ctx.beginPath();
      ctx.moveTo(56.5, 0);
      ctx.lineTo(56.5, height);
      ctx.stroke();
    }

    if (template === "grid") {
      const gap = 32;
      for (let y = gap; y < height; y += gap) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
        ctx.stroke();
      }
      for (let x = gap; x < width; x += gap) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
        ctx.stroke();
      }
    }

    if (template === "dotted") {
      ctx.fillStyle = "#d1d5db";
      const gap = 28;
      for (let y = gap; y < height; y += gap) {
        for (let x = gap; x < width; x += gap) {
          ctx.beginPath();
          ctx.arc(x, y, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  ctx.restore();
}

/**
 * Paint one stroke.
 *
 * Consecutive segments are joined through midpoints with quadratic curves, so
 * fast pointer sampling reads as a smooth line rather than a polyline.
 */
export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const points = stroke.points;
  if (points.length === 0) return;

  const style = TOOL_STYLE[stroke.tool] ?? TOOL_STYLE.pen;

  ctx.save();
  ctx.globalAlpha = clamp01(stroke.opacity * style.alpha);
  ctx.globalCompositeOperation = style.composite;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (points.length === 1) {
    // A tap has to leave a dot, otherwise a single click looks like a no-op.
    ctx.beginPath();
    ctx.arc(points[0][0], points[0][1], Math.max(0.5, strokeBaseWidth(stroke) / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];

    const start =
      i === 1 ? previous : midpoint(points[i - 2], points[i - 1]);
    const end =
      i === points.length - 1 ? current : midpoint(points[i - 1], points[i]);

    ctx.lineWidth = segmentWidth(stroke, i);
    ctx.beginPath();
    ctx.moveTo(start[0], start[1]);
    ctx.quadraticCurveTo(previous[0], previous[1], end[0], end[1]);
    ctx.stroke();
  }

  ctx.restore();
}

/** Paint a whole page in page coordinates. */
export function renderPage(
  ctx: CanvasRenderingContext2D,
  template: NotesTemplate,
  strokes: readonly Stroke[],
  width: number = PAGE_WIDTH,
  height: number = PAGE_HEIGHT,
): void {
  paintPageBackground(ctx, template, width, height);
  for (const stroke of strokes) paintStroke(ctx, stroke);
}
