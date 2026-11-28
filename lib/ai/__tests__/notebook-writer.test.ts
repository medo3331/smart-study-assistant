import { describe, it, expect } from "vitest";
import {
  buildNotebookWritePrompt,
  validateNotebookWrite,
  generateNotebookWrite,
} from "../notebook-writer";

const validPayload = {
  title: "IP Addressing",
  blocks: [
    { type: "heading", text: "IP Addressing" },
    { type: "definition", text: "عنوان منطقي لتحديد جهاز على الشبكة" },
    { type: "bullet", text: "IPv4 = 32 bits" },
    { type: "example", text: "192.168.1.10" },
    { type: "tip", text: "كل Octet = 8 Bits" },
    { type: "question", text: "إيه الفرق بين Public وPrivate؟" },
    { type: "table", rows: [["Class", "Range"], ["A", "0-127"]] },
    {
      type: "diagram",
      title: "topology",
      mermaidType: "flowchart",
      mermaidCode: "graph TD\n  A[Router] --> B[PC]",
    },
  ],
};

describe("validateNotebookWrite", () => {
  it("accepts a well-formed document", () => {
    const result = validateNotebookWrite(validPayload);

    expect(result.title).toBe("IP Addressing");
    expect(result.blocks).toHaveLength(8);
    expect(result.blocks[7]).toMatchObject({ type: "diagram", mermaidType: "flowchart" });
  });

  it("parses JSON wrapped in code fences", () => {
    const fenced = "```json\n" + JSON.stringify(validPayload) + "\n```";

    expect(validateNotebookWrite(fenced).title).toBe("IP Addressing");
  });

  it("falls back to the first heading when the title is missing", () => {
    const { title, ...withoutTitle } = validPayload;

    expect(validateNotebookWrite(withoutTitle).title).toBe("IP Addressing");
  });

  it("drops empty and unknown blocks silently", () => {
    const result = validateNotebookWrite({
      title: "t",
      blocks: [
        { type: "text", text: "   " },
        { type: "motivational_quote", text: "never give up" },
        { type: "text", text: "سطر صالح" },
      ],
    });

    expect(result.blocks).toEqual([{ type: "text", text: "سطر صالح" }]);
  });

  it("rejects tables with fewer than two usable rows", () => {
    const result = validateNotebookWrite({
      title: "t",
      blocks: [
        { type: "text", text: "سطر" },
        { type: "table", rows: [["single"]] },
        { type: "table", rows: [["a", "b"], ["1", "2"]] },
      ],
    });

    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[1]).toMatchObject({ type: "table" });
  });

  it("falls back to flowchart for an unknown diagram type", () => {
    const result = validateNotebookWrite({
      title: "t",
      blocks: [
        { type: "text", text: "سطر" },
        { type: "diagram", title: "d", mermaidType: "quantum", mermaidCode: "graph TD\n  A --> B" },
      ],
    });

    expect(result.blocks[1]).toMatchObject({ type: "diagram", mermaidType: "flowchart" });
  });

  it("throws on a document with no usable blocks", () => {
    expect(() => validateNotebookWrite({ title: "t", blocks: [] })).toThrow();
    expect(() => validateNotebookWrite("not an object")).toThrow();
  });
});

describe("buildNotebookWritePrompt", () => {
  it("includes topic, style instruction and page context", () => {
    const prompt = buildNotebookWritePrompt({
      topic: "TCP 3-Way Handshake",
      style: "compare",
      pageContext: "صفحة عن Network Layer",
      level: "ثانية حاسبات",
    });

    expect(prompt).toContain("TCP 3-Way Handshake");
    expect(prompt).toContain("Network Layer");
    expect(prompt).toContain("ثانية حاسبات");
    expect(prompt).toContain('"type":"table"');
  });

  it("omits empty page context", () => {
    const prompt = buildNotebookWritePrompt({ topic: "Subnetting", style: "smart" });

    expect(prompt).not.toContain("Existing page context");
  });
});

describe("generateNotebookWrite", () => {
  it("extracts and validates the model JSON", async () => {
    const result = await generateNotebookWrite(
      { topic: "Subnetting", style: "smart" },
      async () => JSON.stringify(validPayload),
    );

    expect(result.blocks.length).toBe(8);
  });

  it("propagates a structured-output failure", async () => {
    await expect(
      generateNotebookWrite({ topic: "Subnetting", style: "smart" }, async () => "عندي فكرة أحسن من JSON"),
    ).rejects.toThrow();
  });
});
