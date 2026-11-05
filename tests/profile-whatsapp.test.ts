import { describe, it, expect } from "vitest";

import {
  nextUpgrade,
  findPlanPrice,
  buildWhatsappMessage,
  buildWhatsappHref,
  type PublicPlan,
} from "@/lib/config/public-config";

const PLANS: PublicPlan[] = [
  { plan_key: "free", display_name_ar: "مجاني", price: "0", currency: "EGP" },
  { plan_key: "pro", display_name_ar: "احترافي", price: "199", currency: "EGP" },
  { plan_key: "ultra", display_name_ar: "ألتميت", price: "399", currency: "EGP" },
];

describe("nextUpgrade", () => {
  it("free → Pro", () => {
    expect(nextUpgrade("free")).toEqual({ targetKey: "pro", label: "ترقية إلى Pro" });
  });

  it("pro → Ultra", () => {
    expect(nextUpgrade("pro")).toEqual({ targetKey: "ultra", label: "ترقية إلى Ultra" });
  });

  it("premium (ميراث) تُعامَل كـ pro", () => {
    expect(nextUpgrade("premium")?.targetKey).toBe("ultra");
  });

  it("ultra → لا ترقية (يُخفى الزر)", () => {
    expect(nextUpgrade("ultra")).toBeNull();
  });

  it("قيمة فارغة أو مجهولة تُعتبر free", () => {
    expect(nextUpgrade("")?.targetKey).toBe("pro");
    expect(nextUpgrade(null)?.targetKey).toBe("pro");
    expect(nextUpgrade(undefined)?.targetKey).toBe("pro");
  });
});

describe("findPlanPrice", () => {
  it("يجد سعر الباقة وعملتها", () => {
    expect(findPlanPrice(PLANS, "pro")).toEqual({ price: "199", currency: "EGP" });
  });

  it("يعيد null لباقة غير موجودة أو بلا سعر", () => {
    expect(findPlanPrice(PLANS, "enterprise")).toBeNull();
    expect(findPlanPrice([{ plan_key: "x", display_name_ar: null, price: null, currency: null }], "x")).toBeNull();
    expect(findPlanPrice(null, "pro")).toBeNull();
  });
});

describe("buildWhatsappMessage", () => {
  const vars = { name: "أحمد", mag_code: "MAG-ABCDE", plan_name: "Pro", price: "199" };

  it("يستبدل كل المتغيّرات", () => {
    const msg = buildWhatsappMessage(
      "أنا {name}، كود {mag_code}، عايز أشترك في {plan_name} بـ {price} EGP",
      vars
    );
    expect(msg).toBe("أنا أحمد، كود MAG-ABCDE، عايز أشترك في Pro بـ 199 EGP");
  });

  it("يستخدم رسالة افتراضية عند غياب القالب", () => {
    const msg = buildWhatsappMessage(null, vars);
    expect(msg).toContain("أحمد");
    expect(msg).toContain("MAG-ABCDE");
    expect(msg).not.toContain("{");
  });

  it("يترك المتغيّر المجهول كما هو بدل حذفه", () => {
    expect(buildWhatsappMessage("قيمة {unknown}", vars)).toContain("{unknown}");
  });

  it("ينظّف المسافات الزائدة عندما تكون قيمة فارغة", () => {
    const msg = buildWhatsappMessage("اشترك في {plan_name} بـ {price} EGP", {
      ...vars,
      price: "",
    });
    expect(msg).toBe("اشترك في Pro بـ EGP");
  });
});

describe("buildWhatsappHref", () => {
  it("يبني رابط wa.me مع النص مُرمَّزًا", () => {
    const href = buildWhatsappHref({
      whatsappNumber: "+201234567890",
      template: "أنا {name}، عايز {plan_name}",
      vars: { name: "أحمد", plan_name: "Pro" },
    });
    expect(href).not.toBeNull();
    expect(href!.startsWith("https://wa.me/201234567890?text=")).toBe(true);
    const encoded = href!.split("text=")[1];
    expect(decodeURIComponent(encoded)).toContain("أحمد");
  });

  it("يعيد null عند غياب الرقم (فالواجهة تُخفي الزر)", () => {
    expect(buildWhatsappHref({ whatsappNumber: null })).toBeNull();
    expect(buildWhatsappHref({ whatsappNumber: "" })).toBeNull();
    expect(buildWhatsappHref({ whatsappNumber: "+20" })).toBeNull();
  });

  it("يقبل رقمًا بمسافات أو شرطات ويستخرج الأرقام", () => {
    const href = buildWhatsappHref({ whatsappNumber: "+20 123 456 7890" });
    expect(href!.startsWith("https://wa.me/201234567890")).toBe(true);
  });

  it("يعمل بلا قالب (يستخدم الرسالة الافتراضية)", () => {
    const href = buildWhatsappHref({ whatsappNumber: "+201234567890" });
    expect(href).not.toBeNull();
    expect(decodeURIComponent(href!.split("text=")[1])).toContain("عايز أشترك");
  });
});
