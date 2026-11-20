// lib/engagement/__tests__/feature-contract.test.ts
//
// P1-B2.2 — اختبارات عقد Feature Discovery (دورة الحالات + قواعد العرض).

import { describe, expect, it } from "vitest";

import {
  decideDiscoveryPresentation,
  FEATURE_KEYS,
  FEATURE_SPECS,
  isDiscoverableFeature,
  strongestDiscoveryState,
  type FeatureDiscoveryState,
} from "@/lib/engagement/feature-contract";

describe("Smart Notes catalog", () => {
  it("is available under active development (not unavailable, not planned)", () => {
    const spec = FEATURE_SPECS[FEATURE_KEYS.SMART_NOTES];
    expect(spec.availability).toBe("under_development");
    expect(spec.discoverable).toBe(true);
    expect(spec.route).toBe("/notes");
  });

  it("never exposes Community Groups or Rewarded Ads to discovery", () => {
    expect(isDiscoverableFeature(FEATURE_KEYS.COMMUNITY_GROUPS)).toBe(false);
    expect(isDiscoverableFeature(FEATURE_KEYS.REWARDED_ADS)).toBe(false);
    expect(FEATURE_SPECS[FEATURE_KEYS.COMMUNITY_GROUPS].availability).toBe("unavailable");
    expect(FEATURE_SPECS[FEATURE_KEYS.REWARDED_ADS].availability).toBe("planned");
  });

  it("promotes only existing functions in the intro copy", () => {
    const copy = FEATURE_SPECS[FEATURE_KEYS.SMART_NOTES].discoveryCopy ?? "";
    // مافيش وعد بمميزات غير منشورة (صور/رسم/كتابة موجودة فعلًا).
    expect(copy).toContain("تكتب");
    expect(copy).toContain("ترسم");
    expect(copy).toContain("صور");
    expect(copy.length).toBeLessThanOrEqual(120);
  });
});

describe("discovery state ordering", () => {
  it("keeps the strongest state", () => {
    expect(strongestDiscoveryState("adopted", "tried")).toBe("adopted");
    expect(strongestDiscoveryState("tried", "introduced")).toBe("tried");
    expect(strongestDiscoveryState("introduced", "undiscovered")).toBe("introduced");
    expect(strongestDiscoveryState("tried", "tried")).toBe("tried");
  });
});

describe("decideDiscoveryPresentation", () => {
  const key = FEATURE_KEYS.SMART_NOTES;

  it("introduces an undiscovered user", () => {
    const decision = decideDiscoveryPresentation(key, {
      state: "undiscovered",
      dismissCount: 0,
    });
    expect(decision.shouldIntroduce).toBe(true);
    expect(decision.showIntro).toBe(true);
    expect(decision.showTip).toBe(false);
    expect(decision.reason).toBe("introduce");
  });

  it("does not repeat the intro once the user knows the feature", () => {
    const decision = decideDiscoveryPresentation(key, {
      state: "introduced",
      dismissCount: 0,
    });
    expect(decision.shouldIntroduce).toBe(false);
    expect(decision.showIntro).toBe(false);
  });

  it("shows an advanced tip (not an intro) after the user tried it", () => {
    const decision = decideDiscoveryPresentation(key, {
      state: "tried",
      dismissCount: 0,
    });
    expect(decision.showIntro).toBe(false);
    expect(decision.showTip).toBe(true);
    expect(decision.reason).toBe("already_tried");
  });

  it("shows tips and stops intros after adoption", () => {
    const decision = decideDiscoveryPresentation(key, {
      state: "adopted",
      dismissCount: 0,
    });
    expect(decision.shouldIntroduce).toBe(false);
    expect(decision.showIntro).toBe(false);
    expect(decision.showTip).toBe(true);
    expect(decision.reason).toBe("already_adopted");
  });

  it("stops bothering a user who dismissed three times", () => {
    const decision = decideDiscoveryPresentation(key, {
      state: "undiscovered",
      dismissCount: 3,
    });
    expect(decision.shouldIntroduce).toBe(false);
    expect(decision.showIntro).toBe(false);
    expect(decision.reason).toBe("dismissed_too_often");
  });

  it("never promotes unavailable or non-discoverable features", () => {
    for (const key of [FEATURE_KEYS.COMMUNITY_GROUPS, FEATURE_KEYS.REWARDED_ADS]) {
      const decision = decideDiscoveryPresentation(key, {
        state: "undiscovered",
        dismissCount: 0,
      });
      expect(decision.shouldIntroduce).toBe(false);
      expect(decision.showIntro).toBe(false);
    }

    const nonDiscoverable = decideDiscoveryPresentation(FEATURE_KEYS.GAMES, {
      state: "undiscovered",
      dismissCount: 0,
    });
    expect(nonDiscoverable.shouldIntroduce).toBe(false);
    expect(nonDiscoverable.reason).toBe("not_discoverable");
  });

  it("never forces a feature — the decision only controls visibility", () => {
    const states: FeatureDiscoveryState[] = [
      "undiscovered",
      "introduced",
      "tried",
      "adopted",
    ];
    for (const state of states) {
      const decision = decideDiscoveryPresentation(key, { state, dismissCount: 0 });
      // القرار بيحكم العرض بس — مافيش حالة بتقفل الميزة.
      expect([
        "introduce",
        "already_introduced",
        "already_tried",
        "already_adopted",
      ]).toContain(decision.reason);
    }
  });
});
