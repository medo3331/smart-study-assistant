// lib/engagement/__tests__/badges-achievements-proof.test.ts
//
// G0-C — عقد إثبات الأوسمة والإنجازات.

import { describe, expect, it } from "vitest";

import {
  CLIENT_REPORTED_EVENT_TYPES,
  ENGAGEMENT_EVENT_SPECS,
  ENGAGEMENT_EVENT_TYPES,
  SERVER_VERIFIED_EVENT_TYPES,
  sanitizeEngagementMetadata,
} from "@/lib/engagement/event-contract";

describe("badges/achievements proof contract (G0-C)", () => {
  it("registers both events as server-verified with the correct sources", () => {
    const badge = ENGAGEMENT_EVENT_SPECS[ENGAGEMENT_EVENT_TYPES.BADGE_EARNED];
    expect(badge.sourceTable).toBe("badges");
    expect(badge.trustLevel).toBe("server");

    const achievement = ENGAGEMENT_EVENT_SPECS[ENGAGEMENT_EVENT_TYPES.ACHIEVEMENT_UNLOCKED];
    expect(achievement.sourceTable).toBe("user_achievements");
    expect(achievement.trustLevel).toBe("server");

    for (const type of [ENGAGEMENT_EVENT_TYPES.BADGE_EARNED, ENGAGEMENT_EVENT_TYPES.ACHIEVEMENT_UNLOCKED]) {
      expect(SERVER_VERIFIED_EVENT_TYPES).toContain(type);
      expect(CLIENT_REPORTED_EVENT_TYPES).not.toContain(type);
    }
  });

  it("drops client-forged trust fields from both event types", () => {
    for (const type of [ENGAGEMENT_EVENT_TYPES.BADGE_EARNED, ENGAGEMENT_EVENT_TYPES.ACHIEVEMENT_UNLOCKED]) {
      const result = sanitizeEngagementMetadata(type, {
        user_id: "3cdaf73b-d4ff-45d3-8087-b5ff04df5b46",
        verified_by: "service_role",
        trust_level: "server",
        coins: 40,
        reward_eligible: true,
        completed: true,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Object.keys(result.value)).toHaveLength(0);
    }
  });

  it("badge metadata carries only server-recorded badge facts", () => {
    const result = sanitizeEngagementMetadata(ENGAGEMENT_EVENT_TYPES.BADGE_EARNED, {
      chapter_number: 2,
      accuracy: 85,
      subject: "الفيزياء",
      title: "منتصر على التنين", // ليس ضمن العقد — العنوان زخرفة
      user_id: "3cdaf73b-d4ff-45d3-8087-b5ff04df5b46",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ chapter_number: 2, accuracy: 85, subject: "الفيزياء" });
  });

  it("achievement metadata carries only the computed metric snapshot", () => {
    const result = sanitizeEngagementMetadata(ENGAGEMENT_EVENT_TYPES.ACHIEVEMENT_UNLOCKED, {
      metric: "badges",
      progress: 3,
      target: 1,          // ليس ضمن العقد
      coins: 120,         // ليس ضمن العقد — المكافأة من الكتالوج سيرفريًا
      requirement: "اكسب أول وسام",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ metric: "badges", progress: 3 });
  });

  it("rate caps are conservative (one-per-lifetime semantics)", () => {
    expect(ENGAGEMENT_EVENT_SPECS[ENGAGEMENT_EVENT_TYPES.BADGE_EARNED].maxEventsPerHour).toBeLessThanOrEqual(10);
    expect(ENGAGEMENT_EVENT_SPECS[ENGAGEMENT_EVENT_TYPES.ACHIEVEMENT_UNLOCKED].maxEventsPerHour).toBeLessThanOrEqual(5);
  });
});
