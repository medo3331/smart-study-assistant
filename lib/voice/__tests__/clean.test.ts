import { describe, it, expect } from "vitest";
import { cleanTextForSpeech } from "@/lib/voice/clean";

describe("cleanTextForSpeech", () => {
  it("strips markdown bold/headers", () => {
    const out = cleanTextForSpeech("# Title\n**bold** text");
    expect(out).not.toContain("#");
    expect(out).not.toContain("**");
    expect(out).toContain("bold");
    expect(out).toContain("Title");
  });

  it("preserves English terms and numbers", () => {
    const out = cleanTextForSpeech("The value of x = 42, and API key.");
    expect(out).toContain("API");
    expect(out).toContain("42");
  });

  it("converts code blocks to a note", () => {
    const out = cleanTextForSpeech("Here:\n```\nconst a = 1;\n```\ndone");
    expect(out).toContain("بلوك كود");
  });
});
