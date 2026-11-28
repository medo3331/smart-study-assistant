// lib/engagement/__tests__/study-proof.test.ts
//
// G0-A — عقد إثبات إكمال الدراسة (study_completed).
//
// اختبارات وحدة بدون DB: بتغطي حدود الأمان القابلة للاختبار في العقد النقي
// (مرآة الـregistry + تنظيف الـmetadata). حدود الـDB نفسها (الـgrants،
// الـRLS، الـidempotency) بتتغطى في اختبار التحقق على مستوى الترحيل
// (tests/engagement-study-proof-migration.test.ts) وفي التحقق المباشر.

import { describe, expect, it } from "vitest";

import {
  CLIENT_REPORTED_EVENT_TYPES,
  ENGAGEMENT_EVENT_SPECS,
  ENGAGEMENT_EVENT_TYPES,
  SERVER_VERIFIED_EVENT_TYPES,
  sanitizeEngagementMetadata,
} from "@/lib/engagement/event-contract";

describe("study_completed contract (G0-A)", () => {
  it("is registered as a server-verified event sourced from study_days", () => {
    const spec = ENGAGEMENT_EVENT_SPECS[ENGAGEMENT_EVENT_TYPES.STUDY_COMPLETED];
    expect(spec).toBeDefined();
    expect(spec.sourceTable).toBe("study_days");
    expect(spec.trustLevel).toBe("server");
    expect(SERVER_VERIFIED_EVENT_TYPES).toContain(ENGAGEMENT_EVENT_TYPES.STUDY_COMPLETED);
  });

  it("is NOT client-reportable — the browser can never submit it", () => {
    expect(CLIENT_REPORTED_EVENT_TYPES).not.toContain(ENGAGEMENT_EVENT_TYPES.STUDY_COMPLETED);
    // المحاولة عبر recordClientReportedEvent ترفضه قبل الوصول للـDB.
    // (القائمة هي نفسها التي يفرضها /api/engagement/events كـallowlist.)
  });

  it("metadata contract only carries server-computed day facts", () => {
    const spec = ENGAGEMENT_EVENT_SPECS[ENGAGEMENT_EVENT_TYPES.STUDY_COMPLETED];
    expect([...spec.allowedMetadataKeys].sort()).toEqual(["day_number", "xp_reward"]);
  });

  it("keeps server-computed facts and drops client-forged trust fields", () => {
    const result = sanitizeEngagementMetadata(ENGAGEMENT_EVENT_TYPES.STUDY_COMPLETED, {
      day_number: 3,
      xp_reward: 100,
      // حقول لا يجوز للعميل التلاعب بها:
      completed: true,
      user_id: "3cdaf73b-d4ff-45d3-8087-b5ff04df5b46",
      verified_by: "service_role",
      trust_level: "server",
      coins: 25,
      score: 100,
      duration_seconds: 9999,
      progress_percent: 100,
      reward_eligible: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value).sort()).toEqual(["day_number", "xp_reward"]);
    expect(result.value).not.toHaveProperty("verified_by");
    expect(result.value).not.toHaveProperty("user_id");
    expect(result.value).not.toHaveProperty("completed");
  });

  it("rejects unknown event types outright", () => {
    const result = sanitizeEngagementMetadata(
      "study_done_fake" as never,
      { completed: true },
    );
    expect(result.ok).toBe(false);
  });
});
