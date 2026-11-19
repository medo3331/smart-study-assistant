// lib/notes/beautify.ts
//
// Natural Beautify — handwriting enhancement WITHOUT changing what the
// student wrote.
//
// Everything here is a pure function over stored vectors. The original
// strokes are never destroyed: the editor keeps them as `originalStrokes`
// next to the beautified copy, so the student can flip back at any time.
//
// Pipeline (per stroke):
//   1. Resample      — uniform arc-length spacing kills pen-sample jitter.
//   2. Laplacian     — pulls each point toward its neighbours; endpoints are
//                      pinned so words never drift.
//   3. Straighten    — strokes that are very elongated (underlines, lines)
//                      get projected onto their own baseline.
// Page level:
//   4. Row straightening — text-sized strokes clustered into rows drift a
//                          fraction of the distance toward the row's median
//                          baseline. Drawings (tall strokes) are never moved.

import type { Stroke } from "./types";

export type BeautifyOptions = {
  /** 0..1 — how aggressive the smoothing pass is. */
  strength: number;
  /** Pull text rows toward a common baseline. */
  straightenRows: boolean;
};

const DEFAULT_OPTIONS: BeautifyOptions = { strength: 0.6, straightenRows: true };

/** Uniformly resample a polyline every `step` page pixels (arc length). */
export function resampleByDistance(
  points: readonly [number, number][],
  step: number,
): [number, number][] {
  if (points.length < 2 || step <= 0) return [...points];

  const output: [number, number][] = [points[0]];
  let accumulator = 0;
  let [px, py] = points[0];

  for (let i = 1; i < points.length; i += 1) {
    const [cx, cy] = points[i];
    let segment = Math.hypot(cx - px, cy - py);

    while (accumulator + segment >= step) {
      const remaining = step - accumulator;
      const t = remaining / segment;
      px = px + (cx - px) * t;
      py = py + (cy - py) * t;
      output.push([px, py]);
      segment = Math.hypot(cx - px, cy - py);
      accumulator = 0;
    }
    accumulator += segment;
    px = cx;
    py = cy;
  }

  // Keep the true ending point so a stroke never comes up short.
  const last = output[output.length - 1];
  const tailDistance = Math.hypot(px - last[0], py - last[1]);
  if (output.length === 1) {
    // Shorter than one step: keep both endpoints so nothing vanishes.
    if (points.length > 1) output.push([px, py]);
  } else if (tailDistance > step * 0.35) {
    output.push([px, py]);
  } else {
    output[output.length - 1] = [px, py];
  }
  return output;
}

/**
 * Laplacian smoothing with pinned endpoints.
 *
 * `iterations` and `alpha` derive from `strength`, so a light touch keeps
 * character corners and a strong pass relaxes them toward clean curves.
 */
export function smoothPoints(
  points: readonly [number, number][],
  strength: number,
): [number, number][] {
  if (points.length < 3) return [...points];

  const alpha = 0.3 + 0.5 * clamp01(strength);
  const iterations = 2 + Math.round(5 * clamp01(strength));

  let current: [number, number][] = [...points];
  for (let pass = 0; pass < iterations; pass += 1) {
    const next: [number, number][] = current.map((point, index) => {
      if (index === 0 || index === current.length - 1) return point;
      const [px, py] = point;
      const [ax, ay] = current[index - 1];
      const [bx, by] = current[index + 1];
      return [
        px + alpha * ((ax + bx) / 2 - px),
        py + alpha * ((ay + by) / 2 - py),
      ];
    });
    current = next;
  }
  return current;
}

/**
 * Corner-aware smoothing — the beautify pass proper.
 *
 * Wobble is high-frequency: small, rapid direction changes. Letter corners
 * are LOW-frequency structure: one sharp turn. So we detect the sharp turns
 * first and PIN them, then run the Laplacian hard on everything between.
 * The result relaxes the tremor while the letter's skeleton — its corners —
 * stays exactly where the student put it. That is what keeps the output
 * reading as handwriting instead of a printed font.
 */
export function smoothPreservingCorners(
  points: readonly [number, number][],
  strength: number,
  cornerAngleDeg = 35,
): [number, number][] {
  return smoothCornersCore(points, strength, cornerAngleDeg).points;
}

/** Internal core: smoothed points PLUS the pinned corner coordinates, so the
 *  caller can re-plant them after any later resampling. */
function smoothCornersCore(
  points: readonly [number, number][],
  strength: number,
  cornerAngleDeg: number,
): { points: [number, number][]; corners: [number, number][] } {
  if (points.length < 3) return { points: [...points], corners: [] };

  // Corner detection with a WINDOWED direction comparison (~10px arms):
  // pen wobble averages out across the window, so only real corners light up.
  const step = points.length > 1 ? Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]) : 4;
  const window = Math.max(2, Math.round(10 / Math.max(1, step)));
  const protect = markCorners(points, cornerAngleDeg, window);
  // Pin the neighbours too, so a pinned point doesn't drift alone.
  for (let i = 1; i < protect.length - 1; i += 1) {
    if (protect[i]) {
      protect[i - 1] = true;
      protect[i + 1] = true;
    }
  }

  const corners: [number, number][] = [];
  for (let i = 1; i < protect.length - 1; i += 1) {
    // The center of each pinned run is the actual corner.
    if (protect[i] && !protect[i - 1]) {
      let end = i;
      while (end + 1 < protect.length && protect[end + 1]) end += 1;
      const mid = i + Math.floor((end - i) / 2);
      corners.push(points[mid]);
    }
  }

  const alpha = 0.3 + 0.5 * clamp01(strength);
  const iterations = 2 + Math.round(6 * clamp01(strength));

  let current: [number, number][] = [...points];
  for (let pass = 0; pass < iterations; pass += 1) {
    const next: [number, number][] = current.map((point, index) => {
      if (index === 0 || index === current.length - 1) return point;
      if (protect[index]) return point;
      const [px, py] = point;
      const [ax, ay] = current[index - 1];
      const [bx, by] = current[index + 1];
      return [
        px + alpha * ((ax + bx) / 2 - px),
        py + alpha * ((ay + by) / 2 - py),
      ];
    });
    current = next;
  }
  return { points: current, corners };
}

/**
 * Make sure every pinned corner survives a later resampling: the nearest
 * point of `evened` snaps to the corner's exact coordinates (or the corner
 * is inserted when the nearest point drifted too far).
 */
function replantCorners(
  evened: [number, number][],
  corners: readonly [number, number][],
  step: number,
): [number, number][] {
  if (corners.length === 0) return evened;
  const output = [...evened];
  for (const [cx, cy] of corners) {
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < output.length; i += 1) {
      const dist = Math.hypot(output[i][0] - cx, output[i][1] - cy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    }
    if (nearestDist > step * 0.45) {
      output.splice(nearest, 0, [cx, cy]);
    } else {
      output[nearest] = [cx, cy];
    }
  }
  return output;
}

/**
 * Indices of points where the path turns sharply (letter corners).
 *
 * Directions are compared over a WINDOW of points, not immediate neighbours:
 * pen wobble averages out across a ~10px window, so only real corners —
 * whose direction change survives the window — are protected.
 */
export function markCorners(
  points: readonly [number, number][],
  cornerAngleDeg = 35,
  window = 1,
): boolean[] {
  const protect = new Array<boolean>(points.length).fill(false);
  if (points.length < 2 * window + 1) return protect;
  const threshold = (cornerAngleDeg * Math.PI) / 180;

  for (let i = window; i < points.length - window; i += 1) {
    const [ax, ay] = points[i - window];
    const [bx, by] = points[i];
    const [cx, cy] = points[i + window];
    const inX = bx - ax;
    const inY = by - ay;
    const outX = cx - bx;
    const outY = cy - by;
    const inLen = Math.hypot(inX, inY);
    const outLen = Math.hypot(outX, outY);
    if (inLen === 0 || outLen === 0) continue;
    const cos = (inX * outX + inY * outY) / (inLen * outLen);
    const turn = Math.acos(clampNumber(cos, -1, 1));
    if (turn >= threshold) protect[i] = true;
  }
  return protect;
}

/**
 * Project a very elongated stroke onto its own baseline.
 *
 * A stroke whose length dwarfs its width is almost certainly an underline or
 * a line the student drew across the page; snapping it straight is always an
 * improvement. Curvy letter strokes never qualify.
 */
export function straightenIfElongated(
  points: readonly [number, number][],
  ratioThreshold = 8,
): [number, number][] {
  if (points.length < 2) return [...points];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const boxDiagonal = Math.hypot(width, height);

  // Elongated relative to the bounding box, and the path hugs its endpoints
  // (a true underline, not a curvy letter).
  if (boxDiagonal === 0) return [...points];
  const length = Math.hypot(points[points.length - 1][0] - points[0][0], points[points.length - 1][1] - points[0][1]);
  const straightness = length / boxDiagonal;
  const aspect = Math.max(width, height) / Math.max(1, Math.min(width, height));
  if (straightness < 0.9 || aspect < ratioThreshold) return [...points];

  const [x0, y0] = points[0];
  const [x1, y1] = points[points.length - 1];

  // Walk the polyline, keeping each point's arc-length progress but
  // dropping its perpendicular offset. The denominator is the WALKED total
  // (wobble included), otherwise long wobbly strokes overshoot the end.
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative.push(
      cumulative[i - 1] +
        Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]),
    );
  }
  const total = cumulative[cumulative.length - 1];
  if (total === 0) return [...points];

  const output: [number, number][] = [];
  for (let i = 0; i < points.length; i += 1) {
    const t = cumulative[i] / total;
    output.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
  }
  return output;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Beautify one stroke. Shape strokes and single dots pass through. */
export function beautifyStroke(
  stroke: Stroke,
  options: BeautifyOptions = DEFAULT_OPTIONS,
): Stroke {
  if (stroke.shape || stroke.points.length < 3) return stroke;

  // Resample step scales with the stroke's own size: small letters keep
  // detail, long lines get evenly spaced points.
  const box = strokeBox(stroke.points);
  const size = Math.max(box.width, box.height);
  const step = clampNumber(Math.max(2, size / 55), 2, 6);

  const resampled = resampleByDistance(stroke.points, step);
  const core = smoothCornersCore(resampled, options.strength, 35);
  // Smoothing shortens and re-bunches the path — even it out again so the
  // rendered width stays constant along the stroke, then re-plant the
  // pinned corners that the resampling would otherwise blunt.
  const evened = replantCorners(
    resampleByDistance(core.points, step),
    core.corners,
    step,
  );
  const straightened = straightenIfElongated(evened);

  return {
    ...stroke,
    points: straightened,
    // Even, gently tapered width — reads as a confident pen stroke.
    polished: true,
  };
}

function strokeBox(points: readonly [number, number][]): {
  width: number;
  height: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { width: maxX - minX, height: maxY - minY };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Row clustering: group freehand strokes whose vertical spans overlap, then
 * drift each stroke a fraction of `strength` toward its row's median center.
 *
 * Only "text-sized" strokes (height below `rowHeightLimit` and at least two
 * strokes in the row) participate, so diagrams and tall strokes never move.
 */
export function straightenRows(
  strokes: readonly Stroke[],
  strength: number,
  rowHeightLimit = 64,
): Stroke[] {
  if (strokes.length < 2 || strength <= 0) return [...strokes];

  const candidates = strokes
    .map((stroke, index) => ({ stroke, index }))
    .filter(({ stroke }) => {
      if (stroke.shape) return false;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const [, y] of stroke.points) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return maxY - minY <= rowHeightLimit;
    });

  if (candidates.length < 2) return [...strokes];

  // Sort by vertical center and group overlapping spans (sweep).
  const sorted = [...candidates].sort(
    (a, b) => strokeCenterY(a.stroke) - strokeCenterY(b.stroke),
  );
  const rows: { indices: number[]; centers: number[] }[] = [];
  for (const candidate of sorted) {
    const center = strokeCenterY(candidate.stroke);
    const row = rows.at(-1);
    if (row) {
      const rowMedian = median(row.centers);
      const rowHalf = rowHeightLimit / 2;
      if (Math.abs(center - rowMedian) <= rowHalf) {
        row.indices.push(candidate.index);
        row.centers.push(center);
        continue;
      }
    }
    rows.push({ indices: [candidate.index], centers: [center] });
  }

  const shifts = new Map<number, number>();
  for (const row of rows) {
    if (row.indices.length < 2) continue;
    const rowMedian = median(row.centers);
    for (const index of row.indices) {
      const center = row.centers[row.indices.indexOf(index)];
      shifts.set(index, (rowMedian - center) * clamp01(strength));
    }
  }
  if (shifts.size === 0) return [...strokes];

  return strokes.map((stroke, index) => {
    const shift = shifts.get(index);
    if (!shift || Math.abs(shift) < 0.5) return stroke;
    return {
      ...stroke,
      points: stroke.points.map(([x, y]) => [x, y + shift] as [number, number]),
    };
  });
}

function strokeCenterY(stroke: Stroke): number {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of stroke.points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return (minY + maxY) / 2;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Beautify a whole page: per-stroke passes first, then row straightening.
 *
 * Pure — the caller decides what to keep as the original and what to adopt.
 */
export function beautifyStrokes(
  strokes: readonly Stroke[],
  options: BeautifyOptions = DEFAULT_OPTIONS,
): Stroke[] {
  const perStroke = strokes.map((stroke) => beautifyStroke(stroke, options));
  if (!options.straightenRows) return perStroke;
  return straightenRows(perStroke, options.strength);
}
