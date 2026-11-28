import { describe, expect, it } from "vitest";

import {
  buildPersonaDirective,
  isMagicPersonaId,
  MAGIC_PERSONAS,
  selectMagicPersona,
} from "../personas";

describe("selectMagicPersona", () => {
  it("اختيار المستخدم الصريح له الأولوية دائمًا", () => {
    const sel = selectMagicPersona({
      prompt: "العب معي لعبة تحدي",
      explicitPersona: "coach",
    });
    expect(sel.persona).toBe("coach");
    expect(sel.reason).toBe("user_override");
  });

  it("اختيار صريح غير صالح يُتجاهل", () => {
    const sel = selectMagicPersona({ prompt: "أهلاً", explicitPersona: "wizard" });
    expect(sel.persona).toBe("magic");
    expect(sel.reason).toBe("default");
  });

  it("البحث في ملفات المساحة يبقى لماجيك", () => {
    const sel = selectMagicPersona({
      prompt: "هات لي محاضرة الشبكات",
      intent: "WORKSPACE_SEARCH",
    });
    expect(sel.persona).toBe("magic");
    expect(sel.reason).toBe("workspace_intent");
  });

  it("«عندي امتحان بعد يومين» → كوتش (تخطيط)", () => {
    const sel = selectMagicPersona({ prompt: "يا ماجيك عندي امتحان بعد يومين ومش مذاكر حاجة" });
    expect(sel.persona).toBe("coach");
  });

  it("«اعمل لي جدول مذاكرة» → كوتش", () => {
    const sel = selectMagicPersona({ prompt: "اعمل لي جدول مذاكرة لأسبوع" });
    expect(sel.persona).toBe("coach");
  });

  it("«مش فاهم الجزئية دي» → المعلم", () => {
    const sel = selectMagicPersona({ prompt: "أنا مش فاهم الجزئية دي في المحاضرة" });
    expect(sel.persona).toBe("tutor");
  });

  it("«اشرحلي Routing» → المعلم حتى بدون صفحة درس", () => {
    const sel = selectMagicPersona({ prompt: "اشرحلي Routing بطريقة بسيطة" });
    expect(sel.persona).toBe("tutor");
  });

  it("«عايز أتحدى حد» → بلاي", () => {
    const sel = selectMagicPersona({ prompt: "عايز أتحدى حد في لعبة" });
    expect(sel.persona).toBe("play");
  });

  it("سؤال المنصة (رصيد/رفع) → ماجيك", () => {
    const sel = selectMagicPersona({ prompt: "إزاي أرفع محاضرة على المنصة؟" });
    expect(sel.persona).toBe("magic");
    expect(sel.reason).toBe("content_match");
  });

  it("صفحة الدرس bias → معلم لما الكلام محايد", () => {
    const sel = selectMagicPersona({ prompt: "تمام يا ماجيك", page: "/lesson/abc-123" });
    expect(sel.persona).toBe("tutor");
    expect(sel.reason).toBe("page_context");
  });

  it("صفحة الألعاب bias → بلاي لما الكلام محايد", () => {
    const sel = selectMagicPersona({ prompt: "إيه الأخبار؟", page: "/games" });
    expect(sel.persona).toBe("play");
  });

  it("محتوى صفحة الدرس لا يجبر: سؤال حساب يفضل ماجيك", () => {
    const sel = selectMagicPersona({ prompt: "رصيدي قد إيه؟", page: "/lesson/abc-123" });
    expect(sel.persona).toBe("magic");
  });
});

describe("buildPersonaDirective", () => {
  it("ماجيك بدون تعليمات إضافية (النظام الأساسي يغطيه)", () => {
    expect(buildPersonaDirective("magic")).toBe("");
  });

  it("توجيه المعلم يذكر التخصص العلمي", () => {
    const directive = buildPersonaDirective("tutor", { subject: "الشبكات", lesson: "Routing" });
    expect(directive).toContain("المعلم (Tutor)");
    expect(directive).toContain("الشبكات");
    expect(directive).toContain("Routing");
  });

  it("توجيه بلاي وكوتش يحمل هوية كل شخصية", () => {
    expect(buildPersonaDirective("play")).toContain("بلاي (Play)");
    expect(buildPersonaDirective("coach")).toContain("كوتش (Coach)");
  });

  it("الكوتش مشجع ملهم بيفهم الهدف ويطوّر المستوى", () => {
    const directive = buildPersonaDirective("coach");
    expect(directive).toContain("مشجع ملهم");
    expect(directive).toContain("هدف الطالب");
    expect(directive).toContain("تطوير مستواه");
  });

  it("الكوتش بيتعامل مع «عندي امتحان» كرحلة تخطيط من غير روابط", () => {
    const directive = buildPersonaDirective("coach");
    expect(directive).toContain("متبعتش روابط لصفحات");
    expect(directive).toContain("خطة واقعية بخطوات مرقّمة ومواعيد");
  });

  it("كل الشخصيات المتخصصة تؤكد الهوية الموحدة", () => {
    for (const id of ["tutor", "play", "coach"] as const) {
      expect(buildPersonaDirective(id)).toContain("شخصية Magic الموحدة");
    }
  });
});

describe("MAGIC_PERSONAS", () => {
  it("الشخصيات الأربعة معرفة ومكتملة", () => {
    expect(Object.keys(MAGIC_PERSONAS).sort()).toEqual(["coach", "magic", "play", "tutor"]);
    for (const meta of Object.values(MAGIC_PERSONAS)) {
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.latin.length).toBeGreaterThan(0);
    }
    expect(isMagicPersonaId("magic")).toBe(true);
    expect(isMagicPersonaId("nope")).toBe(false);
  });
});
