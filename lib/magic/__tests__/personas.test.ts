import { describe, expect, it } from "vitest";

import {
  buildPersonaDirective,
  buildPersonaIdentityPrompt,
  isMagicPersonaId,
  MAGIC_PERSONAS,
  normalizeMagicPersonaId,
  selectMagicPersona,
} from "../personas";

describe("selectMagicPersona — الشخصية الموحّدة", () => {
  it("كل المدخلات ترجع Magic Agent بغضّ النظر عن المحتوى أو الاختيار الصريح", () => {
    for (const input of [
      { prompt: "العب معي لعبة تحدي", explicitPersona: "coach" },
      { prompt: "أهلاً", explicitPersona: "wizard" },
      { prompt: "هات لي محاضرة الشبكات", intent: "WORKSPACE_SEARCH" },
      { prompt: "يا ماجيك عندي امتحان بعد يومين ومش مذاكر حاجة" },
      { prompt: "أنا مش فاهم الجزئية دي في المحاضرة" },
      { prompt: "إزاي أرفع محاضرة على المنصة؟" },
      { prompt: "تمام يا ماجيك", page: "/lesson/abc-123" },
      { prompt: "إيه الأخبار؟", page: "/games" },
      { prompt: "رصيدي قد إيه؟", page: "/lesson/abc-123" },
      { prompt: "" },
    ]) {
      const sel = selectMagicPersona(input);
      expect(sel.persona).toBe("magic");
      expect(sel.reason).toBe("unified_agent");
    }
  });
});

describe("buildPersonaDirective", () => {
  it("بدون تعليمات إضافية — كل التوجيهات اندمجت في الـ base prompt", () => {
    for (const id of ["magic", "tutor", "play", "coach"] as const) {
      expect(buildPersonaDirective(id)).toBe("");
    }
  });
});

describe("buildPersonaIdentityPrompt", () => {
  it("كل المعرّفات ترجع هوية Magic Agent الموحّدة", () => {
    for (const id of ["magic", "tutor", "play", "coach"] as const) {
      const p = buildPersonaIdentityPrompt(id, { subject: "الشبكات", lesson: "Routing" });
      expect(p).toContain("Magic Agent (ماجيك)");
      expect(p).toContain("مساعد Magicly الموحد");
      expect(p).toContain("المادة الحالية: الشبكات");
      expect(p).toContain("الدرس الحالي: Routing");
    }
  });

  it("الهوية الموحّدة تشمل قدرات العقل والبرمجة والقرار والبحث", () => {
    const p = buildPersonaIdentityPrompt("magic", {});
    expect(p).toContain("افهم قصد الطالب");
    expect(p).toContain("تفهم البرمجة والكود");
    expect(p).toContain("أنت اللي تاخد القرار");
    expect(p).toContain("بحث الويب");
  });

  it("قواعد التخطيط القديمة (كوتش) محفوظة كمهارة — الخطة مسودة مش إنشاء فعلي", () => {
    const p = buildPersonaIdentityPrompt("magic", {});
    expect(p).toContain("خطة واقعية خطوات مرقّمة بمواعيد واضحة");
    expect(p).toContain("مسودة");
  });
});

describe("MAGIC_PERSONAS", () => {
  it("شخصية واحدة رسمية: Magic Agent", () => {
    expect(Object.keys(MAGIC_PERSONAS)).toEqual(["magic"]);
    const meta = MAGIC_PERSONAS.magic;
    expect(meta.name).toBe("Magic Agent");
    expect(meta.latin.length).toBeGreaterThan(0);
    expect(meta.emoji.length).toBeGreaterThan(0);
    expect(meta.tagline.length).toBeGreaterThan(0);
  });

  it("توافق المعرّفات: القديم مقبول وبيتوحّد على magic", () => {
    expect(isMagicPersonaId("magic")).toBe(true);
    expect(isMagicPersonaId("tutor")).toBe(true);
    expect(isMagicPersonaId("play")).toBe(true);
    expect(isMagicPersonaId("coach")).toBe(true);
    expect(isMagicPersonaId("nope")).toBe(false);
    expect(normalizeMagicPersonaId("tutor")).toBe("magic");
    expect(normalizeMagicPersonaId("magic")).toBe("magic");
  });
});
