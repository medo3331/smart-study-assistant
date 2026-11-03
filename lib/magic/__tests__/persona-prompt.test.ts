import { describe, it, expect } from "vitest";
import { buildMagicSystemPrompt } from "@/lib/magic/persona-prompt";

describe("buildMagicSystemPrompt", () => {
  it("يتحدث باللهجة المصرية (هوية Magic)", () => {
    const p = buildMagicSystemPrompt({});
    expect(p).toContain("Magic (ماجيك)");
    expect(p).toContain("اللهجة المصرية");
    expect(p).toContain("ماجيك");
  });

  it("يحفظ المصطلحات الإنجليزية (English technical terms)", () => {
    const p = buildMagicSystemPrompt({ subject: "Math" });
    expect(p).toContain("English");
    expect(p).toContain("المادة الحالية: Math");
  });

  it("يحقن subject/lesson/mode في السياق", () => {
    const p = buildMagicSystemPrompt({ subject: "فيزياء", lesson: "الحركة", mode: "explain" });
    expect(p).toContain("المادة الحالية: فيزياء");
    expect(p).toContain("الدرس الحالي: الحركة");
    expect(p).toContain("وضع المحادثة: explain");
  });

  it("يكيّف الشرح حسب المرحلة (stage note)", () => {
    expect(buildMagicSystemPrompt({ stage: "primary" })).toContain("بسط المفاهيم");
    expect(buildMagicSystemPrompt({ stage: "university" })).toContain("أكاديمي");
    expect(buildMagicSystemPrompt({})).toContain("وازن بين البساطة");
  });

  it("لا يحتوي على Markdown formatting tokens كنص", () => {
    const p = buildMagicSystemPrompt({ subject: "x" });
    expect(p).not.toMatch(/\*\*|\#\#|```/);
  });

  it("ممنوعات (safety) موجودة", () => {
    const p = buildMagicSystemPrompt({});
    expect(p).toContain("ممنوعات");
    expect(p).toContain("لا تخترع معلومات");
  });
});
