import { describe, it, expect } from "vitest";
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_IDS,
  ONBOARDING_TOTAL_STEPS,
  isValidOnboardingStep,
  isValidOnboardingAction,
  nextOnboardingStep,
  initialOnboardingState,
  advanceOnboarding,
  normalizeOnboardingRow,
} from "../steps";

describe("ONBOARDING_STEPS", () => {
  it("الجولة ٥ خطوات بمعرّفات فريدة", () => {
    expect(ONBOARDING_TOTAL_STEPS).toBe(5);
    expect(new Set(ONBOARDING_STEP_IDS).size).toBe(ONBOARDING_TOTAL_STEPS);
    expect(ONBOARDING_STEP_IDS).toEqual(["welcome", "discover", "setup", "characters", "first_task"]);
  });

  it("كل خطوة ليها عنوان ونص وCTA صحيح الشكل", () => {
    for (const s of ONBOARDING_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
      if (s.cta) {
        expect(s.cta.href.startsWith("/")).toBe(true);
        expect(s.cta.label.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("isValidOnboardingStep / nextOnboardingStep", () => {
  it("بيقبل المعرّفات الصحيحة ويرفض أي حاجة تانية", () => {
    for (const id of ONBOARDING_STEP_IDS) expect(isValidOnboardingStep(id)).toBe(true);
    expect(isValidOnboardingStep("nope")).toBe(false);
    expect(isValidOnboardingStep(null)).toBe(false);
    expect(isValidOnboardingStep(5)).toBe(false);
  });

  it("الترتيب خطوة ورا خطوة وآخر خطوة بترجع null", () => {
    expect(nextOnboardingStep("welcome")).toBe("discover");
    expect(nextOnboardingStep("discover")).toBe("setup");
    expect(nextOnboardingStep("characters")).toBe("first_task");
    expect(nextOnboardingStep("first_task")).toBeNull();
    expect(nextOnboardingStep("ghost")).toBeNull();
  });
});

describe("advanceOnboarding", () => {
  it("start بيبدأ من welcome مرة واحدة", () => {
    const s = advanceOnboarding(initialOnboardingState(), "start");
    expect(s.started).toBe(true);
    expect(s.currentStep).toBe("welcome");
    expect(advanceOnboarding(s, "start")).toEqual(s);
  });

  it("المشي الكامل بيوصّل للإكمال بعد آخر خطوة", () => {
    let s = advanceOnboarding(initialOnboardingState(), "start");
    for (let i = 0; i < ONBOARDING_TOTAL_STEPS; i++) s = advanceOnboarding(s, "next");
    expect(s.completed).toBe(true);
    expect(s.currentStep).toBeNull();
    expect(s.completedSteps).toEqual(ONBOARDING_STEP_IDS);
    // الإكمال بيقفل الجولة — أي next إضافي مالوش تأثير
    expect(advanceOnboarding(s, "next")).toEqual(s);
  });

  it("complete بتنهي الجولة فورًا بكل الخطوات", () => {
    const s = advanceOnboarding(initialOnboardingState(), "complete");
    expect(s.completed).toBe(true);
    expect(s.completedSteps).toEqual(ONBOARDING_STEP_IDS);
    expect(s.currentStep).toBeNull();
  });

  it("skip بتوقف الجولة ومبتتكررش", () => {
    let s = advanceOnboarding(initialOnboardingState(), "start");
    s = advanceOnboarding(s, "next");
    s = advanceOnboarding(s, "skip");
    expect(s.skipped).toBe(true);
    expect(s.currentStep).toBeNull();
    expect(advanceOnboarding(s, "start")).toEqual(s);
    expect(advanceOnboarding(s, "next")).toEqual(s);
  });

  it("reset بترجّع الجولة من الأول", () => {
    let s = advanceOnboarding(initialOnboardingState(), "complete");
    s = advanceOnboarding(s, "reset");
    expect(s.completed).toBe(false);
    expect(s.started).toBe(true);
    expect(s.currentStep).toBe("welcome");
    expect(s.completedSteps).toEqual([]);
  });

  it("next قبل start أو من غير خطوة حالية مالوش تأثير", () => {
    expect(advanceOnboarding(initialOnboardingState(), "next")).toEqual(initialOnboardingState());
  });

  it("الإجراءات غير المعروفة مرفوضة", () => {
    expect(isValidOnboardingAction("next")).toBe(true);
    expect(isValidOnboardingAction("delete")).toBe(false);
    expect(isValidOnboardingAction(null)).toBe(false);
  });
});

describe("normalizeOnboardingRow", () => {
  it("صف مكتمل بيرجع completed مهما كانت القيم التانية", () => {
    const s = normalizeOnboardingRow({
      current_step: "welcome",
      completed_steps: ["welcome"],
      completed_at: "2026-01-01T00:00:00Z",
      skipped_at: null,
    });
    expect(s.completed).toBe(true);
    expect(s.currentStep).toBeNull();
    expect(s.started).toBe(true);
  });

  it("صف متخطّى بيرجع skipped", () => {
    const s = normalizeOnboardingRow({
      current_step: "setup",
      completed_steps: [],
      completed_at: null,
      skipped_at: "2026-01-01T00:00:00Z",
    });
    expect(s.skipped).toBe(true);
    expect(s.currentStep).toBeNull();
  });

  it("قيم قاعدة بيانات فاسدة مترفضة بأمان", () => {
    const s = normalizeOnboardingRow({
      current_step: "hacked",
      completed_steps: ["hacked", "welcome", 42],
      completed_at: null,
      skipped_at: null,
    });
    expect(s.currentStep).toBeNull();
    expect(s.completedSteps).toEqual(["welcome"]);
    expect(s.started).toBe(false);
  });
});
