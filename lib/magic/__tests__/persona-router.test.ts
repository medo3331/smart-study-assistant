import { describe, it, expect } from "vitest";
import { selectPersona } from "@/lib/magic/persona-router";
import { buildPersonaIdentityPrompt, AI_PERSONA_IDS, isValidPersona } from "@/lib/magic/personas";

describe("selectPersona — سيناريوهات التوجيه المعتمدة", () => {
  it("Dashboard + «إزاي أرفع محاضرة؟» ← Magic", () => {
    const r = selectPersona({ page: "dashboard", message: "إزاي أرفع محاضرة؟" });
    expect(r.persona).toBe("magic");
    expect(r.reason).toBe("message_platform");
  });

  it("Dashboard + «اعمل لي جدول مذاكرة» ← Coach", () => {
    const r = selectPersona({ page: "dashboard", message: "اعمل لي جدول مذاكرة" });
    expect(r.persona).toBe("coach");
    expect(r.reason).toBe("message_planning");
  });

  it("صفحة الدرس + «اشرحلي Routing» ← Tutor", () => {
    const r = selectPersona({ page: "lesson", message: "اشرحلي Routing" });
    expect(r.persona).toBe("tutor");
  });

  it("الألعاب + «عايز أتحدى حد» ← Play", () => {
    const r = selectPersona({ page: "play", message: "عايز أتحدى حد" });
    expect(r.persona).toBe("play");
  });

  it("«عندي امتحان بعد يومين» ← Coach (تخطيط)", () => {
    const r = selectPersona({ page: "dashboard", message: "عندي امتحان بعد يومين عن مادة الشبكات" });
    expect(r.persona).toBe("coach");
    expect(r.reason).toBe("message_planning");
  });

  it("«أنا مش فاهم الجزئية دي في المحاضرة» ← Tutor", () => {
    const r = selectPersona({ page: "dashboard", message: "أنا مش فاهم الجزئية دي في المحاضرة" });
    expect(r.persona).toBe("tutor");
    expect(r.reason).toBe("message_academic");
  });

  it("سؤال المنصة من داخل صفحة الدرس ← Magic (الصفحة مجرد سياق)", () => {
    const r = selectPersona({ page: "lesson", message: "رصيدي كام؟" });
    expect(r.persona).toBe("magic");
    expect(r.reason).toBe("message_platform");
  });

  it("وضع الشرح داخل الدرس بدون كلمات مفتاحية ← Tutor (lesson_mode)", () => {
    const r = selectPersona({ page: "lesson", message: "تمام كمّل", mode: "explain", hasLessonContext: true });
    expect(r.persona).toBe("tutor");
    expect(r.reason).toBe("lesson_mode");
  });

  it("رسالة عادية في Dashboard ← Magic (default)", () => {
    const r = selectPersona({ page: "dashboard", message: "صباح الخير" });
    expect(r.persona).toBe("magic");
    expect(r.reason).toBe("default");
  });

  it("الاختيار الصريح للمستخدم له الأولوية المطلقة", () => {
    const r = selectPersona({ explicitPersona: "play", page: "lesson", message: "اشرحلي Routing" });
    expect(r.persona).toBe("play");
    expect(r.reason).toBe("user_selected");
  });

  it("الاختيار الصريح magic يرجع للتوجيه الآلي (مش reason=user_selected)", () => {
    const r = selectPersona({ explicitPersona: "magic", page: "lesson", message: "اشرحلي Routing" });
    expect(r.persona).toBe("tutor");
  });

  it("قيم صريحة غير صالحة تُتجاهل", () => {
    const r = selectPersona({ explicitPersona: "hacker", message: "اشرحلي Routing" });
    expect(r.persona).toBe("tutor");
  });

  it("رسالة فاضية في صفحة اللعب ← Play (سياق الصفحة)", () => {
    const r = selectPersona({ page: "play", message: "" });
    expect(r.persona).toBe("play");
  });

  it("سياق المحادثة: رسالة محايدة بعد Tutor تبقى مع Tutor", () => {
    const r = selectPersona({ page: "dashboard", message: "تمام كمّل", lastPersona: "tutor" });
    expect(r.persona).toBe("tutor");
    expect(r.reason).toBe("conversation_context");
  });

  it("سياق المحادثة لا يمنع إشارة تخطيط واضحة ← Coach", () => {
    const r = selectPersona({ page: "dashboard", message: "اعمل لي جدول مذاكرة", lastPersona: "tutor" });
    expect(r.persona).toBe("coach");
    expect(r.reason).toBe("message_planning");
  });

  it("سياق المحادثة لا يمنع إشارة ترفيه ← Play", () => {
    const r = selectPersona({ page: "dashboard", message: "يا ريت ألعب حاجة", lastPersona: "coach" });
    expect(r.persona).toBe("play");
  });

  it("آخر شخصية Magic لا تُثبّت (توجيه طبيعي)", () => {
    const r = selectPersona({ page: "dashboard", message: "أهلاً", lastPersona: "magic" });
    expect(r.persona).toBe("magic");
    expect(r.reason).toBe("default");
  });

  it("اختيار صريح يتفوق على سياق المحادثة", () => {
    const r = selectPersona({ explicitPersona: "play", message: "تمام كمّل", lastPersona: "tutor" });
    expect(r.persona).toBe("play");
    expect(r.reason).toBe("user_selected");
  });
});

describe("buildPersonaIdentityPrompt", () => {
  it("magic يفوّض buildMagicSystemPrompt (نفس الهوية)", () => {
    const p = buildPersonaIdentityPrompt("magic", { subject: "Math" });
    expect(p).toContain("Magic (ماجيك)");
    expect(p).toContain("اللهجة المصرية");
  });

  it("tutor يحمل دور المعلم وقواعد التنسيق", () => {
    const p = buildPersonaIdentityPrompt("tutor", { subject: "الشبكات", lesson: "Routing" });
    expect(p).toContain("Tutor");
    expect(p).toContain("الشرح العلمي");
    expect(p).toContain("مساعد Magicly الموحد");
    expect(p).toContain("الدرس الحالي: Routing");
  });

  it("play يحمل دور الترفيه", () => {
    const p = buildPersonaIdentityPrompt("play", {});
    expect(p).toContain("Play");
    expect(p).toContain("الألعاب");
  });

  it("coach يحمل دور التخطيط ولا يدّعي إنشاء مواعيد فعلية", () => {
    const p = buildPersonaIdentityPrompt("coach", {});
    expect(p).toContain("Coach");
    expect(p).toContain("لا تدّعي");
  });

  it("الهويات تتكيّف مع المرحلة الدراسية", () => {
    const primary = buildPersonaIdentityPrompt("tutor", { stage: "primary" });
    expect(primary).toContain("مراحل أولى");
    const university = buildPersonaIdentityPrompt("coach", { stage: "university" });
    expect(university).toContain("جامعي");
  });

  it("كل هوية تحتوي الممنوعات الأساسية", () => {
    for (const id of AI_PERSONA_IDS) {
      expect(buildPersonaIdentityPrompt(id, {})).toContain("لا تخترع معلومات");
    }
  });
});

describe("سجل الشخصيات", () => {
  it("يحتوي الشخصيات الأربعة الرسمية", () => {
    expect(AI_PERSONA_IDS).toEqual(["magic", "tutor", "play", "coach"]);
    expect(isValidPersona("magic")).toBe(true);
    expect(isValidPersona("nope")).toBe(false);
  });
});
