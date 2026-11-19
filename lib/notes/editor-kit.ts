// lib/notes/editor-kit.ts
//
// 🧰 ثوابت وأنواع ودوال نقية بتاع المحرر — من غير أي React.
//
// ده جزء تفكيك NotebookEditor: كل اللي مش بيلمس حالة المكوّن عاش
// هنا عشان المحرر نفسه يفضل بيهتم بالتفاعل والحفظ بس. كل حاجة هنا
// pure — بتاخد مدخلات وترجّع نتيجة، فسهلة الاختبار وسهلة إعادة الاستخدام.

import { shapeOutlinePoints } from "./canvas";
import type { Stroke, StrokeShape } from "./types";

// ---- الأنواع ----

export type Tool =
  | Stroke["tool"]
  | "eraser"
  | "select"
  | "lasso"
  | "text"
  | StrokeShape;

/** What the user has selected with the select tool. */
export type Selection =
  | { kind: "stroke"; id: string }
  | { kind: "text"; id: string }
  | { kind: "image"; id: string }
  | null;

/** In-progress text editing, positioned in page coordinates. */
export type TextDraft = {
  /** null → creating a new text block. */
  id: string | null;
  x: number;
  y: number;
  value: string;
};

export type UiPage = {
  id: string;
  template: Stroke["tool"] extends never ? never : import("./types").NotesTemplate;
  content: import("./types").PageContent;
  revision: number;
};

// ---- الثوابت ----

export const PALETTE = ["#111827", "#dc2626", "#2563eb", "#059669", "#d97706", "#7c3aed"];
export const AUTOSAVE_DELAY_MS = 600;
export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 4;
export const ERASER_TOLERANCE = 6;
/** Images larger than this (page px) get scaled down on insert. */
export const MAX_IMAGE_DIMENSION = 1400;

export const TOOL_OPTIONS: { id: Tool; label: string; icon: string; key: string }[] = [
  { id: "select", label: "تحديد", icon: "⬚", key: "v" },
  { id: "lasso", label: "حبل تحديد (تحديد متعدد)", icon: "⌇", key: "l" },
  { id: "pen", label: "قلم", icon: "🖊️", key: "1" },
  { id: "ink", label: "حبر", icon: "🖋️", key: "2" },
  { id: "pencil", label: "رصاص", icon: "✏️", key: "3" },
  { id: "highlighter", label: "تظليل", icon: "🖍️", key: "4" },
  { id: "eraser", label: "ممحاة", icon: "🧽", key: "5" },
];

export const SHAPE_OPTIONS: { id: StrokeShape; label: string; icon: string }[] = [
  { id: "line", label: "خط", icon: "／" },
  { id: "arrow", label: "سهم", icon: "↗" },
  { id: "rect", label: "مستطيل", icon: "▭" },
  { id: "ellipse", label: "دايرة", icon: "◯" },
];

export const FONT_OPTIONS: { id: string; label: string }[] = [
  { id: "system-ui, 'Segoe UI', Tahoma, sans-serif", label: "افتراضي" },
  { id: "'Segoe UI', Tahoma, sans-serif", label: "Segoe UI" },
  { id: "Tahoma, 'Noto Naskh Arabic', serif", label: "نسخ" },
  { id: "Georgia, 'Times New Roman', serif", label: "Georgia" },
  { id: "'Courier New', monospace", label: "Monospace" },
];

// ---- دوال نقية ----

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Bounding box of a stroke (its outline geometry). */
export function strokeBounds(stroke: Stroke): { x: number; y: number; width: number; height: number } {
  const points = shapeOutlinePoints(stroke);
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export const isShapeTool = (candidate: Tool): candidate is StrokeShape =>
  candidate === "line" || candidate === "arrow" || candidate === "rect" || candidate === "ellipse";

// ---- Lasso (حبل تحديد) — هندسة بسيطة ----

/** نقطة داخل مضلع (ray casting) — للحبل المرسوم حر. */
export function pointInPolygon(
  point: [number, number],
  polygon: ReadonlyArray<[number, number]>,
): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** تقاطع تقريبي مضلع × مستطيل: ركن من المستطيل جوه المضلع، أو نقطة من
 *  المضلع جوه المستطيل، أو تقاطع أضلاع المضلع مع أضلاع المستطيل. */
export function polygonTouchesRect(
  polygon: ReadonlyArray<[number, number]>,
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  if (polygon.length < 2) return false;
  const corners: Array<[number, number]> = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
  ];
  if (corners.some((corner) => pointInPolygon(corner, polygon))) return true;
  if (polygon.some((point) => pointInRectLocal(point, rect))) return true;
  // تقاطع أضلاع (segment intersect) — بيقصي الحالات اللي الحبل يلف حوالين الشكل.
  const rectEdges: Array<[[number, number], [number, number]]> = [
    [[rect.x, rect.y], [rect.x + rect.width, rect.y]],
    [[rect.x + rect.width, rect.y], [rect.x + rect.width, rect.y + rect.height]],
    [[rect.x + rect.width, rect.y + rect.height], [rect.x, rect.y + rect.height]],
    [[rect.x, rect.y + rect.height], [rect.x, rect.y]],
  ];
  const segmentsIntersect = (
    a1: [number, number], a2: [number, number],
    b1: [number, number], b2: [number, number],
  ): boolean => {
    const d = (cf: [number, number], s1: [number, number], s2: [number, number]) =>
      (s2[0] - s1[0]) * (cf[1] - s1[1]) - (s2[1] - s1[1]) * (cf[0] - s1[0]);
    const d1 = d(b1, a1, a2), d2 = d(b2, a1, a2);
    const d3 = d(a1, b1, b2), d4 = d(a2, b1, b2);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (rectEdges.some(([r1, r2]) => segmentsIntersect(a, b, r1, r2))) return true;
  }
  return false;
}

/** فحص نقطة داخل مستطيل — نسخة محلية عشان الموديول ده ميعتمدش على canvas.ts. */
function pointInRectLocal(
  point: [number, number],
  rect: { x: number; y: number; width: number; height: number },
  tolerance = 0,
): boolean {
  const [x, y] = point;
  return (
    x >= rect.x - tolerance &&
    x <= rect.x + rect.width + tolerance &&
    y >= rect.y - tolerance &&
    y <= rect.y + rect.height + tolerance
  );
}
