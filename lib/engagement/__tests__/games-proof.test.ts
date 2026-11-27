// lib/engagement/__tests__/games-proof.test.ts
//
// G0-B — عقد إثبات الألعاب (الألعاب ذات التحقق السيرفري فقط).

import { describe, expect, it } from "vitest";

import {
  CLIENT_REPORTED_EVENT_TYPES,
  ENGAGEMENT_EVENT_SPECS,
  ENGAGEMENT_EVENT_TYPES,
  SERVER_VERIFIED_EVENT_TYPES,
  sanitizeEngagementMetadata,
} from "@/lib/engagement/event-contract";

describe("games proof contract (G0-B)", () => {
  it("registers the three server-validated game events", () => {
    const adopted = [
      [ENGAGEMENT_EVENT_TYPES.BREAK_RIDDLE_SOLVED, "break_riddle_sessions"],
      [ENGAGEMENT_EVENT_TYPES.BREAK_QUIZ_SOLVED, "break_quiz_sessions"],
      [ENGAGEMENT_EVENT_TYPES.ESCAPE_ROOM_SOLVED, "escape_sessions"],
    ] as const;

    for (const [type, table] of adopted) {
      const spec = ENGAGEMENT_EVENT_SPECS[type];
      expect(spec).toBeDefined();
      expect(spec.sourceTable).toBe(table);
      expect(spec.trustLevel).toBe("server");
      expect(SERVER_VERIFIED_EVENT_TYPES).toContain(type);
      expect(CLIENT_REPORTED_EVENT_TYPES).not.toContain(type);
    }
  });

  it("rate caps game events far below client-reportable types", () => {
    for (const type of [
      ENGAGEMENT_EVENT_TYPES.BREAK_RIDDLE_SOLVED,
      ENGAGEMENT_EVENT_TYPES.BREAK_QUIZ_SOLVED,
      ENGAGEMENT_EVENT_TYPES.ESCAPE_ROOM_SOLVED,
    ]) {
      expect(ENGAGEMENT_EVENT_SPECS[type].maxEventsPerHour).toBeLessThanOrEqual(5);
    }
  });

  it("drops client-forged outcome fields from game event metadata", () => {
    for (const type of [
      ENGAGEMENT_EVENT_TYPES.BREAK_RIDDLE_SOLVED,
      ENGAGEMENT_EVENT_TYPES.BREAK_QUIZ_SOLVED,
      ENGAGEMENT_EVENT_TYPES.ESCAPE_ROOM_SOLVED,
    ]) {
      const result = sanitizeEngagementMetadata(type, {
        // حقول لا يجوز للعميل التلاعب بها:
        won: true,
        score: 100,
        coins: 25,
        user_id: "3cdaf73b-d4ff-45d3-8087-b5ff04df5b46",
        verified_by: "service_role",
        trust_level: "server",
        attempts: 99,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Object.keys(result.value)).toHaveLength(0);
    }
  });

  it("keeps only server-computed session facts", () => {
    const riddle = sanitizeEngagementMetadata(ENGAGEMENT_EVENT_TYPES.BREAK_RIDDLE_SOLVED, {
      attempts_used: 2,
      riddle_id: "shadow",
      answer: "الظل", // لا يجوز أن يخرج من السيرفر إلى الـmetadata
    });
    expect(riddle.ok).toBe(true);
    if (!riddle.ok) return;
    expect(riddle.value).toEqual({ attempts_used: 2, riddle_id: "shadow" });
  });
});
