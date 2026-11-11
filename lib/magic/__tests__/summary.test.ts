import { describe, it, expect } from "vitest";
import {
  parseCoverage,
  shouldRefreshSummary,
  getSummaryAction,
  stampLegacyCoverage,
  buildSummaryInput,
  addCoveragePrefix,
} from "@/lib/magic/summary";

describe("Summary coverage parsing", () => {
  it("parses [covered:N] prefix", () => {
    const r = parseCoverage("[covered:10] This is a summary.");
    expect(r.lastCovered).toBe(10);
    expect(r.hasPrefix).toBe(true);
  });

  it("returns 0 for no prefix", () => {
    const r = parseCoverage("This is a summary without prefix.");
    expect(r.lastCovered).toBe(0);
    expect(r.hasPrefix).toBe(false);
  });

  it("returns 0 for null", () => {
    const r = parseCoverage(null);
    expect(r.lastCovered).toBe(0);
    expect(r.hasPrefix).toBe(false);
  });

  it("handles malformed prefix", () => {
    const r = parseCoverage("[covered:abc] Summary.");
    expect(r.lastCovered).toBe(0);
    expect(r.hasPrefix).toBe(false);
  });
});

describe("shouldRefreshSummary", () => {
  it("returns false for < 10 messages", () => {
    expect(shouldRefreshSummary(5, null)).toBe(false);
    expect(shouldRefreshSummary(9, null)).toBe(false);
  });

  it("returns true for >= 10 messages with no summary", () => {
    expect(shouldRefreshSummary(10, null)).toBe(true);
    expect(shouldRefreshSummary(15, null)).toBe(true);
  });

  it("returns false for legacy summary without prefix (no AI call — stamping is separate)", () => {
    expect(shouldRefreshSummary(15, "ملخص قديم بدون بادئة.")).toBe(false);
  });

  it("returns true when 5+ new messages since last coverage", () => {
    expect(shouldRefreshSummary(16, "[covered:10] Summary.")).toBe(true);
  });

  it("returns false when fewer than 5 new messages", () => {
    expect(shouldRefreshSummary(12, "[covered:10] Summary.")).toBe(false);
    expect(shouldRefreshSummary(14, "[covered:10] Summary.")).toBe(false);
  });

  it("returns true at exactly +5 new messages", () => {
    expect(shouldRefreshSummary(15, "[covered:10] Summary.")).toBe(true);
  });

  it("handles empty summary string", () => {
    expect(shouldRefreshSummary(10, "")).toBe(true);
    expect(shouldRefreshSummary(10, "   ")).toBe(true);
  });
});

describe("getSummaryAction", () => {
  it("returns none below 10 messages for every shape", () => {
    expect(getSummaryAction(9, null)).toBe("none");
    expect(getSummaryAction(9, "")).toBe("none");
    expect(getSummaryAction(9, "ملخص قديم")).toBe("none");
    expect(getSummaryAction(9, "[covered:5] ملخص قديم")).toBe("none");
  });

  it("returns generate for null / empty / whitespace-only summaries at >= 10", () => {
    expect(getSummaryAction(10, null)).toBe("generate");
    expect(getSummaryAction(10, "")).toBe("generate");
    expect(getSummaryAction(10, "   ")).toBe("generate");
  });

  it("returns none for valid prefixed summary before threshold, refresh at exactly +5", () => {
    expect(getSummaryAction(14, "[covered:10] ملخص.")).toBe("none");
    expect(getSummaryAction(15, "[covered:10] ملخص.")).toBe("refresh");
  });

  it("classifies plain legacy text (>= 10) as stamp — never AI", () => {
    expect(getSummaryAction(40, "ملخص قديم بدون بادئة.")).toBe("stamp");
    expect(getSummaryAction(43, "شرحنا الاتجاهات واتفقنا على عملية تنظيف الكاش.")).toBe("stamp");
  });

  it("classifies malformed prefixes deliberately (not as valid legacy)", () => {
    // Malformed prefix WITH content → stamp (reuse the content, replace metadata).
    expect(getSummaryAction(40, "[covered:abc] شرحنا المحاضرة.")).toBe("stamp");
    expect(getSummaryAction(40, "[covered:] ملخص.")).toBe("stamp");
    expect(getSummaryAction(40, "[covered:12x] ملخص.")).toBe("stamp");
    // Malformed prefix with NOTHING left after it → generate from scratch.
    expect(getSummaryAction(40, "[covered:abc]")).toBe("generate");
    expect(getSummaryAction(40, "[covered:]   ")).toBe("generate");
  });

  it("still stamps a summary that is long (text preserved, no AI)", () => {
    const long = "ملخص من إصدار أقدم ".repeat(80).trim(); // > 1500 chars
    expect(getSummaryAction(40, long)).toBe("stamp");
    // Stamping must NOT truncate the legacy text (preserve exactly).
    const stamped = stampLegacyCoverage(long, 40);
    expect(stamped.endsWith(long)).toBe(true);
    expect(stamped.length).toBeGreaterThan(1500);
  });
});

describe("stampLegacyCoverage", () => {
  it("wraps plain legacy text with the current total — no truncation", () => {
    const text = "شرحنا الاتجاهات واتفقنا على عملية تنظيف الكاش.";
    expect(stampLegacyCoverage(text, 40)).toBe(`[covered:40] ${text}`);
  });

  it("replaces a malformed prefix with a valid one, keeping the text", () => {
    expect(stampLegacyCoverage("[covered:abc] شرحنا المحاضرة.", 40)).toBe("[covered:40] شرحنا المحاضرة.");
    expect(stampLegacyCoverage("[covered:] ملخص.", 41)).toBe("[covered:41] ملخص.");
  });

  it("returns empty for empty or metadata-only input", () => {
    expect(stampLegacyCoverage("", 40)).toBe("");
    expect(stampLegacyCoverage("   ", 40)).toBe("");
    expect(stampLegacyCoverage("[covered:abc]", 40)).toBe("");
  });

  it("prefers a valid digit prefix inside a malformed-looking wrapper", () => {
    expect(stampLegacyCoverage("[covered:0abc] ملخص.", 44)).toBe("[covered:44] ملخص.");
  });
});

describe("buildSummaryInput", () => {
  it("includes previous summary (stripped of prefix)", () => {
    const result = buildSummaryInput("[covered:10] Previous summary text.", [], "new question");
    expect(result).toContain("ملخص سابق: Previous summary text.");
    expect(result).not.toContain("[covered:10]");
  });

  it("includes recent history", () => {
    const history = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ];
    const result = buildSummaryInput(null, history, "new question");
    expect(result).toContain("user: Hello");
    expect(result).toContain("assistant: Hi there");
  });

  it("includes current prompt once", () => {
    const result = buildSummaryInput(null, [], "my question");
    expect(result).toContain("user: my question");
    const count = (result.match(/my question/g) || []).length;
    expect(count).toBe(1);
  });

  it("avoids duplicating current prompt if already in history", () => {
    const history = [{ role: "user", content: "my question" }];
    const result = buildSummaryInput(null, history, "my question");
    const count = (result.match(/my question/g) || []).length;
    expect(count).toBe(1);
  });

  it("truncates long content to 500 chars", () => {
    const longContent = "a".repeat(600);
    const history = [{ role: "user", content: longContent }];
    const result = buildSummaryInput(null, history, "q");
    expect(result).toContain("a".repeat(500));
    expect(result).not.toContain("a".repeat(501));
  });

  it("skips empty messages", () => {
    const history = [
      { role: "user", content: "" },
      { role: "assistant", content: "   " },
      { role: "user", content: "real" },
    ];
    const result = buildSummaryInput(null, history, "q");
    expect(result).toContain("user: real");
    expect(result).not.toContain("user: \n");
  });

  it("handles null previous summary", () => {
    const result = buildSummaryInput(null, [], "q");
    expect(result).not.toContain("ملخص سابق");
  });

  it("handles empty previous summary", () => {
    const result = buildSummaryInput("   ", [], "q");
    expect(result).not.toContain("ملخص سابق");
  });
});

describe("addCoveragePrefix", () => {
  it("adds prefix to non-empty summary", () => {
    const result = addCoveragePrefix("This is a summary.", 10);
    expect(result).toBe("[covered:10] This is a summary.");
  });

  it("returns empty for empty summary", () => {
    expect(addCoveragePrefix("", 10)).toBe("");
    expect(addCoveragePrefix("   ", 10)).toBe("");
  });

  it("truncates to 1500 chars", () => {
    const long = "a".repeat(2000);
    const result = addCoveragePrefix(long, 10);
    expect(result.length).toBeLessThanOrEqual(1500);
  });
});