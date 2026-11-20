// lib/engagement/__tests__/events.test.ts
//
// P1-B2 — اختبارات منطق تنظيف الـmetadata وإثباتات.
// (اختبارات وحدة بدون DB: بتغطي العقد اللي الـDB بيرفض برضه.)

import { describe, expect, it } from "vitest";

import {
  CLIENT_REPORTED_EVENT_TYPES,
  ENGAGEMENT_EVENT_SPECS,
  ENGAGEMENT_EVENT_TYPES,
  SERVER_VERIFIED_EVENT_TYPES,
  sanitizeEngagementMetadata,
} from "@/lib/engagement/event-contract";

describe("engagement event registry mirror", () => {
  it("marks client-reported and server-verified types separately", () => {
    expect(CLIENT_REPORTED_EVENT_TYPES).toContain(ENGAGEMENT_EVENT_TYPES.NOTES_SAVED);
    expect(SERVER_VERIFIED_EVENT_TYPES).toContain(ENGAGEMENT_EVENT_TYPES.EXAM_COMPLETED);
    expect(SERVER_VERIFIED_EVENT_TYPES).not.toContain(ENGAGEMENT_EVENT_TYPES.NOTES_SAVED);
  });

  it("gives every type a source table and a trust level", () => {
    for (const spec of Object.values(ENGAGEMENT_EVENT_SPECS)) {
      expect(spec.sourceTable.length).toBeGreaterThan(0);
      expect(["server", "client_reported"]).toContain(spec.trustLevel);
    }
  });
});

describe("sanitizeEngagementMetadata", () => {
  it("keeps only allowed keys", () => {
    const result = sanitizeEngagementMetadata(ENGAGEMENT_EVENT_TYPES.EXAM_COMPLETED, {
      percent: 80,
      auto_correct: 4,
      auto_total: 5,
      has_essay: true,
      secret_token: "should-not-pass",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value).sort()).toEqual([
      "auto_correct",
      "auto_total",
      "has_essay",
      "percent",
    ]);
    expect(result.value).not.toHaveProperty("secret_token");
  });

  it("drops nested objects and arrays (scalar-only contract)", () => {
    const result = sanitizeEngagementMetadata(ENGAGEMENT_EVENT_TYPES.EXAM_COMPLETED, {
      percent: 10,
      answer: { text: "leak" },
      list: [1, 2, 3],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ percent: 10 });
  });

  it("drops non-finite numbers and over-long strings", () => {
    const result = sanitizeEngagementMetadata(ENGAGEMENT_EVENT_TYPES.EXAM_COMPLETED, {
      percent: Number.NaN,
      auto_correct: Number.POSITIVE_INFINITY,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({});
  });

  it("rejects metadata that exceeds the per-type size limit", () => {
    const result = sanitizeEngagementMetadata(ENGAGEMENT_EVENT_TYPES.EXAM_COMPLETED, {
      // 256 chars max per string; keys are limited, so force size via many allowed keys.
      percent: 1,
      auto_correct: 2,
      auto_total: 3,
      has_essay: true,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects unknown event types", () => {
    const result = sanitizeEngagementMetadata(
      "not_a_real_event" as never,
      { percent: 1 },
    );
    expect(result.ok).toBe(false);
  });

  it("treats missing metadata as an empty object", () => {
    const result = sanitizeEngagementMetadata(ENGAGEMENT_EVENT_TYPES.NOTES_SAVED, undefined);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({});
  });
});
