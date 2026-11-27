// lib/notes/ai-layout.ts
//
// Magic Write layout engine — turns structured AI blocks into real page
// elements (NoteText / NoteImage / Stroke). Pure and synchronous so it is
// trivially testable; the diagram blocks arrive pre-rendered as PNG dataURLs.
//
// Placement follows the editor's existing AI insertion convention: blocks are
// right-aligned (Arabic/RTL) starting near the top of the page, and the origin
// handwriting/notes of the student are never touched.

import { PAGE_HEIGHT, PAGE_WIDTH } from "./canvas";
import type { NoteImage, NoteText, Stroke } from "./types";
import type { NotebookBlock } from "@/lib/ai/notebook-writer";

export const AI_LAYOUT_MARGIN = 48;
/** Rough advance per character — matches the editor's own text estimation. */
const CHAR_WIDTH_RATIO = 0.46;

export type AiDiagramImage = { src: string; width: number; height: number };

export interface AiLayoutInput {
  blocks: NotebookBlock[];
  /** Indices of blocks the student kept in the preview. Absent = keep all. */
  include?: ReadonlySet<number>;
  /** Pre-rendered diagram images keyed by their block index. */
  diagramImages?: Readonly<Record<number, AiDiagramImage>>;
  startY?: number;
}

export interface AiLayoutResult {
  texts: NoteText[];
  images: NoteImage[];
  strokes: Stroke[];
  /** True when the content did not fit one page and was clipped. */
  clipped: boolean;
}

const AI_TEXT_COLOR = "#111827";
const HEADING_COLOR = "#1d4ed8";
const DEFINITION_COLOR = "#047857";
const EXAMPLE_COLOR = "#92400e";
const TIP_COLOR = "#7c3aed";
const QUESTION_COLOR = "#b91c1c";
const TABLE_COLOR = "#111827";
const TABLE_LINE_COLOR = "#94a3b8";

const BOTTOM_LIMIT = PAGE_HEIGHT - 64;

function charWidth(size: number): number {
  return size * CHAR_WIDTH_RATIO;
}

function wrapText(text: string, size: number, maxWidth: number): string[] {
  const maxChars = Math.max(8, Math.floor(maxWidth / charWidth(size)));
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxChars) {
      // Long single word — hard break so the page never overflows sideways.
      if (current) {
        lines.push(current);
        current = "";
      }
      let remainder = word;
      while (remainder.length > maxChars) {
        lines.push(remainder.slice(0, maxChars));
        remainder = remainder.slice(maxChars);
      }
      current = remainder;
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.slice(0, 24);
}

function pushWrapped(
  texts: NoteText[],
  text: string,
  opts: { size: number; color: string; y: number; indent?: number; prefix?: string },
): number {
  const prefix = opts.prefix ?? "";
  const indent = opts.indent ?? 0;
  const maxWidth = PAGE_WIDTH - AI_LAYOUT_MARGIN * 2 - indent;
  const lines = wrapText(prefix + text, opts.size, maxWidth);
  for (const line of lines) {
    texts.push({
      id: crypto.randomUUID(),
      kind: "text",
      text: line,
      x: Math.max(AI_LAYOUT_MARGIN, PAGE_WIDTH - AI_LAYOUT_MARGIN - line.length * charWidth(opts.size) - indent),
      y: opts.y,
      size: opts.size,
      color: opts.color,
    });
    opts.y += opts.size * 1.55;
  }
  return opts.y + 6;
}

function padCell(cell: string, width: number): string {
  const visible = [...cell];
  const missing = Math.max(0, width - visible.length);
  const head = Math.floor(missing / 2);
  const tail = missing - head;
  return `${" ".repeat(head)}${cell}${" ".repeat(tail)}`;
}

function pushTable(
  texts: NoteText[],
  strokes: Stroke[],
  rows: string[][],
  size: number,
  y: number,
): number {
  const colCount = Math.max(...rows.map((row) => row.length));
  const cellWidth = charWidth(size);
  const lineHeight = size * 1.6;
  const maxChars = Math.max(8, Math.floor((PAGE_WIDTH - AI_LAYOUT_MARGIN * 2) / cellWidth));
  // " │ " separator = 3 chars between columns.
  const cellBudget = Math.max(4, Math.floor((maxChars - (colCount - 1) * 3) / colCount));
  const colWidths: number[] = [];
  for (let col = 0; col < colCount; col++) {
    const widest = Math.max(
      ...rows.map((row) => [...(row[col] ?? "")].slice(0, cellBudget).length),
      1,
    );
    colWidths.push(Math.min(Math.max(widest, 4), cellBudget));
  }
  const totalChars = colWidths.reduce((sum, width) => sum + width, 0) + (colCount - 1) * 3;
  const totalWidth = totalChars * cellWidth;
  const gridLeft = PAGE_WIDTH - AI_LAYOUT_MARGIN - totalWidth;

  let cursorY = y + lineHeight;
  for (let rowIndex = 0; rowIndex <= rows.length; rowIndex++) {
    const lineY = cursorY - lineHeight;
    strokes.push({
      id: crypto.randomUUID(),
      tool: "pen",
      color: TABLE_LINE_COLOR,
      thickness: 1,
      opacity: 1,
      points: [
        [gridLeft, lineY],
        [gridLeft + totalWidth, lineY],
      ],
      shape: "line",
    });
    if (rowIndex < rows.length) {
      const row = rows[rowIndex];
      const cells: string[] = [];
      for (let col = 0; col < colCount; col++) {
        cells.push(padCell([...(row[col] ?? "")].slice(0, colWidths[col]).join(""), colWidths[col]));
      }
      const line = cells.join(" │ ");
      texts.push({
        id: crypto.randomUUID(),
        kind: "text",
        text: line,
        x: gridLeft,
        y: lineY + (lineHeight - size) / 2,
        size,
        color: TABLE_COLOR,
      });
      cursorY += lineHeight;
    }
  }

  return cursorY + 10;
}

/**
 * Lay out AI blocks into page elements. Blocks beyond the page bottom are
 * clipped and reported through `clipped` — never silently overflow.
 */
export function layoutNotebookBlocks(input: AiLayoutInput): AiLayoutResult {
  const { blocks, include, diagramImages = {} } = input;
  const texts: NoteText[] = [];
  const images: NoteImage[] = [];
  const strokes: Stroke[] = [];
  let y = input.startY ?? 72;
  let clipped = false;

  blocks.forEach((block, index) => {
    if (include && !include.has(index)) return;
    if (y > BOTTOM_LIMIT) {
      clipped = true;
      return;
    }

    switch (block.type) {
      case "heading": {
        y = pushWrapped(texts, block.text, { size: 30, color: HEADING_COLOR, y });
        y += 8;
        break;
      }
      case "text": {
        y = pushWrapped(texts, block.text, { size: 20, color: AI_TEXT_COLOR, y });
        break;
      }
      case "bullet": {
        y = pushWrapped(texts, block.text, { size: 20, color: AI_TEXT_COLOR, y, indent: 18, prefix: "• " });
        break;
      }
      case "definition": {
        y = pushWrapped(texts, block.text, { size: 20, color: DEFINITION_COLOR, y, prefix: "📌 " });
        break;
      }
      case "example": {
        y = pushWrapped(texts, block.text, { size: 20, color: EXAMPLE_COLOR, y, prefix: "مثال: " });
        break;
      }
      case "tip": {
        y = pushWrapped(texts, block.text, { size: 20, color: TIP_COLOR, y, prefix: "💡 " });
        break;
      }
      case "question": {
        y = pushWrapped(texts, block.text, { size: 20, color: QUESTION_COLOR, y, prefix: "❓ " });
        break;
      }
      case "table": {
        y = pushTable(texts, strokes, block.rows, 18, y);
        break;
      }
      case "diagram": {
        const image = diagramImages[index];
        if (!image) break;
        const maxWidth = PAGE_WIDTH - AI_LAYOUT_MARGIN * 2;
        const scale = Math.min(1, maxWidth / image.width);
        const width = Math.round(image.width * scale);
        const height = Math.round(image.height * scale);
        if (y + height > BOTTOM_LIMIT) {
          clipped = true;
          break;
        }
        images.push({
          id: crypto.randomUUID(),
          kind: "image",
          src: image.src,
          x: PAGE_WIDTH - AI_LAYOUT_MARGIN - width,
          y,
          width,
          height,
        });
        y += height + 12;
        break;
      }
    }
  });

  return { texts, images, strokes, clipped };
}
