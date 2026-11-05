import { describe, it, expect, vi, afterEach } from "vitest";

import {
  buildPublicConfig,
  buildPublicPlans,
  PUBLIC_CONFIG_KEYS,
} from "@/lib/config/public-config";

/** سلسلة استعلام وهمية قابلة للـ await (تحاكي builder في supabase-js). */
function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "in", "eq", "order", "limit"]) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("buildPublicConfig", () => {
  it("يعيد المفاتيح العامة فقط", () => {
    const config = buildPublicConfig([
      { key: "whatsapp_number", value: "+201234567890" },
      { key: "default_currency", value: "EGP" },
      { key: "whatsapp_template", value: "أنا {name}" },
      { key: "subscription_durations", value: "[30, 90]" },
      { key: "payment_methods", value: "[]" },
    ]);
    expect(Object.keys(config).sort()).toEqual([...PUBLIC_CONFIG_KEYS].sort());
  });

  it("يتجاهل أي مفتاح خارج القائمة البيضاء (منع تسريب إعدادات)", () => {
    const config = buildPublicConfig([
      { key: "whatsapp_number", value: "+201234567890" },
      { key: "internal_secret_key", value: "should-not-leak" },
    ]);
    expect(config).not.toHaveProperty("internal_secret_key");
    expect(JSON.stringify(config)).not.toContain("should-not-leak");
  });

  it("يتعامل مع صفوف ناقصة أو null بلا انفجار", () => {
    expect(buildPublicConfig(null)).toEqual({});
    expect(buildPublicConfig(undefined)).toEqual({});
    expect(buildPublicConfig([])).toEqual({});
    expect(buildPublicConfig([{ key: "whatsapp_number" }])).toEqual({ whatsapp_number: "" });
  });

  it("يحوّل القيم غير النصّية إلى نص", () => {
    const config = buildPublicConfig([{ key: "subscription_durations", value: [30, 90] }]);
    expect(typeof config.subscription_durations).toBe("string");
  });
});

describe("buildPublicPlans", () => {
  it("يبني قائمة الأسعار المعلنة", () => {
    const plans = buildPublicPlans([
      { plan_key: "pro", display_name_ar: "احترافي", price: "199", currency: "EGP" },
      { plan_key: "ultra", display_name_ar: null, price: 399, currency: "EGP" },
    ]);
    expect(plans).toHaveLength(2);
    expect(plans[0]).toEqual({
      plan_key: "pro",
      display_name_ar: "احترافي",
      price: "199",
      currency: "EGP",
    });
  });

  it("يتجاهل الصفوف بلا plan_key ويعيد مصفوفة فارغة للفراغ", () => {
    expect(buildPublicPlans([{ price: 1 }])).toEqual([]);
    expect(buildPublicPlans(null)).toEqual([]);
  });
});

describe("GET /api/config/public", () => {
  it("يعيد الإعدادات العامة + الباقات + ترويسة كاش", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "site_settings"
        ? chain({ data: [{ key: "whatsapp_number", value: "+201234567890" }], error: null })
        : chain({ data: [{ plan_key: "pro", display_name_ar: "Pro", price: "199", currency: "EGP" }], error: null })
    );

    const { GET } = await import("@/app/api/config/public/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.whatsapp_number).toBe("+201234567890");
    expect(body.plans).toHaveLength(1);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=300");
  });

  it("يعيد 500 عند فشل قراءة site_settings", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "site_settings"
        ? chain({ data: null, error: { message: "boom" } })
        : chain({ data: [], error: null })
    );

    const { GET } = await import("@/app/api/config/public/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("config_unavailable");
  });

  it("لا يُسقط الـ endpoint لو فشلت قراءة الباقات", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "site_settings"
        ? chain({ data: [{ key: "default_currency", value: "EGP" }], error: null })
        : chain({ data: null, error: { message: "plans down" } })
    );

    const { GET } = await import("@/app/api/config/public/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.default_currency).toBe("EGP");
    expect(body.plans).toEqual([]);
  });
});
