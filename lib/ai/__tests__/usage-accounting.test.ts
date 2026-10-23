/**
 * 🧾 اختبار مسجّل الاستهلاك (Shadow) — Phase 5-C2 / C2.1
 *
 * ⚠️ **أهم اختبارات الملف دي:** إن `recordAiUsage()` **مش بترمي أبدًا**.
 *    دي الخاصية اللي بتفرّق بين "نقيس" و"نمنع" — لو أي مسار رمي
 *    استثناء، القياس بقى بيحطّم الذكاء الاصطناعي، وده أسوأ من إنه
 *    ما يقيسش خالص.
 *
 * ⚠️ **C2.1:** الـ helper **مش بيولّد** أي هوية. `idempotencyKey` و
 *    `feature` إجباريان وييجوا من المستدعي، ولو غابوا الـ helper
 *    يرفض جوّه ويرجّع عادي (log بس).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── عميل Supabase مزيف ──
 * بيتسجّل كل نداء عليه عشان نتحقق: وش اتكتب، وبأي جدول، وهل اتسمّى
 * أي حاجة غلط. */
const fromMock = vi.fn();
const upsertMock = vi.fn();
const rpcMock = vi.fn();
const fromResult = { data: null, error: null as { code?: string; message?: string } | null };

fromMock.mockReturnValue({ upsert: upsertMock });
upsertMock.mockResolvedValue(fromResult);

let serviceConfigured = true;
let serviceClientThrows = false;

vi.mock("@/lib/supabase/admin", () => ({
  isServiceKeyConfigured: () => serviceConfigured,
  createServiceClient: () => {
    if (serviceClientThrows) throw new Error("no service key configured");
    return { from: fromMock, rpc: rpcMock };
  },
}));

import {
  recordAiUsage,
  sanitizeMetadata,
  __resetUsageClientForTests,
} from "../usage-accounting";

/** الصف اللي اتكتب في آخر نداء upsert. */
function lastRow(): Record<string, unknown> {
  return (upsertMock.mock.calls.at(-1)?.[0] ?? {}) as Record<string, unknown>;
}

/** خيارات الـ upsert في آخر نداء. */
function lastOptions(): Record<string, unknown> {
  return (upsertMock.mock.calls.at(-1)?.[1] ?? {}) as Record<string, unknown>;
}

/** مدخل صالح جاهز — كل الاختبارات بتبدأ منه وبتغيّر حقل واحد بس. */
const VALID = { userId: "u1", feature: "chat", idempotencyKey: "key-1" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  serviceConfigured = true;
  serviceClientThrows = false;
  fromResult.error = null;
  fromMock.mockReturnValue({ upsert: upsertMock });
  upsertMock.mockResolvedValue(fromResult);
  __resetUsageClientForTests();
});

/* ═══════════════════════ التسجيل الأساسي ═══════════════════════ */

describe("recordAiUsage — التسجيل", () => {
  it("يكتب سطر في ai_usage_events بنجاح", async () => {
    await recordAiUsage({ ...VALID });

    expect(fromMock).toHaveBeenCalledWith("ai_usage_events");
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const row = lastRow();
    expect(row.user_id).toBe("u1");
    expect(row.feature).toBe("chat");
    expect(row.idempotency_key).toBe("key-1");
    expect(row.created_at).toEqual(expect.any(String));
  });

  it("محاولة عادية = units 1", async () => {
    await recordAiUsage({ ...VALID });
    expect(lastRow().units).toBe(1);
  });

  it("الـ demo = units 0 (مافيش billing في المرحلة دي)", async () => {
    await recordAiUsage({ userId: null, feature: "demo", idempotencyKey: "demo-1", units: 0 });
    expect(lastRow().units).toBe(0);
    expect(lastRow().user_id).toBeNull();
  });

  it("زائر بدون user_id → null (مش بنجمع IP ولا cookie)", async () => {
    await recordAiUsage({ userId: null, feature: "demo", idempotencyKey: "demo-2", units: 0 });

    const row = lastRow();
    expect(row.user_id).toBeNull();
    // ❌ مافيش أي معرّف تريبي — ده مقصود ومتعمد.
    expect(Object.keys(row)).not.toContain("ip");
    expect(Object.keys(row)).not.toContain("session_id");
  });

  it("يحفظ كل الحقول المهمة", async () => {
    await recordAiUsage({
      userId: "u1",
      feature: "lecture_mcq",
      idempotencyKey: "key-123",
      operationId: "op-abc",
      attemptNo: 1,
      provider: "nvidia",
      model: "nemotron",
      status: "failed_no_response",
      promptTokens: 120,
      completionTokens: 45,
      latencyMs: 850,
    });

    expect(lastRow()).toMatchObject({
      user_id: "u1",
      feature: "lecture_mcq",
      idempotency_key: "key-123",
      operation_id: "op-abc",
      attempt_no: 1,
      provider: "nvidia",
      model: "nemotron",
      status: "failed_no_response",
      prompt_tokens: 120,
      completion_tokens: 45,
      latency_ms: 850,
    });
  });

  it("fallback: نفس operation_id مع attempt_no مختلف", async () => {
    // ⚠️ ده جوهر الـ accounting: طلب واحد = سطرين مش سطر.
    await recordAiUsage({
      userId: "u1", feature: "chat",
      idempotencyKey: "key-A", operationId: "op-A", attemptNo: 0,
      provider: "groq", status: "failed_no_response", units: 1,
    });
    await recordAiUsage({
      userId: "u1", feature: "chat",
      idempotencyKey: "key-A", operationId: "op-A", attemptNo: 1,
      provider: "nvidia", status: "completed", units: 1,
    });

    const rows = upsertMock.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(rows).toHaveLength(2);
    // ⬇️ نفس الـ key ونفس الـ operation_id عبر المحاولتين.
    expect(rows[0].idempotency_key).toBe("key-A");
    expect(rows[1].idempotency_key).toBe("key-A");
    expect(rows[0].operation_id).toBe("op-A");
    expect(rows[1].operation_id).toBe("op-A");
    // ⬇️ attempt_no هو اللي بيفرّق — مافيش دمج.
    expect(rows[0].attempt_no).toBe(0);
    expect(rows[1].attempt_no).toBe(1);
    expect(rows[0].provider).not.toBe(rows[1].provider);
  });

  it("status الافتراضي completed", async () => {
    await recordAiUsage({ ...VALID });
    expect(lastRow().status).toBe("completed");
  });

  it("⛓️ نفس المفتاح بيتخزّن بحرفه (مفيش أي تعديل)", async () => {
    // ⚠️ مافيش prefix ولا suffix ولا hash — اللي بعتوه هو اللي بيتخزّن،
    //    عشان نقدر نربط السطر بـ request الأصلية.
    await recordAiUsage({ ...VALID, idempotencyKey: "abc-123" });
    expect(lastRow().idempotency_key).toBe("abc-123");
  });

  it("⛓️ مفتاح طويل بيتقصّ عند 200 (حماية حجم)", async () => {
    await recordAiUsage({ ...VALID, idempotencyKey: "x".repeat(500) });
    expect((lastRow().idempotency_key as string).length).toBe(200);
  });
});

/* ═══════════════════════ ★ عقد الـ idempotency (C2.1) ═══════════════════════ */

describe("recordAiUsage — الـ helper مش بيولّد هوية", () => {
  it("⛔ idempotencyKey ناقص → رفض داخلي، مافيش كتابة", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // ⛔-cast لازمنا: دي بالظبط الحالة اللي الـ type بيمنعها.
    const input = { userId: "u1", feature: "chat" } as unknown as Parameters<typeof recordAiUsage>[0];

    await expect(recordAiUsage(input)).resolves.toBeUndefined();
    expect(upsertMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("⛔ idempotencyKey فاضي → رفض داخلي، مافيش كتابة", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordAiUsage({ ...VALID, idempotencyKey: "" })).resolves.toBeUndefined();
    expect(upsertMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("⛔ idempotencyKey مسافات بس → رفض داخلي، مافيش كتابة", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordAiUsage({ ...VALID, idempotencyKey: "   " })).resolves.toBeUndefined();
    expect(upsertMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("⛔ idempotencyKey من نوع غلط → رفض داخلي، مافيش كتابة", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const input = { userId: "u1", feature: "chat", idempotencyKey: 123 } as unknown as Parameters<
      typeof recordAiUsage
    >[0];
    await expect(recordAiUsage(input)).resolves.toBeUndefined();
    expect(upsertMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("⛔ feature ناقصة → رفض داخلي، مافيش كتابة", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const input = { userId: "u1", idempotencyKey: "key-1" } as unknown as Parameters<
      typeof recordAiUsage
    >[0];
    await expect(recordAiUsage(input)).resolves.toBeUndefined();
    expect(upsertMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("⛔ feature فاضية → رفض داخلي، مافيش كتابة", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordAiUsage({ ...VALID, feature: "" })).resolves.toBeUndefined();
    expect(upsertMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("⛔ feature مسافات بس → رفض داخلي، مافيش كتابة", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordAiUsage({ ...VALID, feature: "   " })).resolves.toBeUndefined();
    expect(upsertMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("⛔ الـ rejection بيحصل **قبل** أي كتابة في الـ DB", async () => {
    // ⚠️ ترتيب مهم: لو الـ validation اتعمل بعد الـ insert، السطر المكسور
    //    كان هيوصل للقاعدة الأول وبعدين يتركب.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await recordAiUsage({ userId: "u1", feature: "", idempotencyKey: "k" });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("✅ مفتاح صالح + userId=null → بيتسجّل عادي", async () => {
    // ⬇️ مافيش ارتباط بـ user: الـ demo بيشتغل بمفتاح و null.
    await recordAiUsage({ userId: null, feature: "demo", idempotencyKey: "demo-key", units: 0 });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(lastRow()).toMatchObject({
      user_id: null,
      feature: "demo",
      idempotency_key: "demo-key",
      units: 0,
    });
  });
});

/* ═══════════ ★ الأهم: القياس ماينكسرش الطلب ═══════════ */

describe("recordAiUsage — best-effort (ماينكسرش الطلب)", () => {
  it("فشل الـ insert مايرميش استثناء", async () => {
    fromResult.error = { code: "XX000", message: "db down" };
    upsertMock.mockResolvedValue(fromResult);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // ⬇️ لازم يرجع عادي — ده هو العقد.
    await expect(recordAiUsage({ ...VALID })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("رمي استثناء من الـ upsert مبيروحش للكيلر", async () => {
    upsertMock.mockRejectedValue(new Error("network gone"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(recordAiUsage({ ...VALID })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("البيئة ناقصة (مافيش service key) → تخطّي صامت", async () => {
    serviceConfigured = false;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(recordAiUsage({ ...VALID })).resolves.toBeUndefined();
    // ⬇️ مافيش insert خالص — مافيش ضجيج في اللوج لما البيئة ناقصة أصلاً.
    expect(upsertMock).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("createServiceClient بيرمي → تخطّي بدون crash", async () => {
    serviceClientThrows = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(recordAiUsage({ ...VALID })).resolves.toBeUndefined();
    expect(upsertMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("⚠️ التحقق بيشتغل حتى لو مافيش service key", async () => {
    // ⬇️ programmer error لازم يبان في اللوج في بيئة محلية كمان، وإلا
    //    الـ bug هيتخفي لحد ما يوصل production.
    serviceConfigured = false;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const input = { userId: "u1", feature: "chat" } as unknown as Parameters<
      typeof recordAiUsage
    >[0];

    await expect(recordAiUsage(input)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("إدخال غريب entirely (null/undefined) مبيرميش", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordAiUsage(undefined as never)).resolves.toBeUndefined();
    await expect(recordAiUsage(null as never)).resolves.toBeUndefined();
    await expect(recordAiUsage({} as never)).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it("metadata فيها دايرة (circular) مبيرميش", async () => {
    const circular: Record<string, unknown> = { attempt: 0 };
    circular.self = circular;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      recordAiUsage({ ...VALID, metadata: circular }),
    ).resolves.toBeUndefined();
    warn.mockRestore();
  });
});

/* ═══════════════════════ الـ idempotency ═══════════════════════ */

describe("recordAiUsage — idempotency على مستوى القاعدة", () => {
  it("بيستخدم قيد التفرّد المعتمد", async () => {
    await recordAiUsage({ ...VALID });

    const options = lastOptions();
    expect(options.onConflict).toBe("user_id,idempotency_key,attempt_no");
    // ⬇️ التعارض = "اتسجّل قبل كده"، مش "فشل".
    expect(options.ignoreDuplicates).toBe(true);
  });

  it("⛔ القيد لازم يحتوي attempt_no", async () => {
    // القيد الناقص كان هيخلي المحاولة الثانية في fallback تفشل.
    await recordAiUsage({ ...VALID });
    expect(lastOptions().onConflict).toContain("attempt_no");
  });

  it("نفس الـ tuple مرتين → upsert (safe) مش insert", async () => {
    // مع ignoreDuplicates، التكرار = نجاح صامت ("اتسجّل قبل كده").
    await recordAiUsage({ userId: "u1", feature: "chat", idempotencyKey: "k1", attemptNo: 0 });
    await recordAiUsage({ userId: "u1", feature: "chat", idempotencyKey: "k1", attemptNo: 0 });

    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(lastOptions().ignoreDuplicates).toBe(true);
    expect(fromResult.error).toBeNull();
  });

  it("⛓️ نفس المفتاح + attempt_no مختلف → سطرين (fallback)", async () => {
    // ⚠️ ده اللي بيفرّق بين "إعادة إرسال" و"محاولة جديدة".
    await recordAiUsage({ ...VALID, attemptNo: 0 });
    await recordAiUsage({ ...VALID, attemptNo: 1 });
    expect(upsertMock).toHaveBeenCalledTimes(2);
  });
});

/* ═══════════ ★ ممنوع: credits / ledger / limits ═══════════ */

describe("recordAiUsage — ممنوع يلمس نظام الكروت", () => {
  it("⛔ مافيش أي نداء لـ reserve_ai_credit", async () => {
    await recordAiUsage({ ...VALID });

    // ⬇️ لو اتسمّى أي RPC، ده كان هيحجز كرت = تغيير سلوك financials.
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("⛔ مافيش كتابة على ai_credit_ledger", async () => {
    await recordAiUsage({ ...VALID });

    for (const call of fromMock.mock.calls) {
      expect(call[0]).not.toBe("ai_credit_ledger");
    }
  });

  it("⛔ مافيش كتابة على أي جدول غير ai_usage_events", async () => {
    await recordAiUsage({ ...VALID });
    for (const call of fromMock.mock.calls) {
      expect(call[0]).toBe("ai_usage_events");
    }
  });

  it("⛔ مافيش update/delete — insert فقط (upsert)", async () => {
    await recordAiUsage({ ...VALID });

    const table = fromMock.mock.results.at(-1)?.value as Record<string, unknown>;
    expect(Object.keys(table)).toEqual(["upsert"]);
    expect(table.update).toBeUndefined();
    expect(table.delete).toBeUndefined();
  });
});

/* ═══════════════════════ تنظيف الـ metadata ═══════════════════════ */

describe("sanitizeMetadata — تشخيص بس، مافيش أسرار", () => {
  it("يحذف البرومبت والنص والمفاتيح الحسّاسة", () => {
    const clean = sanitizeMetadata({
      status: 500,
      reasonCode: "EMPTY_RESPONSE",
      prompt: "نص المحاضرة السرية",
      transcript: "التفريغ كامل",
      apiKey: "sk-123",
      userEmail: "a@b.com",
    });

    expect(clean).toEqual({ status: 500, reasonCode: "EMPTY_RESPONSE" });
    // ⬇️ صريح: مافيش أي محتوى مستخدم أو سر اتسجّل.
    expect(JSON.stringify(clean)).not.toMatch(/sk-|@b\.com|نص المحاضرة/);
  });

  it("يبقي JSON-safe: NaN/Infinity يتحولوا null", () => {
    const clean = sanitizeMetadata({ a: NaN, b: Infinity, c: 1.5 });
    expect(clean).toEqual({ a: null, b: null, c: 1.5 });
    expect(() => JSON.stringify(clean)).not.toThrow();
  });

  it("يقصّ النصوص الطويلة", () => {
    const clean = sanitizeMetadata({ note: "ا".repeat(5000) });
    expect((clean.note as string).length).toBeLessThanOrEqual(300);
  });

  it("يوقف عند العمق الأقصى (منع التركيبات الدائرية/المتضخمة)", () => {
    // ⬇️ MAX_METADATA_DEPTH = 3: المستويات 1/2/3 بتتخزّن، اللي بعدها بتتقص.
    const deep: Record<string, unknown> = {
      a1: { a2: { a3: "KEEP_ME" } },           // على عمق 2 — يعدّي
      b1: { b2: { b3: { b4: "DEEP_VALUE" } } }, // على عمق 3 — يتقصّ
    };

    const clean = sanitizeMetadata(deep) as Record<string, Record<string, Record<string, unknown>>>;

    // ✅ اللي في حدود العمق بيتخزّن فعلاً (مش بيتكسر).
    expect(clean.a1.a2.a3).toBe("KEEP_ME");
    // ⛔ اللي تجاوز بحد أقصى — مايتخزّنش.
    expect(JSON.stringify(clean)).not.toContain("DEEP_VALUE");
  });

  it("⛔ الـ nesting بيتحافظ على شكله (مش بيتسطّح)", () => {
    // ⬇️ Regression: أول نسخة كانت بتكتب كل المستويات في كائن واحد،
    //   فكان { outer: { inner: 1 } } بيبقى { inner: 1 } — تلميح سهل يضيّع
    //   معلومات تشخيصية.
    const clean = sanitizeMetadata({ outer: { inner: 1 } });
    expect(clean).toEqual({ outer: { inner: 1 } });
  });

  it("مدخلات غريبة → كائن فاضي", () => {
    expect(sanitizeMetadata(undefined)).toEqual({});
    expect(sanitizeMetadata(null as never)).toEqual({});
    expect(sanitizeMetadata("string" as never)).toEqual({});
  });

  it("المetadata المنقّاة بتتخزّن في الصف", async () => {
    await recordAiUsage({
      ...VALID,
      metadata: { httpStatus: 429, prompt: "SECRET_PROMPT" },
    });

    const row = lastRow();
    expect(row.metadata).toEqual({ httpStatus: 429 });
    expect(JSON.stringify(row)).not.toContain("SECRET_PROMPT");
  });
});