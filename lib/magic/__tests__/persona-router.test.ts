import { describe, it, expect } from "vitest";
import { selectPersona, isPlanningRequest } from "@/lib/magic/persona-router";
import { buildPersonaIdentityPrompt, isMagicPersonaId, normalizeMagicPersonaId } from "@/lib/magic/personas";

describe("selectPersona — الشخصية الموحّدة Magic Agent", () => {
  it("كل الرسايل تروح لـ Magic Agent — مهما كان المحتوى", () => {
    for (const message of [
      "إزاي أرفع محاضرة؟",
      "اعمل لي جدول مذاكرة",
      "اشرحلي Routing",
      "عايز أتحدى حد",
      "عندي امتحان بعد يومين عن مادة الشبكات",
      "أنا مش فاهم الجزئية دي في المحاضرة",
      "صباح الخير",
      "",
    ]) {
      const r = selectPersona({ page: "dashboard", message });
      expect(r.persona).toBe("magic");
      expect(r.reason).toBe("unified_agent");
    }
  });

  it("الاختيار الصريح القديم (tutor/play/coach) يتوحّد على Magic Agent", () => {
    const r = selectPersona({ explicitPersona: "play", page: "lesson", message: "اشرحلي Routing" });
    expect(r.persona).toBe("magic");
    expect(r.reason).toBe("unified_agent");
  });

  it("قيم صريحة غير صالحة تُتجاهل", () => {
    const r = selectPersona({ explicitPersona: "hacker", message: "اشرحلي Routing" });
    expect(r.persona).toBe("magic");
    expect(r.reason).toBe("unified_agent");
  });

  it("آخر شخصية محفوظة في الجلسة لا تؤثر — Magic Agent دايمًا", () => {
    const r = selectPersona({ page: "dashboard", message: "تمام كمّل", lastPersona: "tutor" });
    expect(r.persona).toBe("magic");
    expect(r.reason).toBe("unified_agent");
  });

  it("سياق الصفحة لا يغيّر الشخصية — Magic Agent في كل الصفحات", () => {
    expect(selectPersona({ page: "lesson", message: "" }).persona).toBe("magic");
    expect(selectPersona({ page: "play", message: "" }).persona).toBe("magic");
  });
});

describe("isPlanningRequest — بدل شخصية الكوتش القديمة", () => {
  it("يكتشف طلبات التخطيط", () => {
    expect(isPlanningRequest("اعمل لي جدول مذاكرة")).toBe(true);
    expect(isPlanningRequest("عندي امتحان بعد يومين عن مادة الشبكات")).toBe(true);
    expect(isPlanningRequest("أنظم مذاكرتي")).toBe(true);
  });

  it("لا يكتشف الرسايل العادية", () => {
    expect(isPlanningRequest("صباح الخير")).toBe(false);
    expect(isPlanningRequest("اشرحلي Routing")).toBe(false);
    expect(isPlanningRequest("")).toBe(false);
  });
});

describe("buildPersonaIdentityPrompt — هوية Magic Agent الموحّدة", () => {
  it("كل المعرّفات (الحالية والقديمة) ترجع نفس هوية Magic Agent", () => {
    for (const id of ["magic", "tutor", "play", "coach"] as const) {
      const p = buildPersonaIdentityPrompt(id, { subject: "Math" });
      expect(p).toContain("Magic Agent (ماجيك)");
      expect(p).toContain("اللهجة المصرية");
    }
  });

  it("هوية Magic Agent تحمل كل المهارات المدموجة", () => {
    const p = buildPersonaIdentityPrompt("magic", {});
    expect(p).toContain("العقل وفهم الأمر");
    expect(p).toContain("البرمجة والتقنية");
    expect(p).toContain("اتخاذ القرار");
    expect(p).toContain("البحث في الإنترنت");
    expect(p).toContain("الشرح العلمي");
    expect(p).toContain("التخطيط والتحفيز");
    expect(p).toContain("الطاقة والترفيه");
  });

  it("الهوية تتكيّف مع المرحلة الدراسية", () => {
    expect(buildPersonaIdentityPrompt("magic", { stage: "primary" })).toContain("بسط المفاهيم");
    expect(buildPersonaIdentityPrompt("magic", { stage: "university" })).toContain("أكاديمي");
  });

  it("كل هوية تحتوي الممنوعات الأساسية", () => {
    const p = buildPersonaIdentityPrompt("magic", {});
    expect(p).toContain("ممنوعات");
    expect(p).toContain("لا تخترع معلومات");
  });
});

describe("توافق المعرّفات القديمة", () => {
  it("isMagicPersonaId يقبل الحالي والقديم ويرفض الغريب", () => {
    expect(isMagicPersonaId("magic")).toBe(true);
    expect(isMagicPersonaId("tutor")).toBe(true);
    expect(isMagicPersonaId("play")).toBe(true);
    expect(isMagicPersonaId("coach")).toBe(true);
    expect(isMagicPersonaId("nope")).toBe(false);
  });

  it("normalizeMagicPersonaId يوحّد أي معرّف على magic", () => {
    for (const id of ["magic", "tutor", "play", "coach", "anything"]) {
      expect(normalizeMagicPersonaId(id)).toBe("magic");
    }
  });
});
