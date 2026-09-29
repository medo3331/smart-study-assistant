/**
 * اختبارات اختيار مفتاح Supabase على السيرفر.
 *
 * ⚠️ **مفيش أي سر حقيقي هنا** — كل القيم وهمية بشكل صريح. البتّ
 * سبارة sb_secret_ ونص JWT وهمية شكلها صحيح وأسا نتحقق من الشكل والأولوية بس.
 * الاختبار الحقيقي الوحيد هو الاتصال بمشروع حقيقي.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

import { resolveSupabaseSecretKey } from "../admin";

afterEach(() => {
  vi.restoreAllMocks();
});

/** قيم وهمية — شكلها صح ومحتاش أي سر حقيقي.
 *  ⚠️ مكتوبة بحروف كبيرة مقصودة (`FAKEFAKEFAKE`) عشان أي secret scanner
 *  أو مراجع بشري يشوفها على طول إنها مش قيمة حقيقية. */
const FAKE_NEW_KEY = "sb_secret_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE";
const FAKE_LEGACY_JWT = "eyJFAKEHEADER.FAKEPAYLOAD.FAKESIGNATURE";

describe("resolveSupabaseSecretKey", () => {
  it("يقرأ SUPABASE_SECRET_KEY (الصيغة الجديدة)", () => {
    expect(resolveSupabaseSecretKey({ SUPABASE_SECRET_KEY: FAKE_NEW_KEY })).toBe(FAKE_NEW_KEY);
  });

  it("يرجع للقديم لو الجديد مش موجود", () => {
    expect(
      resolveSupabaseSecretKey({ SUPABASE_SERVICE_ROLE_KEY: FAKE_LEGACY_JWT }),
    ).toBe(FAKE_LEGACY_JWT);
  });

  it("المفتاح الجديد له الأولوية لما الاتنين موجودين", () => {
    // ده اللي بيمنع السلوك غير المتوقع لو حد حط الاتنين.
    expect(
      resolveSupabaseSecretKey({
        SUPABASE_SECRET_KEY: FAKE_NEW_KEY,
        SUPABASE_SERVICE_ROLE_KEY: FAKE_LEGACY_JWT,
      }),
    ).toBe(FAKE_NEW_KEY);
  });

  /* ⚠️ ده اختبار الـ regression بتاع "Invalid Compact JWS":
     سطر جديد فاصل جوّه قيمة Vercel كان بيخلي الـ SDK يشوف المفتاح كـ
     subtype مجهول فيطبع "Unrecognized Supabase API key format". */
  it("يشيل سطر جديد/مسافات جوّه القيمة", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      resolveSupabaseSecretKey({ SUPABASE_SECRET_KEY: `\n${FAKE_NEW_KEY}\n` }),
    ).toBe(FAKE_NEW_KEY);
    expect(resolveSupabaseSecretKey({ SUPABASE_SECRET_KEY: `  ${FAKE_NEW_KEY}  ` })).toBe(
      FAKE_NEW_KEY,
    );
  });

  /* ⚠️ regression: الحقل ده طلع ناصب قبل كه أسهل معاف:
   * (`lastCharIsWhitespace=/s$/.test(raw)}`) بدل boolean — يعني الـ
   * `${` ضاعت والـ log كان بيطلع كود مش نتيجة. الاختبار ده بيمنع
   * تكرار ده: كل حقل لازم يطلع `=true` أو `=false`. */
  it("كل حقول التشخيص بتطلع boolean مش نص حرفي", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveSupabaseSecretKey({ SUPABASE_SECRET_KEY: FAKE_NEW_KEY });
    const logs = warn.mock.calls.map((c) => c.join(" ")).join("\n");

    for (const field of [
      "startsWith_sb_secret",
      "startsWith_sb_publishable",
      "startsWith_sb_",
      "firstCharIsWhitespace",
      "lastCharIsWhitespace",
      "looksLikeLegacyJwt",
      "hadWhitespace",
    ]) {
      expect(logs).toMatch(new RegExp(`${field}=(true|false)\\b`));
    }
    // ومفيش أي expression مسريب في اللوج
    expect(logs).not.toContain(".test(raw)");
  });

  /* ⚠️ الـ assert ده **إلزامي**، مش زيادة: التشخيص المؤقت في `admin.ts`
   * بيطبع معلومات شكل المفتاح — لو أي جزء من القيمة تسرّب، الاختبار ده
   * هيسقط. فأي تعديل على التشخيص لازم يعدّي من هنا. */
  it("التشخيص ما بيطبعش أي جزء من المفتاح", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    resolveSupabaseSecretKey({
      SUPABASE_SECRET_KEY: `\n  ${FAKE_NEW_KEY}  \n`,
      SUPABASE_SERVICE_ROLE_KEY: FAKE_LEGACY_JWT,
    });

    const allLogs = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    // ممنوع القيم نفسها…
    expect(allLogs).not.toContain(FAKE_NEW_KEY);
    expect(allLogs).not.toContain(FAKE_LEGACY_JWT);
    // …وممنوع أي جزء منها (أول/وسط/آخر)
    expect(allLogs).not.toContain(FAKE_NEW_KEY.slice(0, 12));
    expect(allLogs).not.toContain(FAKE_NEW_KEY.slice(4, -4));
    expect(allLogs).not.toContain(FAKE_NEW_KEY.slice(-12));
    expect(allLogs).not.toContain(FAKE_LEGACY_JWT.slice(0, 10));

    // بس الأسماء والقيَم المنطقية هي اللي المفروض تطلع
    expect(allLogs).toContain("SUPABASE_SECRET_KEY");
    expect(allLogs).toContain("startsWith_sb_secret=true");
  });

  it("التشخيص بيقول أي متغيّر اتختار", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveSupabaseSecretKey({ SUPABASE_SECRET_KEY: FAKE_NEW_KEY });
    expect(warn.mock.calls.map((c) => c.join(" ")).join("\n")).toContain(
      "selected=SUPABASE_SECRET_KEY",
    );
  });

  it("التشخيص بيقول selected=NONE ويبلّغ غياب المتغيّرات", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveSupabaseSecretKey({})).toBeNull();
    const logs = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logs).toContain("selected=NONE");
    expect(logs).toContain("present SUPABASE_SECRET_KEY=false");
    expect(logs).toContain("present SUPABASE_SERVICE_ROLE_KEY=false");
  });

  it("التشخيص بيفرّق المفتاح القديم (JWT) من الجديد بالشكل", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveSupabaseSecretKey({ SUPABASE_SERVICE_ROLE_KEY: FAKE_LEGACY_JWT });
    const logs = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logs).toContain("startsWith_sb_secret=false");
    expect(logs).toContain("looksLikeLegacyJwt=true");
  });

  it("تحذير المسافات بيظهر بس للمفتاح اللي فيه مسافة فعلاً", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveSupabaseSecretKey({ SUPABASE_SECRET_KEY: FAKE_NEW_KEY });
    const clean = warn.mock.calls.some((c) => c.join(" ").includes("اتشال تلقائيًا"));
    expect(clean).toBe(false);

    warn.mockClear();
    resolveSupabaseSecretKey({ SUPABASE_SECRET_KEY: `\n${FAKE_NEW_KEY}` });
    const dirty = warn.mock.calls.some((c) => c.join(" ").includes("اتشال تلقائيًا"));
    expect(dirty).toBe(true);
  });

  it("يتجاهل القيم الفاضية والمسافات بس", () => {
    expect(resolveSupabaseSecretKey({})).toBeNull();
    expect(resolveSupabaseSecretKey({ SUPABASE_SECRET_KEY: "" })).toBeNull();
    expect(resolveSupabaseSecretKey({ SUPABASE_SECRET_KEY: "   " })).toBeNull();
    // الجديد فاضي → ينزل للقديم بدل ما يرجع null
    expect(
      resolveSupabaseSecretKey({
        SUPABASE_SECRET_KEY: "  ",
        SUPABASE_SERVICE_ROLE_KEY: FAKE_LEGACY_JWT,
      }),
    ).toBe(FAKE_LEGACY_JWT);
  });

  it("بيتجاهل القيم غير النصية بدل ما يكسر", () => {
    // حماية: process.env دايمًا string، بس الـ cast ممكن يمرّر كذا.
    expect(
      resolveSupabaseSecretKey({ SUPABASE_SECRET_KEY: undefined }),
    ).toBeNull();
  });

  it("النتيجة دايمًا نص غير فاضي — مش الـ env object", () => {
    const key = resolveSupabaseSecretKey({ SUPABASE_SECRET_KEY: FAKE_NEW_KEY });
    expect(typeof key).toBe("string");
    expect(key).toBeTruthy();
  });
});
