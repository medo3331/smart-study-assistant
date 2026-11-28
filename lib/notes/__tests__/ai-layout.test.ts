import { describe, it, expect } from "vitest";
import { layoutNotebookBlocks, AI_LAYOUT_MARGIN, type AiDiagramImage } from "../ai-layout";
import type { NotebookBlock } from "@/lib/ai/notebook-writer";
import { PAGE_HEIGHT, PAGE_WIDTH } from "../canvas";

const diagramImage: AiDiagramImage = { src: "data:image/png;base64,xxx", width: 400, height: 300 };

const sampleBlocks: NotebookBlock[] = [
  { type: "heading", text: "IP Addressing" },
  { type: "definition", text: "عنوان منطقي لتحديد جهاز على الشبكة" },
  { type: "bullet", text: "IPv4 consists of 32 bits" },
  { type: "tip", text: "كل Octet بيتكون من 8 Bits" },
  { type: "question", text: "إيه الفرق بين Public وPrivate IP؟" },
  { type: "table", rows: [["Class", "Range"], ["A", "0-127"], ["B", "128-191"]] },
];

describe("layoutNotebookBlocks", () => {
  it("aligns every line to one shared right margin (paintText anchors x at the right edge)", () => {
    const result = layoutNotebookBlocks({ blocks: sampleBlocks });

    expect(result.texts.length).toBeGreaterThan(0);
    expect(result.images).toHaveLength(0);
    for (const text of result.texts) {
      expect(text.x).toBe(PAGE_WIDTH - AI_LAYOUT_MARGIN);
      expect(text.y).toBeGreaterThanOrEqual(72);
    }
    // أول نص = العنوان بلون العناوين وحجمه الأكبر.
    expect(result.texts[0].text).toBe("IP Addressing");
    expect(result.texts[0].color).toBe("#1d4ed8");
    expect(result.texts[0].size).toBe(30);
  });

  it("stacks lines downward in reading order without gaps", () => {
    const result = layoutNotebookBlocks({
      blocks: [
        { type: "text", text: "السطر الأول" },
        { type: "text", text: "السطر التاني" },
      ],
    });

    expect(result.texts).toHaveLength(2);
    expect(result.texts[1].y).toBeGreaterThan(result.texts[0].y);
    expect(result.texts[1].x).toBe(result.texts[0].x);
  });

  it("wraps long paragraphs into multiple aligned lines", () => {
    const longText = "word ".repeat(120).trim();
    const result = layoutNotebookBlocks({
      blocks: [{ type: "text", text: longText }],
    });

    expect(result.texts.length).toBeGreaterThan(1);
    for (const text of result.texts) {
      expect(text.text.length).toBeLessThanOrEqual(80);
      expect(text.x).toBe(PAGE_WIDTH - AI_LAYOUT_MARGIN);
    }
  });

  it("renders tables as aligned text rows with separator strokes", () => {
    const result = layoutNotebookBlocks({ blocks: sampleBlocks });

    const tableLines = result.texts.filter((text) => text.text.includes("│"));
    expect(tableLines).toHaveLength(3);
    // خط أفقي لكل حد صف: 3 صفوف + الحد العلوي = 4 خطوط.
    const lines = result.strokes.filter((stroke) => stroke.shape === "line");
    expect(lines).toHaveLength(4);
    // الجدول بمحاذاة يمين الصفحة.
    const gridLeft = Math.min(...lines.map((line) => line.points[0][0]));
    expect(gridLeft).toBeLessThan(PAGE_WIDTH - AI_LAYOUT_MARGIN);
    expect(Math.max(...lines.map((line) => line.points[1][0]))).toBeCloseTo(PAGE_WIDTH - AI_LAYOUT_MARGIN, 0);
  });

  it("places pre-rendered diagram images and advances the cursor", () => {
    const result = layoutNotebookBlocks({
      blocks: [
        { type: "heading", text: "TCP Handshake" },
        { type: "diagram", title: "handshake", mermaidType: "sequence", mermaidCode: "sequenceDiagram" },
      ],
      diagramImages: { 1: diagramImage },
    });

    expect(result.images).toHaveLength(1);
    const image = result.images[0];
    expect(image.src).toBe(diagramImage.src);
    expect(image.x + image.width).toBeLessThanOrEqual(PAGE_WIDTH - AI_LAYOUT_MARGIN);
    expect(image.height).toBeLessThanOrEqual(300);
  });

  it("skips diagram blocks without a pre-rendered image", () => {
    const result = layoutNotebookBlocks({
      blocks: [{ type: "diagram", title: "x", mermaidType: "flowchart", mermaidCode: "graph TD" }],
    });

    expect(result.images).toHaveLength(0);
    expect(result.texts).toHaveLength(0);
  });

  it("respects the include set from the preview", () => {
    const result = layoutNotebookBlocks({
      blocks: sampleBlocks,
      include: new Set([0, 4]),
    });

    expect(result.texts.map((text) => text.text)).toEqual([
      "IP Addressing",
      expect.stringContaining("❓"),
    ]);
  });

  it("clips blocks that overflow the page bottom instead of overflowing", () => {
    const manyBullets: NotebookBlock[] = Array.from({ length: 60 }, (_, index) => ({
      type: "bullet",
      text: `نقطة طويلة نسبيًا رقم ${index} فيها كلام كتير عشان تاخد مساحة`,
    }));
    const result = layoutNotebookBlocks({ blocks: manyBullets, startY: PAGE_HEIGHT - 100 });

    expect(result.clipped).toBe(true);
    for (const text of result.texts) {
      expect(text.y).toBeLessThan(PAGE_HEIGHT);
    }
  });

  it("prefixes styled blocks with their marker", () => {
    const result = layoutNotebookBlocks({
      blocks: [{ type: "tip", text: "راجع الجدول ده قبل الامتحان" }],
    });

    expect(result.texts[0].text).toBe("💡 راجع الجدول ده قبل الامتحان");
    expect(result.texts[0].color).toBe("#7c3aed");
  });
});
