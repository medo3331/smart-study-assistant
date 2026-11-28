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

import type { NoteImage, NoteText, NotesTemplate, PageFormat, Stroke } from "./types";

/** A4 at 96dpi. Page coordinates are stored in this space. */
export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;

/** لون سطور الشرح الخلفية — أغمق شوية من الرمادي الفاتح عشان السطر يبان وأوضح. */
export const RULE_INK = "#d8dee6";
/** لون نقاط قالب النقاط — نفس فكرة RULE_INK لكن للنقاط. */
export const DOT_INK = "#c7ccd6";

/** مقاس النوتة الجديد — A4 عرضي: صفحة أكبر وأعرض من الافتراضي القديم. */
export const DEFAULT_PAGE_FORMAT: PageFormat = "wide";

/** أبعاد كل مقاس صفحة مدعوم، بإحداثيات الصفحة (96dpi). */
export const PAGE_FORMAT_DIMENSIONS: Record<PageFormat, { width: number; height: number }> = {
  a4: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
  wide: { width: 1123, height: 794 },
  slide: { width: 1280, height: 720 },
};

/** أبعاد الصفحة حسب مقاس النوتة — النوتات القديمة من غير مقاس تُقرأ A4 طولي. */
export function pageDimensions(format: PageFormat | undefined): { width: number; height: number } {
  return PAGE_FORMAT_DIMENSIONS[format ?? "a4"];
}

export const PAGE_FORMAT_OPTIONS: readonly { id: PageFormat; label: string }[] = [
  { id: "a4", label: "A4 طولي" },
  { id: "wide", label: "A4 عرضي (أوسع)" },
  { id: "slide", label: "شاشة عرض 16:9" },
];

export const TEMPLATE_OPTIONS: readonly { id: NotesTemplate; label: string }[] = [
  { id: "lined", label: "مسطّر" },
  { id: "grid", label: "مربعات" },
  { id: "dotted", label: "نقط" },
  { id: "cornell", label: "كورنل" },
  { id: "arabic", label: "خط عربي" },
  { id: "columns", label: "عمودين" },
  { id: "planner", label: "مخطط يومي" },
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
  // 🖌️ فرشاة — سميكة وبتنحّف مع السرعة (إحساس فرشاة حقيقية).
  brush: { widthScale: 2.2, alpha: 0.92, composite: "source-over" },
  // 🖍️ شمعي — حواف خشنة وملمس حبيبي (٣ طبقات متزحة).
  crayon: { widthScale: 1.6, alpha: 0.62, composite: "source-over" },
  // ✨ نيون — توهج حوالين خط رفيع حاد.
  neon: { widthScale: 1.1, alpha: 1, composite: "source-over" },
};

/** ضوضاء حتمية (deterministic) من فهرس القطعة — للملمس الخشن.
 *  بدل Math.random اللي يكسر إعادة الرسم بنفس الشكل. */
function jitterAt(index: number, seed: number): number {
  const value = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453;
  return value - Math.floor(value); // [0, 1)
}

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
 * Expand a two-point shape stroke into the polyline segments its outline is
 * made of, so hit-testing and erasing behave on the visible geometry instead
 * of the invisible diagonal between the two handles.
 */
export function shapeOutlinePoints(stroke: Stroke): [number, number][] {
  const [start, end] = stroke.points;
  if (!start || !end) return stroke.points;
  const [x0, y0] = start;
  const [x1, y1] = end;

  switch (stroke.shape) {
    case "rect":
      return [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
      ];
    case "line":
    case "arrow":
      return [
        [x0, y0],
        [x1, y1],
      ];
    case "triangle": {
      const left = Math.min(x0, x1);
      const right = Math.max(x0, x1);
      const top = Math.min(y0, y1);
      const bottom = Math.max(y0, y1);
      return [
        [(left + right) / 2, top],
        [right, bottom],
        [left, bottom],
        [(left + right) / 2, top],
      ];
    }
    case "diamond": {
      const left = Math.min(x0, x1);
      const right = Math.max(x0, x1);
      const top = Math.min(y0, y1);
      const bottom = Math.max(y0, y1);
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      return [
        [cx, top],
        [right, cy],
        [cx, bottom],
        [left, cy],
        [cx, top],
      ];
    }
    case "star": {
      const left = Math.min(x0, x1);
      const right = Math.max(x0, x1);
      const top = Math.min(y0, y1);
      const bottom = Math.max(y0, y1);
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      const rx = (right - left) / 2;
      const ry = (bottom - top) / 2;
      const outline: [number, number][] = [];
      // نجمة خماسية: 10 رؤوس بالتناوب (خارجي/داخلي) — من فوق لتحت.
      for (let i = 0; i <= 10; i += 1) {
        const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const radius = i % 2 === 0 ? 1 : 0.42;
        outline.push([cx + rx * radius * Math.cos(angle), cy + ry * radius * Math.sin(angle)]);
      }
      return outline;
    }
    case "ellipse": {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const rx = Math.abs(x1 - x0) / 2;
      const ry = Math.abs(y1 - y0) / 2;
      if (rx === 0 || ry === 0) return [[x0, y0], [x1, y1]];
      const outline: [number, number][] = [];
      const steps = Math.max(12, Math.round(Math.max(rx, ry) / 4));
      for (let i = 0; i <= steps; i += 1) {
        const angle = (i / steps) * Math.PI * 2;
        outline.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
      }
      return outline;
    }
    default:
      return stroke.points;
  }
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

  if (stroke.polished) {
    // Even width with a soft pen-lift taper at both ends — the signature of
    // a confident, beautified stroke.
    const t = index / (points.length - 1);
    const edge = Math.min(t, 1 - t);
    const taper = edge < 0.12 ? 0.7 + 0.3 * (edge / 0.12) : 1;
    if (typeof stroke.pressure === "number" && stroke.pressure > 0) {
      return base * (0.85 + 0.3 * clamp01(stroke.pressure)) * taper;
    }
    return base * taper;
  }

  if (typeof stroke.pressure === "number" && stroke.pressure > 0) {
    return base * (0.65 + 0.7 * clamp01(stroke.pressure));
  }

  const [x0, y0] = points[index - 1];
  const [x1, y1] = points[index];
  const speed = Math.hypot(x1 - x0, y1 - y0);
  if (stroke.tool === "brush") {
    // الفرشاة أصرم في التنحيف — الحركة السريعة بترقّ الخط جدًا.
    return base * Math.max(0.3, 1.1 - speed / 26);
  }
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
  const points = stroke.shape ? shapeOutlinePoints(stroke) : stroke.points;
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

/** Bounding box of a text block, given a measuring context. */
export function textBounds(
  measure: Pick<CanvasRenderingContext2D, "measureText" | "font">,
  text: NoteText,
): { x: number; y: number; width: number; height: number } {
  const lines = text.text.split("\n");
  const lineHeight = text.size * 1.5;
  let width = 0;
  for (const line of lines) {
    measure.font = `${text.size}px ${text.font || "system-ui, 'Segoe UI', Tahoma, sans-serif"}`;
    width = Math.max(width, measure.measureText(line || " ").width);
  }
  return {
    x: text.x,
    y: text.y,
    width,
    height: lineHeight * lines.length,
  };
}

/** True when a point lies inside an axis-aligned rectangle. */
export function pointInRect(
  x: number,
  y: number,
  rect: { x: number; y: number; width: number; height: number },
  padding = 0,
): boolean {
  return (
    x >= rect.x - padding &&
    x <= rect.x + rect.width + padding &&
    y >= rect.y - padding &&
    y <= rect.y + rect.height + padding
  );
}

/** Index of the image under a point, or -1. Later images win. */
export function imageAt(
  images: readonly NoteImage[],
  x: number,
  y: number,
  tolerance = 2,
): number {
  for (let i = images.length - 1; i >= 0; i -= 1) {
    if (pointInRect(x, y, images[i], tolerance)) return i;
  }
  return -1;
}

/** Index of the text block under a point, or -1. Later texts win. */
export function textAt(
  texts: readonly NoteText[],
  x: number,
  y: number,
  measure: Pick<CanvasRenderingContext2D, "measureText" | "font">,
  tolerance = 6,
): number {
  for (let i = texts.length - 1; i >= 0; i -= 1) {
    if (pointInRect(x, y, textBounds(measure, texts[i]), tolerance)) return i;
  }
  return -1;
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
    ctx.strokeStyle = RULE_INK;

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
      ctx.fillStyle = DOT_INK;
      const gap = 28;
      for (let y = gap; y < height; y += gap) {
        for (let x = gap; x < width; x += gap) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 🌱 خط عربي — سطور كثيرة بخط إرشادي رمادي فاتح وخط أحمر هادي،
    // مع خط علوٍ عريض للصف الأول (الأنسب لكتابة الرقعة والنسخ).
    if (template === "arabic") {
      const gap = 24;
      for (let y = gap; y < height; y += gap) {
        ctx.strokeStyle = "#fca5a5";
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
        ctx.stroke();
        ctx.strokeStyle = RULE_INK;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(0, y - gap * 0.45);
        ctx.lineTo(width, y - gap * 0.45);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 🗂️ عمودين — RTL: اليمين للشرح والشمال للتمارين/الملاحظات.
    if (template === "columns") {
      const midX = Math.round(width / 2);
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(midX + 0.5, 0);
      ctx.lineTo(midX + 0.5, height);
      ctx.stroke();
      ctx.strokeStyle = RULE_INK;
      ctx.lineWidth = 1;
      const gap = 32;
      for (let y = gap; y < height; y += gap) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(midX, y + 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(midX, y + 0.5);
        ctx.lineTo(width, y + 0.5);
        ctx.stroke();
      }
      // لافتات الأعمدة.
      ctx.fillStyle = "#94a3b8";
      ctx.font = "13px system-ui, 'Segoe UI', Tahoma, sans-serif";
      ctx.textBaseline = "top";
      if ("direction" in ctx) {
        (ctx as CanvasRenderingContext2D & { direction: CanvasDirection }).direction = "rtl";
      }
      ctx.textAlign = "center";
      ctx.fillText("الشرح", (midX + width) / 2, 10);
      ctx.fillText("التمارين", midX / 2, 10);
    }

    // 📅 مخطط يومي — رأس بالتاريخ، قايمة مهام، وأولوية/ملاحظات أسفل.
    if (template === "planner") {
      const headerHeight = 72;
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(16.5, 16.5, width - 33, headerHeight);
      ctx.beginPath();
      ctx.moveTo(16.5, headerHeight + 16.5);
      ctx.lineTo(width - 16.5, headerHeight + 16.5);
      ctx.stroke();

      // قايمة المهام — 10 خانات بخانة ✅ صغيرة.
      ctx.fillStyle = "#94a3b8";
      ctx.font = "13px system-ui, 'Segoe UI', Tahoma, sans-serif";
      if ("direction" in ctx) {
        (ctx as CanvasRenderingContext2D & { direction: CanvasDirection }).direction = "rtl";
      }
      ctx.textAlign = "right";
      ctx.fillText("المهام", width - 24, headerHeight + 30);

      ctx.strokeStyle = RULE_INK;
      ctx.lineWidth = 1;
      const taskCount = 10;
      const taskGap = Math.min(64, Math.floor((height - headerHeight - 140) / taskCount));
      for (let i = 0; i < taskCount; i += 1) {
        const y = headerHeight + 64 + i * taskGap;
        // خانة الصح.
        ctx.strokeRect(width - 44.5, y - 8.5, 18, 18);
        // سطر المهمة.
        ctx.beginPath();
        ctx.moveTo(24, y + 0.5);
        ctx.lineTo(width - 56, y + 0.5);
        ctx.stroke();
      }

      // شريط الملاحظات أسفل.
      const noteTop = height - 96;
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(16.5, noteTop);
      ctx.lineTo(width - 16.5, noteTop);
      ctx.stroke();
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("ملاحظات اليوم", width - 24, noteTop + 10);
    }

    // 📝 Cornell Notes — RTL: الكلمات المفتاحية يمين، الملاحظات شمال، الملخص تحت.
    if (template === "cornell") {
      const cueWidth = Math.round(width * 0.26);
      const summaryHeight = Math.round(height * 0.22);
      const dividerX = width - cueWidth + 0.5;
      const summaryTop = height - summaryHeight + 0.5;

      // مسطّر خفيف جوه منطقة الملاحظات (شمال عمود الكلمات).
      ctx.strokeStyle = RULE_INK;
      const gap = 32;
      for (let y = gap; y < summaryTop - gap / 2; y += gap) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(dividerX, y + 0.5);
        ctx.stroke();
      }

      // الفواصل الرئيسية أغمق شوية عشان تبان.
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(dividerX, 0);
      ctx.lineTo(dividerX, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, summaryTop);
      ctx.lineTo(width, summaryTop);
      ctx.stroke();

      // لافتات الأقسام — إرشاد لطيف مكتوب داخل الخلفية.
      ctx.fillStyle = "#94a3b8";
      ctx.font = "13px system-ui, 'Segoe UI', Tahoma, sans-serif";
      ctx.textBaseline = "top";
      if ("direction" in ctx) {
        (ctx as CanvasRenderingContext2D & { direction: CanvasDirection }).direction = "rtl";
      }
      ctx.textAlign = "center";
      ctx.fillText("الكلمات والأسئلة", width - cueWidth / 2, 10);
      ctx.fillText("الملاحظات", (width - cueWidth) / 2, 10);
      ctx.fillText("الملخص", width / 2, summaryTop + 8);
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

    // 🖍️ شمعي — ٣ طبقات متزحة بحبيبات حتمية: ملمس شمع حقيقي.
    if (stroke.tool === "crayon") {
      const width = ctx.lineWidth;
      for (let layer = 0; layer < 3; layer += 1) {
        const seed = layer * 1.7;
        const along = jitterAt(i, seed) * width - width / 2; // عرضي
        const across = jitterAt(i + 97, seed) * 2 - 1; // طولي طفيف
        ctx.save();
        ctx.globalAlpha *= 0.4;
        ctx.lineWidth = width * (0.55 + jitterAt(i + 31, seed) * 0.5);
        ctx.beginPath();
        ctx.moveTo(start[0] + across, start[1] + along);
        ctx.quadraticCurveTo(previous[0] + across, previous[1] + along, end[0] + across, end[1] + along);
        ctx.stroke();
        ctx.restore();
      }
      continue;
    }

    // ✨ نيون — هالة عريضة شفافة تحت الخط الحاد.
    if (stroke.tool === "neon") {
      ctx.save();
      ctx.globalAlpha *= 0.22;
      ctx.lineWidth = ctx.lineWidth * 2.6;
      ctx.beginPath();
      ctx.moveTo(start[0], start[1]);
      ctx.quadraticCurveTo(previous[0], previous[1], end[0], end[1]);
      ctx.stroke();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.moveTo(start[0], start[1]);
    ctx.quadraticCurveTo(previous[0], previous[1], end[0], end[1]);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Paint a two-point shape stroke (line, arrow, rectangle or ellipse).
 *
 * The head of an arrow is drawn as two short barbs whose length follows the
 * stroke width, so the arrow stays legible at every zoom level.
 */
export function paintShapeStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
): void {
  const [start, end] = stroke.points;
  if (!start || !end) return;
  const [x0, y0] = start;
  const [x1, y1] = end;

  ctx.save();
  ctx.globalAlpha = clamp01(stroke.opacity);
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = strokeBaseWidth(stroke);

  if (stroke.shape === "rect") {
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
    return;
  }

  // المضلعات (مثلث/معين/نجمة) بتترسم من مخططها الجاهز — نفس الهندسة
  // اللي بيتأصل عليها اختبار اللمس، فالرسم والتحديد متطابقين.
  if (stroke.shape === "triangle" || stroke.shape === "diamond" || stroke.shape === "star") {
    const outline = shapeOutlinePoints(stroke);
    ctx.beginPath();
    outline.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (stroke.shape === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(
      (x0 + x1) / 2,
      (y0 + y1) / 2,
      Math.abs(x1 - x0) / 2,
      Math.abs(y1 - y0) / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  if (stroke.shape === "arrow") {
    const angle = Math.atan2(y1 - y0, x1 - x0);
    const head = Math.max(8, strokeBaseWidth(stroke) * 3);
    for (const spread of [Math.PI / 7, -Math.PI / 7]) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(
        x1 - head * Math.cos(angle + spread),
        y1 - head * Math.sin(angle + spread),
      );
      ctx.stroke();
    }
  }

  ctx.restore();
}

/** Paint a text block. Arabic shaping is left to the browser text engine. */
export function paintText(
  ctx: CanvasRenderingContext2D,
  text: NoteText,
): void {
  const lines = text.text.split("\n");
  const lineHeight = text.size * 1.5;

  ctx.save();
  ctx.fillStyle = text.color;
  ctx.font = `${text.size}px ${text.font || "system-ui, 'Segoe UI', Tahoma, sans-serif"}`;
  ctx.textBaseline = "top";
  if ("direction" in ctx) {
    (ctx as CanvasRenderingContext2D & { direction: CanvasDirection }).direction = "rtl";
  }
  ctx.textAlign = "right";
  // هالة بيضاء حوالين كل حرف — النص يبان واضح فوق سطور الشرح أو الرسم من تحته.
  const haloWidth = Math.max(3, text.size / 6);
  lines.forEach((line, index) => {
    const x = text.x + 4;
    const y = text.y + index * lineHeight + 4;
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = haloWidth;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeText(line, x, y);
    ctx.restore();
    ctx.fillText(line, x, y);
  });
  ctx.restore();
}

/**
 * Paint an embedded image.
 *
 * `lookup` resolves a stored data URL to a decoded, ready-to-draw image. When
 * the image is not decoded yet the element is skipped — the editor repaints
 * once its cache finishes loading, so the page fills in progressively.
 */
export function paintImage(
  ctx: CanvasRenderingContext2D,
  image: NoteImage,
  lookup: (src: string) => CanvasImageSource | null,
): void {
  const decoded = lookup(image.src);
  if (!decoded) return;
  ctx.save();
  ctx.drawImage(decoded, image.x, image.y, image.width, image.height);
  ctx.restore();
}

/**
 * Dashed highlight around a selected element.
 *
 * Painted on top of the page content in screen space so the dashes stay the
 * same visual size at every zoom level.
 */
export function paintSelectionOutline(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
): void {
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(rect.x - 4, rect.y - 4, rect.width + 8, rect.height + 8);
  ctx.restore();
}

/** Paint a whole page — paper and strokes, no texts or images. */
export function renderPage(
  ctx: CanvasRenderingContext2D,
  template: NotesTemplate,
  strokes: readonly Stroke[],
  width: number = PAGE_WIDTH,
  height: number = PAGE_HEIGHT,
): void {
  paintPageBackground(ctx, template, width, height);
  for (const stroke of strokes) {
    if (stroke.shape) paintShapeStroke(ctx, stroke);
    else paintStroke(ctx, stroke);
  }
}

/**
 * Paint a whole page — paper, strokes, then texts and images on top.
 *
 * `lookup` is required because images may not be decoded yet; the editor
 * repaints when its cache resolves, so nothing is lost, just deferred.
 */
export function renderPageContent(
  ctx: CanvasRenderingContext2D,
  template: NotesTemplate,
  content: {
    strokes: readonly Stroke[];
    texts: readonly NoteText[];
    images: readonly NoteImage[];
  },
  width: number = PAGE_WIDTH,
  height: number = PAGE_HEIGHT,
  lookup: (src: string) => CanvasImageSource | null = () => null,
): void {
  paintPageBackground(ctx, template, width, height);
  for (const image of content.images) paintImage(ctx, image, lookup);
  for (const stroke of content.strokes) {
    if (stroke.shape) paintShapeStroke(ctx, stroke);
    else paintStroke(ctx, stroke);
  }
  for (const text of content.texts) paintText(ctx, text);
}
