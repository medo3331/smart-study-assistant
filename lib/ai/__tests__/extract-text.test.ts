import { describe, it, expect } from "vitest";
import { detectFileKind, ExtractError } from "@/lib/extract-text";

describe("extract-text detectFileKind", () => {
  it("detects PDF by mime", () => {
    expect(detectFileKind("application/pdf", "lec.pdf")).toBe("pdf");
  });
  it("detects PDF by extension when mime missing", () => {
    expect(detectFileKind("", "Lec2 Introduction to computer networks.pdf")).toBe("pdf");
  });
  it("detects image", () => {
    expect(detectFileKind("image/png", "x.png")).toBe("image");
  });
  it("returns null for unsupported", () => {
    expect(detectFileKind("application/zip", "a.zip")).toBeNull();
  });
  it("ExtractError carries status", () => {
    const e = new ExtractError("no text", 422);
    expect(e.status).toBe(422);
    expect(e.message).toBe("no text");
  });
});
