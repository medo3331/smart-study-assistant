import { describe, it, expect } from "vitest";
import {
  beautifyStroke,
  beautifyStrokes,
  resampleByDistance,
  smoothPoints,
  straightenIfElongated,
  straightenRows,
} from "../beautify";
import type { Stroke } from "../types";

function strokeFrom(points: [number, number][], overrides: Partial<Stroke> = {}): Stroke {
  return {
    id: "s1",
    tool: "pen",
    color: "#111827",
    thickness: 3,
    opacity: 1,
    points,
    ...overrides,
  };
}

/** A shaky horizontal line: mostly-x wobble around a straight path. */
function shakyLine(): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i <= 60; i += 1) {
    const x = i * 8;
    const y = 200 + Math.sin(i * 1.7) * 9 + (i % 3 === 0 ? 4 : -2);
    points.push([x, y]);
  }
  return points;
}

describe("resampleByDistance", () => {
  it("produces near-uniform spacing", () => {
    const points: [number, number][] = [
      [0, 0],
      [1, 0],
      [50, 0],
      [51, 0],
      [100, 0],
    ];
    const resampled = resampleByDistance(points, 10);
    expect(resampled[0]).toEqual([0, 0]);
    // Last point survives so the stroke keeps its full length.
    expect(resampled.at(-1)![0]).toBeCloseTo(100, 5);
    for (let i = 1; i < resampled.length; i += 1) {
      const gap = resampled[i][0] - resampled[i - 1][0];
      expect(gap).toBeGreaterThan(5);
      expect(gap).toBeLessThan(15);
    }
  });

  it("never drops a short stroke", () => {
    const points: [number, number][] = [
      [0, 0],
      [2, 1],
    ];
    expect(resampleByDistance(points, 10)).toHaveLength(2);
  });
});

describe("smoothPoints", () => {
  it("flattens jitter without moving the endpoints", () => {
    const points: [number, number][] = [
      [0, 0],
      [10, 8],
      [20, -8],
      [30, 8],
      [40, -8],
      [50, 0],
    ];
    const smoothed = smoothPoints(points, 0.8);
    expect(smoothed[0]).toEqual([0, 0]);
    expect(smoothed.at(-1)).toEqual([50, 0]);
    // The zig-zag amplitude shrinks.
    const originalSpread = 16;
    const ys = smoothed.slice(1, -1).map(([, y]) => Math.abs(y));
    expect(Math.max(...ys)).toBeLessThan(originalSpread);
  });

  it("returns short strokes untouched", () => {
    const points: [number, number][] = [
      [0, 0],
      [5, 5],
    ];
    expect(smoothPoints(points, 1)).toEqual(points);
  });
});

describe("straightenIfElongated", () => {
  it("snaps a long wobbly line straight", () => {
    const points = shakyLine();
    const straightened = straightenIfElongated(points);
    // Wobble is measured against the endpoint baseline: the stroke may keep
    // a deliberate tilt, but the jitter along it must vanish.
    const [x0, y0] = points[0];
    const [x1, y1] = points.at(-1)!;
    let maxDeviation = 0;
    for (const [x, y] of straightened) {
      const baseline = x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      maxDeviation = Math.max(maxDeviation, Math.abs(y - baseline));
    }
    expect(maxDeviation).toBeLessThan(1);
    expect(straightened[0]).toEqual(points[0]);
    expect(straightened.at(-1)).toEqual(points.at(-1));
  });

  it("leaves curvy letter-like strokes alone", () => {
    const points: [number, number][] = [];
    for (let i = 0; i <= 40; i += 1) {
      const angle = (i / 40) * Math.PI * 2;
      points.push([200 + Math.cos(angle) * 30, 200 + Math.sin(angle) * 30]);
    }
    expect(straightenIfElongated(points)).toEqual(points);
  });
});

describe("beautifyStroke", () => {
  it("preserves identity, style and shape metadata", () => {
    const stroke = strokeFrom(shakyLine(), { color: "#dc2626", thickness: 5 });
    const beautified = beautifyStroke(stroke, { strength: 0.7, straightenRows: false });
    expect(beautified.id).toBe(stroke.id);
    expect(beautified.color).toBe(stroke.color);
    expect(beautified.thickness).toBe(stroke.thickness);
    expect(beautified.tool).toBe(stroke.tool);
  });

  it("passes through shape strokes and dots untouched", () => {
    const arrow = strokeFrom(
      [
        [10, 10],
        [100, 100],
      ],
      { shape: "arrow" },
    );
    expect(beautifyStroke(arrow)).toBe(arrow);
    const dot = strokeFrom([[50, 50]]);
    expect(beautifyStroke(dot)).toBe(dot);
  });

  it("reduces wobble on a shaky line", () => {
    const original = shakyLine();
    const beautified = beautifyStroke(strokeFrom(original), {
      strength: 0.7,
      straightenRows: false,
    });
    const spread = (points: [number, number][]) =>
      Math.max(...points.map(([, y]) => y)) - Math.min(...points.map(([, y]) => y));
    expect(spread(beautified.points)).toBeLessThan(spread(original));
  });
});

describe("straightenRows", () => {
  it("drifts text-sized strokes toward a common row center", () => {
    // Two strokes on roughly the same line but written at different heights.
    const upper = strokeFrom([
      [10, 195],
      [60, 197],
      [110, 193],
    ]);
    const lower = strokeFrom([
      [140, 208],
      [190, 210],
      [240, 206],
    ]);
    const result = straightenRows([upper, lower], 1);
    const centerY = (stroke: Stroke) => {
      const ys = stroke.points.map(([, y]) => y);
      return (Math.min(...ys) + Math.max(...ys)) / 2;
    };
    const gap = Math.abs(centerY(result[1]) - centerY(result[0]));
    expect(gap).toBeLessThan(Math.abs(centerY(lower) - centerY(upper)));
  });

  it("never moves tall (drawing) strokes", () => {
    const tall = strokeFrom([
      [50, 100],
      [52, 400],
      [54, 700],
    ]);
    const smallA = strokeFrom([
      [100, 195],
      [150, 197],
    ]);
    const smallB = strokeFrom([
      [200, 209],
      [250, 207],
    ]);
    const result = straightenRows([tall, smallA, smallB], 1);
    expect(result[0]).toBe(tall);
  });
});

describe("beautifyStrokes", () => {
  it("handles a whole page and keeps the stroke count", () => {
    const strokes = [
      strokeFrom(shakyLine()),
      strokeFrom(
        [
          [10, 300],
          [40, 302],
        ],
        { id: "s2" },
      ),
    ];
    const result = beautifyStrokes(strokes, { strength: 0.6, straightenRows: true });
    expect(result).toHaveLength(2);
  });
});

describe("corner-aware smoothing (beautify v2)", () => {
  /** An L: horizontal leg, sharp 90° corner, vertical leg — with wobble. */
  function lShapedWobble(): [number, number][] {
    const points: [number, number][] = [];
    for (let i = 0; i <= 30; i += 1) {
      points.push([i * 8, 100 + Math.sin(i * 2.3) * 6]);
    }
    for (let i = 1; i <= 20; i += 1) {
      points.push([240 + Math.cos(i * 2.1) * 5, 100 + i * 8]);
    }
    return points;
  }

  it("keeps the sharp corner while smoothing the wobble", () => {
    const original = lShapedWobble();
    const beautified = beautifyStroke(strokeFrom(original), {
      strength: 0.8,
      straightenRows: false,
    });

    // Find the point nearest the true corner (240, 100) and measure its turn.
    const nearest = beautified.points.reduce((best, point) =>
      Math.hypot(point[0] - 240, point[1] - 100) <
      Math.hypot(best[0] - 240, best[1] - 100)
        ? point
        : best,
    );
    const index = beautified.points.indexOf(nearest);
    const [ax, ay] = beautified.points[index - 1];
    const [bx, by] = beautified.points[index];
    const [cx, cy] = beautified.points[index + 1];
    const inX = bx - ax;
    const inY = by - ay;
    const outX = cx - bx;
    const outY = cy - by;
    const cos = (inX * outX + inY * outY) /
      (Math.hypot(inX, inY) * Math.hypot(outX, outY));
    const turnDeg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    expect(turnDeg).toBeGreaterThan(55);

    // The wobble on the legs is still relaxed.
    const spread = (stroke: Stroke) => {
      const leg = stroke.points.slice(0, 25).map(([, y]) => y);
      return Math.max(...leg) - Math.min(...leg);
    };
    expect(spread(beautified)).toBeLessThan(spread(strokeFrom(original)));
  });

  it("marks beautified strokes as polished", () => {
    const beautified = beautifyStroke(strokeFrom(shakyLine()), {
      strength: 0.6,
      straightenRows: false,
    });
    expect(beautified.polished).toBe(true);
    expect(beautifyStroke(strokeFrom([[0, 0], [1, 1]])).polished).toBeUndefined();
  });
});
