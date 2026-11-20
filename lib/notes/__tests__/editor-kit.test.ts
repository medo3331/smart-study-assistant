// lib/notes/__tests__/editor-kit.test.ts
//
// 🧰 اختبارات الدوال النقية بتاعة المحرر — هندسة الحبل والأدوات.

import { describe, expect, it } from "vitest";

import {
  clamp,
  isShapeTool,
  newId,
  nowIso,
  pointInPolygon,
  polygonTouchesRect,
  TOOL_OPTIONS,
  strokeBounds,
  type Tool,
} from "../editor-kit";
import type { Stroke } from "../types";

const stroke = (points: Array<[number, number]>, shape?: Stroke["shape"]): Stroke => ({
  id: "s1",
  tool: "pen",
  ...(shape ? { shape } : {}),
  color: "#000",
  thickness: 2,
  opacity: 1,
  points,
});

describe("editor-kit — constants", () => {
  it("tool options have unique keys and ids", () => {
    const keys = TOOL_OPTIONS.map((option) => option.key);
    const ids = TOOL_OPTIONS.map((option) => option.id);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("editor-kit — pure helpers", () => {
  it("clamp keeps the value inside the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });

  it("newId returns unique ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()));
    expect(ids.size).toBe(200);
  });

  it("nowIso returns a parseable date", () => {
    expect(Number.isNaN(Date.parse(nowIso()))).toBe(false);
  });

  it("isShapeTool narrows shape tools", () => {
    expect(isShapeTool("rect")).toBe(true);
    expect(isShapeTool("line")).toBe(true);
    expect(isShapeTool("pen")).toBe(false);
    expect(isShapeTool("eraser" as Tool)).toBe(false);
    expect(isShapeTool("lasso")).toBe(false);
  });

  it("strokeBounds wraps the stroke points", () => {
    const bounds = strokeBounds(stroke([[10, 20], [50, 80], [30, 40]]));
    expect(bounds).toEqual({ x: 10, y: 20, width: 40, height: 60 });
  });
});

describe("editor-kit — lasso geometry", () => {
  /** مربع 0..100 على محورين. */
  const square: Array<[number, number]> = [[0, 0], [100, 0], [100, 100], [0, 100]];

  it("pointInPolygon detects inside/outside", () => {
    expect(pointInPolygon([50, 50], square)).toBe(true);
    expect(pointInPolygon([150, 150], square)).toBe(false);
    expect(pointInPolygon([0, 0], square)).toBe(true); // ركن
  });

  it("polygonTouchesRect — الشكل جوه الحبل بالكامل", () => {
    expect(
      polygonTouchesRect(square, { x: 20, y: 20, width: 30, height: 30 }),
    ).toBe(true);
  });

  it("polygonTouchesRect — الحبل جوه الشكل (الأضلاع بتتقاطع)", () => {
    // الحبل صغير جوه مستطيل أكبر: مفيش ركن من المضلع جوه المستطيل
    // ولا ركن من المستطيل جوه المضلع — بس الأضلاع بتعبر بعضها.
    const smallLasso: Array<[number, number]> = [[10, 10], [12, 10], [12, 12], [10, 12]];
    expect(
      polygonTouchesRect(smallLasso, { x: 0, y: 0, width: 100, height: 100 }),
    ).toBe(true);
  });

  it("polygonTouchesRect — مفيش أي تداخل", () => {
    expect(
      polygonTouchesRect(square, { x: 200, y: 200, width: 10, height: 10 }),
    ).toBe(false);
  });

  it("polygonTouchesRect — مسار قصير جداً ملهوش معنى", () => {
    expect(
      polygonTouchesRect([[5, 5]], { x: 0, y: 0, width: 100, height: 100 }),
    ).toBe(false);
  });
});
