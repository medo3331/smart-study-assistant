// ============================================================================
// MAGICLY — support-acknowledgement tests (Phase 1)
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  getAcknowledgeMessage,
  isAcknowledgeEligible,
} from "../support-acknowledgement";

describe("support-acknowledgement – template handling", () => {
  const template =
    "أهلًا بك في Magicly 👋\nتم استلام رسالتك بنجاح. مساعد Magicly الذكي بدأ مراجعة المشكلة وتحديد سببها، وسنحاول مساعدتك في حلها فورًا.";

  it("produces a non-empty acknowledgement", () => {
    const msg = getAcknowledgeMessage(template);
    expect(msg).toBeTruthy();
    expect(msg!.length).toBeGreaterThan(10);
  });

  it("trims excess whitespace", () => {
    const raw = "  " + template + "  \n\n  ";
    const msg = getAcknowledgeMessage(raw);
    expect(msg!.startsWith("أهلًا بك في Magicly")).toBe(true);
    expect(msg!.endsWith("في حلها فورًا.")).toBe(true);
  });

  it("rejects empty template", () => {
    expect(getAcknowledgeMessage("")).toBeNull();
    expect(getAcknowledgeMessage("   ")).toBeNull();
  });

  it("rejects template over 1000 chars", () => {
    const long = "a".repeat(1001);
    expect(getAcknowledgeMessage(long)).toBeNull();
  });
});

describe("support-acknowledgement – eligibility", () => {
  it("returns true when no prior state exists", () => {
    expect(isAcknowledgeEligible("received", null)).toBe(true);
  });

  it("returns true for acknowledged intermediate states", () => {
    expect(isAcknowledgeEligible("acknowledged", null)).toBe(true);
    expect(isAcknowledgeEligible("classifying", null)).toBe(true);
    expect(isAcknowledgeEligible("attempting_resolution", null)).toBe(true);
  });
});
