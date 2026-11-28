// ============================================================================
// MAGICLY — support-knowledge-base tests (Phase 1)
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  searchKnowledgeArticles,
  getPublishedArticles,
  createDraftArticle,
} from "../support-knowledge-base";
import type { KnowledgeArticle } from "../types";

describe("support-knowledge-base – search", () => {
  it("returns published articles matching a term", () => {
    const result = searchKnowledgeArticles({
      terms: "رصيد",
      category: "credits",
      limit: 5,
    });
    // Should return at least the demo credit article
    expect(result.results.length).toBeGreaterThan(0);
  });

  it("only returns published articles", () => {
    const result = searchKnowledgeArticles({ terms: "رصيد", limit: 10 });
    for (const article of result.results) {
      expect(article.status).toBe("published");
    }
  });

  it("respects limit", () => {
    const result = searchKnowledgeArticles({ terms: "something", limit: 2 });
    expect(result.results.length).toBeLessThanOrEqual(2);
  });
});

describe("support-knowledge-base – getPublishedArticles", () => {
  it("returns articles sorted by published_at desc", async () => {
    const page1 = await getPublishedArticles(undefined, 2);
    expect(page1.articles.length).toBeLessThanOrEqual(2);

    // Should have more than 2 articles available
    const page2 = await getPublishedArticles(page1.nextCursor ?? undefined, 2);
    expect(page2.hasNext).toBe(true);
  });
});

describe("support-knowledge-base – createDraftArticle", () => {
  it("creates a draft article with AI author", () => {
    const draft = createDraftArticle({
      slug: "test-draft",
      title: "Test draft",
      body: "Test body",
      category: "credits",
      subcategory: "missingPurchased",
      problemDescription: "Test",
      symptoms: ["Test"],
      approvedSolution: "Test",
      resolutionSteps: ["Test"],
      allowedActionKey: null,
      verificationSteps: "Test",
      escalationConditions: "Test",
      sourceType: "ai_suggestion",
      requiredStaffRole: "support.manage",
      createdBy: "ai-proposed",
    });

    expect(draft.status).toBe("draft");
    expect(draft.createdBy).toBe("ai-proposed");
    expect(draft.version).toBe(1);
    expect(draft.publishedAt).toBeNull();
  });
});
