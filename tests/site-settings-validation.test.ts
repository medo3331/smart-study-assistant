import { describe, it, expect } from "vitest";
import {
  validateWhatsappNumber,
  parseDurations,
  validateSiteSettings,
  renderTemplate,
  extractPlaceholders,
} from "@/lib/settings/validation";

describe("validateWhatsappNumber", () => {
  it("يقبل +20 و10 أرقام", () => {
    expect(validateWhatsappNumber("+201234567890")).toBe(true);
    expect(validateWhatsappNumber("  +201000000000  ")).toBe(true);
  });

  it("يرفض الرقم المحلي بدون مفتاح الدولة", () => {
    expect(validateWhatsappNumber("01234567890")).toBe(false);
  });

  it("يرفض عدد أرقام خاطئ", () => {
    expect(validateWhatsappNumber("+20123456789")).toBe(false);
    expect(validateWhatsappNumber("+2012345678901")).toBe(false);
  });

  it("يرفض وجود مسافات أو رموز داخل الرقم", () => {
    expect(validateWhatsappNumber("+20 1234567890")).toBe(false);
    expect(validateWhatsappNumber("+20-1234567890")).toBe(false);
  });

  it("يرفض مفتاح دولة غير مصري", () => {
    expect(validateWhatsappNumber("+966123456789")).toBe(false);
  });
});

describe("parseDurations", () => {
  it("يحلّل صيغة الفاصلة", () => {
    const r = parseDurations("30,90,365");
    expect(r).toEqual({ ok: true, days: [30, 90, 365] });
  });

  it("يزيل المسافات والتكرار ويرتّب", () => {
    const r = parseDurations(" 90 , 30 , 30 ");
    expect(r).toEqual({ ok: true, days: [30, 90] });
  });

  it("يقبل صيغة JSON القديمة", () => {
    const r = parseDurations("[30, 90, 365]");
    expect(r).toEqual({ ok: true, days: [30, 90, 365] });
  });

  it("يرفض الصفر والسالب", () => {
    expect(parseDurations("0").ok).toBe(false);
    expect(parseDurations("-5").ok).toBe(false);
  });

  it("يرفض غير الأرقام", () => {
    expect(parseDurations("30,abc").ok).toBe(false);
    expect(parseDurations("30.5").ok).toBe(false);
  });

  it("يرفض الفراغ", () => {
    expect(parseDurations("   ").ok).toBe(false);
  });

  it("يرفض أكثر من 6 مدد", () => {
    expect(parseDurations("1,2,3,4,5,6,7").ok).toBe(false);
  });

  it("يرفض JSON غير صالح", () => {
    expect(parseDurations("[30,90").ok).toBe(false);
  });
});

describe("validateSiteSettings", () => {
  const good = {
    whatsappNumber: "+201234567890",
    whatsappTemplate: "أنا {name}، كود {mag_code}، عايز أشترك في {plan_name} بـ {price} EGP",
    defaultCurrency: "EGP",
    subscriptionDurations: "30,90,365",
  };

  it("يقبل إعدادات صالحة ويطبّعها", () => {
    const r = validateSiteSettings(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalized.whatsapp_number).toBe("+201234567890");
      expect(r.normalized.default_currency).toBe("EGP");
      expect(JSON.parse(r.normalized.subscription_durations)).toEqual([30, 90, 365]);
    }
  });

  it("يطبّع العملة إلى أحرف كبيرة", () => {
    const r = validateSiteSettings({ ...good, defaultCurrency: "egp" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized.default_currency).toBe("EGP");
  });

  it("يرفض عملة خارج القائمة", () => {
    const r = validateSiteSettings({ ...good, defaultCurrency: "USD" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("default_currency"))).toBe(true);
  });

  it("يرفض رقم واتساب غير صحيح", () => {
    const r = validateSiteSettings({ ...good, whatsappNumber: "0123" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("whatsapp_number"))).toBe(true);
  });

  it("يرفض قالبًا بمتغيّر غير معروف", () => {
    const r = validateSiteSettings({ ...good, whatsappTemplate: "أنا {name} وكود {unknown_var}" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("unknown_var"))).toBe(true);
  });

  it("يرفض قالبًا فارغًا", () => {
    const r = validateSiteSettings({ ...good, whatsappTemplate: "   " });
    expect(r.ok).toBe(false);
  });

  it("يرفض قالبًا أطول من 500 حرف", () => {
    const r = validateSiteSettings({ ...good, whatsappTemplate: "س".repeat(501) });
    expect(r.ok).toBe(false);
  });

  it("يجمع كل الأخطاء معًا", () => {
    const r = validateSiteSettings({
      whatsappNumber: "bad",
      whatsappTemplate: "",
      defaultCurrency: "USD",
      subscriptionDurations: "0",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(4);
  });
});

describe("renderTemplate", () => {
  it("يستبدل المتغيّرات المعروفة", () => {
    const out = renderTemplate("أنا {name}، كود {mag_code}، خطة {plan_name} بـ {price} EGP", {
      name: "أحمد",
      mag_code: "MAG-ABCDE",
      plan_name: "Pro",
      price: "199",
    });
    expect(out).toBe("أنا أحمد، كود MAG-ABCDE، خطة Pro بـ 199 EGP");
  });

  it("يترك المتغيّر المجهول كما هو بلا انفجار", () => {
    expect(renderTemplate("قيمة {other}", { name: "x" })).toBe("قيمة {other}");
  });

  it("يستخرج كل المتغيّرات المستخدمة", () => {
    expect(extractPlaceholders("{name} {price} {name}").sort()).toEqual(["name", "price"]);
  });
});
