// ============================================================================
// MAGICLY — support-classification tests (Phase 1)
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  classifyByDictionary,
  classifyIssue,
  validateClassification,
  suggestDiagnosticQuestions,
  SUPPORT_CATEGORIES,
} from "../support-classification";

describe("support-classification – dictionary classifier", () => {
  it("classifies a credits-missing message", () => {
    const result = classifyByDictionary("الرصيد ما وصل ليا بعد شرائي");
    expect(SUPPORT_CATEGORIES[result.category]).toBeDefined();
    expect(result.confidenceScore).toBeGreaterThanOrEqual(0.7);
  });

  it("classifies a login problem message", () => {
    const result = classifyByDictionary("ما أستطيع أدخل حسابي");
    expect(result.category).toBe("account");
    expect(result.confidenceScore).toBeGreaterThanOrEqual(0.7);
  });

  it("falls back to general complaints for an unknown message", () => {
    const result = classifyByDictionary("أريد اقتراح ميزة جديدة");
    expect(result.category).toBe("complaints");
    // Confidence below 0.5 → not a confirmed diagnosis
    expect(result.confidenceScore).toBeLessThan(0.5);
  });
});

describe("support-classification – validateClassification", () => {
  const valid: any = {
    category: "credits",
    subcategory: "missingPurchased",
    shortProblemSummary: "رصيد لم يصل",
    confidenceScore: 0.8,
    severity: "low",
    missingInformation: [],
    recommendedNextStep: "تحقق من حالة المعاملة",
    suggestedKnowledgeArticleIds: [],
    requiresHuman: false,
    escalationReason: "مطابق للجميع",
  };

  it("accepts a valid classification", () => {
    expect(validateClassification(valid)).toBe(true);
  });

  it("rejects a missing field", () => {
    delete valid["confidenceScore"];
    expect(validateClassification(valid)).toBe(false);
  });

  it("rejects an unknown category", () => {
    valid.category = "unknown";
    expect(validateClassification(valid)).toBe(false);
  });

  it("rejects a confidence below 0", () => {
    valid.confidenceScore = -0.1;
    expect(validateClassification(valid)).toBe(false);
  });

  it("rejects a confidence above 1", () => {
    valid.confidenceScore = 1.1;
    expect(validateClassification(valid)).toBe(false);
  });
});

describe("support-classification – severity mapping", () => {
  it("maps high confidence to low severity", () => {
    // Avoided straight mock by requiring independence from any DB
    const result = classifyByDictionary("ما وصل رصيدي المشتري");
    // Minimum 0.7 → low severity
    expect(result.severity).toBe("low");
  });
});

describe("support-diagnostics – question suggestions", () => {
  it("returns structured questions for support classification", () => {
    const result = suggestDiagnosticQuestions(
      classifyByDictionary("رصيدي ما وصل"),
      "رسالة الدعم"
    );
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].key).toBe("what_happened");
  });
});
