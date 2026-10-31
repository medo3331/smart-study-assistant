import { describe, it, expect } from "vitest";
import { buildMagiclySystemPrompt } from "@/lib/magicly-ai";

const ctx = {
  subject: "فيزياء",
  lesson: "الحركة",
  learningStyle: "practical" as const,
  progress: { completed: 2, total: 5 },
  memories: [{ kind: "weak_topic", value: "السرعة" }],
};

describe("buildMagiclySystemPrompt integration", () => {
  const prompt = buildMagiclySystemPrompt(ctx as any, "explain", ["tool:ok"]);

  it("يحتوي على هوية Magic مرة واحدة", () => {
    const matches = prompt.match(/Magic \(ماجيك\)/g) || [];
    expect(matches.length).toBe(1);
    // لا هوية مكررة «ماجيكلي» (القديمة)
    const old = prompt.match(/أنت «ماجيكلي»/g) || [];
    expect(old.length).toBe(0);
  });

  it("يحفظ toolFacts", () => {
    expect(prompt).toContain("tool:ok");
  });

  it("يحفظ الذاكرة", () => {
    expect(prompt).toContain("weak_topic: السرعة");
  });

  it("يحفظ سياق المادة والدرس والتقدم", () => {
    expect(prompt).toContain("المادة: فيزياء");
    expect(prompt).toContain("الدرس: الحركة");
    expect(prompt).toContain("2/5");
  });

  it("يحفظ instructions (MODE_GUIDE)", () => {
    expect(prompt).toContain("Teaching Flow");
  });

  it("يحتوي على تعليمات أمان", () => {
    expect(prompt).toContain("لا تخترع معلومات");
  });
});
