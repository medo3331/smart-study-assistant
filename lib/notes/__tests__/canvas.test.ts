import { describe, it, expect } from "vitest";
import {
  distanceToSegment,
  hitTestStroke,
  segmentWidth,
  strokeAt,
  strokeBaseWidth,
  strokeMaxWidth,
  TEMPLATE_OPTIONS,
} from "../canvas";
import { validatePage } from "../validation";
import type { Stroke } from "../types";

function makeStroke(points: [number, number][], overrides: Partial<Stroke> = {}): Stroke {
  return {
    id: "s1",
    tool: "pen",
    color: "#111827",
    thickness: 4,
    opacity: 1,
    points,
    ...overrides,
  };
}

describe("distanceToSegment", () => {
  it("is zero for a point on the segment", () => {
    expect(distanceToSegment(5, 0, 0, 0, 10, 0)).toBeCloseTo(0);
  });

  it("is the perpendicular distance for a point beside the segment", () => {
    expect(distanceToSegment(5, 5, 0, 0, 10, 0)).toBeCloseTo(5);
  });

  it("clamps to the endpoints instead of the infinite line", () => {
    expect(distanceToSegment(-5, 0, 0, 0, 10, 0)).toBeCloseTo(5);
    expect(distanceToSegment(15, 0, 0, 0, 10, 0)).toBeCloseTo(5);
  });

  it("handles a degenerate segment", () => {
    expect(distanceToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5);
  });
});

describe("hitTestStroke", () => {
  const line = makeStroke([
    [0, 0],
    [100, 0],
  ]);

  it("hits a point near the stroke body", () => {
    expect(hitTestStroke(line, 50, 5)).toBe(true);
  });

  it("misses a point far from the stroke", () => {
    expect(hitTestStroke(line, 50, 40)).toBe(false);
  });

  it("hits a single-point stroke inside its radius", () => {
    const dot = makeStroke([[10, 10]]);
    expect(hitTestStroke(dot, 11, 10)).toBe(true);
    expect(hitTestStroke(dot, 40, 10)).toBe(false);
  });

  it("widens the hit area for thick strokes", () => {
    const thick = makeStroke(
      [
        [0, 0],
        [100, 0],
      ],
      { thickness: 40 },
    );
    expect(hitTestStroke(thick, 50, 18)).toBe(true);
    expect(hitTestStroke(line, 50, 18)).toBe(false);
  });
});

describe("strokeAt", () => {
  it("returns the topmost stroke under the point", () => {
    const bottom = makeStroke(
      [
        [0, 0],
        [100, 0],
      ],
      { id: "bottom" },
    );
    const top = makeStroke(
      [
        [0, 2],
        [100, 2],
      ],
      { id: "top" },
    );
    expect(strokeAt([bottom, top], 50, 1)).toBe(1);
  });

  it("returns -1 when nothing is under the point", () => {
    const stroke = makeStroke([
      [0, 0],
      [100, 0],
    ]);
    expect(strokeAt([stroke], 50, 200)).toBe(-1);
  });
});

describe("segmentWidth", () => {
  it("returns the base width for the first segment", () => {
    const stroke = makeStroke([
      [0, 0],
      [30, 0],
    ]);
    expect(segmentWidth(stroke, 0)).toBeCloseTo(strokeBaseWidth(stroke));
  });

  it("tapers a fast flick thinner than a slow draw", () => {
    const slow = makeStroke([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    const fast = makeStroke([
      [0, 0],
      [60, 0],
      [120, 0],
    ]);
    expect(segmentWidth(slow, 1)).toBeGreaterThan(segmentWidth(fast, 1));
  });

  it("honours stylus pressure over speed", () => {
    const light = makeStroke(
      [
        [0, 0],
        [60, 0],
      ],
      { pressure: 0.2 },
    );
    const heavy = makeStroke(
      [
        [0, 0],
        [60, 0],
      ],
      { pressure: 1 },
    );
    expect(segmentWidth(heavy, 1)).toBeGreaterThan(segmentWidth(light, 1));
  });

  it("never reports a width below the hit-radius floor", () => {
    const stroke = makeStroke([
      [0, 0],
      [100, 0],
    ]);
    expect(strokeMaxWidth(stroke)).toBeGreaterThan(0);
  });
});

describe("templates", () => {
  it("offers four distinct page rules", () => {
    const ids = TEMPLATE_OPTIONS.map((option) => option.id);
    expect(ids).toEqual(["lined", "grid", "dotted", "blank"]);
    expect(new Set(ids).size).toBe(4);
  });

  it("accepts every offered template in the storage contract", () => {
    for (const option of TEMPLATE_OPTIONS) {
      const result = validatePage({
        id: "p1",
        ownerId: "anon:o1",
        notebookId: "nb1",
        template: option.id,
        persistedSnapshot: {},
        localJournal: [],
        quarantined: false,
        revision: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      expect(result.valid).toBe(true);
    }
  });

  it("still rejects an unknown template", () => {
    const result = validatePage({
      id: "p1",
      ownerId: "anon:o1",
      notebookId: "nb1",
      template: "fancy",
      persistedSnapshot: {},
      localJournal: [],
      quarantined: false,
      revision: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.valid).toBe(false);
  });
});

describe("shape strokes", () => {
  it("hit-tests a rectangle by its outline, not its diagonal", () => {
    const rect: Stroke = {
      ...makeStroke([[10, 10], [110, 60]]),
      shape: "rect",
    };
    // On the top edge, but far from the diagonal between the two handles.
    expect(hitTestStroke(rect, 60, 10)).toBe(true);
    expect(hitTestStroke(rect, 60, 35)).toBe(false);
  });

  it("hit-tests an ellipse by its outline", () => {
    const ellipse: Stroke = {
      ...makeStroke([[0, 0], [100, 100]]),
      shape: "ellipse",
    };
    expect(hitTestStroke(ellipse, 0, 50)).toBe(true);
    expect(hitTestStroke(ellipse, 50, 50)).toBe(false);
  });

  it("hit-tests arrows along the shaft", () => {
    const arrow: Stroke = {
      ...makeStroke([[0, 0], [100, 0]]),
      shape: "arrow",
    };
    expect(hitTestStroke(arrow, 50, 0)).toBe(true);
    expect(hitTestStroke(arrow, 50, 40)).toBe(false);
  });

  it("counts shapes inside strokeAt ordering", () => {
    const bottom: Stroke = { ...makeStroke([[0, 0], [100, 0]]), shape: "line" };
    const top = makeStroke([[50, 30], [51, 30]]);
    expect(strokeAt([bottom, top], 50, 0)).toBe(0);
    expect(strokeAt([bottom, top], 50, 30)).toBe(1);
  });
});
