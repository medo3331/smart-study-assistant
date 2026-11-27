import { describe, it, expect } from "vitest";
import { extractPlanDraft, stripPlanFence, validatePlanDraft } from "@/lib/agent/plan-draft";

const validDraft = {
  subject: "الشبكات",
  examDate: "2026-12-01",
  days: [
    { dayNumber: 1, kind: "content", title: "OSI Model", description: "مراجعة الطبقات" },
    { dayNumber: 2, kind: "review", title: "IP Addressing", description: "" },
    { dayNumber: 3, kind: "quiz", title: "اختبار شامل", description: "محاكاة امتحان" },
  ],
};

describe("extractPlanDraft", () => {
  it("يستخرج مسودة صحيحة من كتلة ```plan", () => {
    const msg = "دي خطتك يا صاحبي:\n\n```plan\n" + JSON.stringify(validDraft) + "\n```\nبالتوفيق!";
    const r = extractPlanDraft(msg);
    expect(r).not.toBeNull();
    expect(r!.draft.subject).toBe("الشبكات");
    expect(r!.draft.days).toHaveLength(3);
    expect(r!.raw).toContain("```plan");
  });

  it("بيرجّع null لو مفيش كتلة", () => {
    expect(extractPlanDraft("رد عادي من غير كتلة")).toBeNull();
    expect(extractPlanDraft("")).toBeNull();
  });

  it("بيرجّع null لو JSON داخل الكتلة بايظ", () => {
    const msg = "```plan\n{not json}\n```";
    expect(extractPlanDraft(msg)).toBeNull();
  });

  it("بيرجّع null لو الكتلة موجودة لكن المحتوى مش مسودة صالحة", () => {
    const msg = "```plan\n{\"subject\":\"\"}\n```";
    expect(extractPlanDraft(msg)).toBeNull();
  });
});

describe("stripPlanFence", () => {
  it("يشيل الكتلة ويحافظ على باقي الرد", () => {
    const msg = "مقدمة\n\n```plan\n{}\n```\nخاتمة";
    const out = stripPlanFence(msg);
    expect(out).toContain("مقدمة");
    expect(out).toContain("خاتمة");
    expect(out).not.toContain("```plan");
  });
});

describe("validatePlanDraft", () => {
  it("مسودة صحيحة تتعدي وتترتب بالأيام", () => {
    const shuffled = { ...validDraft, days: [validDraft.days[2], validDraft.days[0], validDraft.days[1]] };
    const r = validatePlanDraft(shuffled);
    expect("draft" in r && r.draft !== null).toBe(true);
    if ("draft" in r && r.draft) {
      expect(r.draft.days[0].dayNumber).toBe(1);
      expect(r.draft.days[2].kind).toBe("quiz");
    }
  });

  it("برفض مادة فاضية", () => {
    const r = validatePlanDraft({ ...validDraft, subject: "   " });
    expect("error" in r && r.error).toBeTruthy();
  });

  it("برفض تاريخ بصيغة غلط أو تاريخ مستحيل", () => {
    expect("error" in validatePlanDraft({ ...validDraft, examDate: "01-12-2026" })).toBe(true);
    expect("error" in validatePlanDraft({ ...validDraft, examDate: "2026-13-40" })).toBe(true);
  });

  it("برفض عدد أيام خارج الحدود (0 أو 15)", () => {
    expect("error" in validatePlanDraft({ ...validDraft, days: [] })).toBe(true);
    const tooMany = Array.from({ length: 15 }, (_, i) => ({ dayNumber: i + 1, kind: "content", title: "يوم" }));
    expect("error" in validatePlanDraft({ ...validDraft, days: tooMany })).toBe(true);
  });

  it("برفض kind غير معروف", () => {
    const bad = { ...validDraft, days: [{ dayNumber: 1, kind: "party", title: "يوم" }] };
    expect("error" in validatePlanDraft(bad)).toBe(true);
  });

  it("برفض يوم من غير عنوان", () => {
    const bad = { ...validDraft, days: [{ dayNumber: 1, kind: "content", title: "" }] };
    expect("error" in validatePlanDraft(bad)).toBe(true);
  });

  it("بيقصّ النصوص الطويلة بدل رفضها (clamp)", () => {
    const r = validatePlanDraft({
      ...validDraft,
      subject: "م".repeat(500),
      days: [{ dayNumber: 1, kind: "content", title: "ت".repeat(300), description: "د".repeat(1000) }],
    });
    expect("draft" in r && r.draft !== null).toBe(true);
    if ("draft" in r && r.draft) {
      expect(r.draft.subject.length).toBeLessThanOrEqual(120);
      expect(r.draft.days[0].title.length).toBeLessThanOrEqual(120);
      expect(r.draft.days[0].description.length).toBeLessThanOrEqual(400);
    }
  });

  it("برفض مدخلات غير كائن", () => {
    expect("error" in validatePlanDraft(null)).toBe(true);
    expect("error" in validatePlanDraft("نص")).toBe(true);
    expect("error" in validatePlanDraft(42)).toBe(true);
  });
});
