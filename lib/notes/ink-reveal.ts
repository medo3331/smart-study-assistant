// lib/notes/ink-reveal.ts
//
// Handwriting reveal plan for AI-inserted content: instead of popping a whole
// block onto the page at once, text appears word by word in reading order
// (top → bottom) and diagrams/table rules appear at their place in the flow —
// like a teacher writing on the board.
//
// Pure and synchronous: `buildInkRevealStages` is testable without a DOM; the
// editor runs the stages and repaints per tick.

import type { NoteImage, NoteText, Stroke } from "./types";

export type InkRevealStage =
  | { kind: "text"; id: string; value: string }
  | { kind: "image"; id: string }
  | { kind: "stroke"; id: string };

/** y position of any revealable element. */
function elementY(element: NoteText | NoteImage | Stroke): number {
  if ("points" in element) {
    return Math.min(...element.points.map((point: [number, number]) => point[1]));
  }
  return element.y;
}

/**
 * Build the ordered reveal stages.
 *
 * Elements are interleaved by vertical position. Text blocks expand word by
 * word (cumulative partial values); images and strokes appear whole at their
 * slot in the flow.
 */
export function buildInkRevealStages(
  texts: NoteText[],
  images: NoteImage[] = [],
  strokes: Stroke[] = [],
): InkRevealStage[] {
  type Item = { y: number; order: number; stages: InkRevealStage[] };
  const items: Item[] = [];

  texts.forEach((text, index) => {
    const words = text.text.split(/\s+/).filter(Boolean);
    const stages: InkRevealStage[] = [];
    let current = "";
    for (const word of words) {
      current = current ? `${current} ${word}` : word;
      stages.push({ kind: "text", id: text.id, value: current });
    }
    if (stages.length === 0) stages.push({ kind: "text", id: text.id, value: text.text });
    items.push({ y: text.y, order: index, stages });
  });

  images.forEach((image, index) => {
    items.push({ y: image.y, order: texts.length + index, stages: [{ kind: "image", id: image.id }] });
  });

  strokes.forEach((stroke, index) => {
    items.push({ y: elementY(stroke), order: texts.length + images.length + index, stages: [{ kind: "stroke", id: stroke.id }] });
  });

  items.sort((a, b) => a.y - b.y || a.order - b.order);
  return items.flatMap((item) => item.stages);
}

/** Delay per word tick — slows down for short notes, speeds up for essays. */
export function inkDelayMs(totalWordStages: number): number {
  if (totalWordStages <= 0) return 0;
  if (totalWordStages <= 60) return 42;
  if (totalWordStages <= 140) return 28;
  return 18;
}
