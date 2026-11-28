import { describe, it, expect } from "vitest";
import { buildInkRevealStages, inkDelayMs } from "../ink-reveal";
import type { NoteText, Stroke } from "../types";

function text(id: string, value: string, y: number): NoteText {
  return { id, kind: "text", text: value, x: 700, y, size: 20, color: "#111827" };
}

function rule(id: string, y: number): Stroke {
  return {
    id,
    tool: "pen",
    color: "#94a3b8",
    thickness: 1,
    opacity: 1,
    points: [
      [500, y],
      [746, y],
    ],
    shape: "line",
  };
}

describe("buildInkRevealStages", () => {
  it("expands each text word by word with cumulative values", () => {
    const stages = buildInkRevealStages([text("t1", "Magic writes notes", 72)]);

    expect(stages).toEqual([
      { kind: "text", id: "t1", value: "Magic" },
      { kind: "text", id: "t1", value: "Magic writes" },
      { kind: "text", id: "t1", value: "Magic writes notes" },
    ]);
  });

  it("orders elements top to bottom, interleaving strokes and images at their slot", () => {
    const stages = buildInkRevealStages(
      [text("top", "أول سطر", 72), text("bottom", "آخر سطر", 200)],
      [{ id: "img", kind: "image", src: "data:image/png;base64,x", x: 100, y: 150, width: 200, height: 40 }],
      [rule("rule", 100)],
    );

    expect(stages.map((stage) => stage.id)).toEqual([
      "top",
      "top",
      "rule",
      "img",
      "bottom",
      "bottom",
    ]);
    // الصور والخطوط بتيجي ككتلة واحدة في ترتيبها.
    expect(stages[2]).toEqual({ kind: "stroke", id: "rule" });
    expect(stages[3]).toEqual({ kind: "image", id: "img" });
  });

  it("keeps a single-word (or collapsed-whitespace) text as one stage", () => {
    const stages = buildInkRevealStages([text("a", "مرحبا", 72), text("b", "   ", 100)]);

    expect(stages).toEqual([
      { kind: "text", id: "a", value: "مرحبا" },
      { kind: "text", id: "b", value: "   " },
    ]);
  });

  it("ties at the same y resolve by insertion order (texts before strokes)", () => {
    const stages = buildInkRevealStages([text("t", "سطر", 72)], [], [rule("r", 72)]);

    expect(stages.map((stage) => stage.id)).toEqual(["t", "r"]);
  });
});

describe("inkDelayMs", () => {
  it("slows down for short notes and speeds up for long ones", () => {
    expect(inkDelayMs(0)).toBe(0);
    expect(inkDelayMs(30)).toBe(42);
    expect(inkDelayMs(100)).toBe(28);
    expect(inkDelayMs(400)).toBe(18);
  });
});
