/**
 * 🔒 اختبار راوت توليد العرض التقديمي — Phase 5
 *
 * ═══ ليه الاختبار على الراوت نفسه ═══
 * المطلوب إثباته مش إن الـ endpoint موجود، ده إن **الرفض بيحصل قبل
 * أي نداء للموديل وقبل أي كتابة**، وإن **الكريديت بيتحسب مرة واحدة
 * لكل المستند** (مش لكل جزء).
 *
 * ⚠️ كل الاعتماديات بتعمل بـ mock — مافيش نداء شبكي.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const callLog: string[] = [];

const guardMock = vi.fn();
const refundMock = vi.fn();
const quotaMock = vi.fn();
const generateMock = vi.fn();

type SbState = {
  document: Record<string, unknown> | null;
  pages: Array<{ source_page: string; content: string }>;
};

let sbState: SbState;

function makeSupabase() {
  // ⚠️ الـ builder لازم يكون **thenable** — لأن الـ route بيعمل
  //    `await supabase.from(...).update(...).eq(...).eq(...)` والسلسلة
  //    بتخلص على `.eq()` (مش على `.update()`).
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    maybeSingle: async () => {
      callLog.push("db:document");
      return { data: sbState.document, error: null };
    },
    // ⚠️ `update` لازم **يرجّع الـ builder** (مش promise) — لأن الـ route
    //    بيعمل `.update(...).eq(...).eq(...)` وبعدين `await`.
    update: (values: Record<string, unknown>) => {
      callLog.push("db:save");
      sbState.document = { ...(sbState.document ?? {}), ...values };
      return builder;
    },
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
  };

  const knowledgeBase = {
    select: () => ({
      eq: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              order: async () => ({ data: sbState.pages, error: null }),
            }),
          }),
        }),
      }),
    }),
  };

  return {
    from: (table: string) => (table === "knowledge_base" ? knowledgeBase : builder),
    rpc: async () => ({ data: null, error: null }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => (globalThis as unknown as { __sb: unknown }).__sb,
}));

vi.mock("@/lib/api-guard", () => ({
  requireUser: async () => ({
    user: { id: "user-1" },
    supabase: (globalThis as unknown as { __sb: unknown }).__sb,
    response: null,
  }),
  checkRateLimit: async () => null,
}));

vi.mock("@/lib/ai/ai-credit-guard", () => ({
  guardAiAccessAndReserve: (...args: unknown[]) => guardMock(...args),
  refundAiCreditIfNeeded: (...args: unknown[]) => refundMock(...args),
}));

vi.mock("@/lib/ai/service-registry", () => ({
  consumeServiceQuota: (...args: unknown[]) => quotaMock(...args),
  refundServiceQuota: () => undefined,
}));

vi.mock("@/lib/ai/slides", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/slides")>(
    "@/lib/ai/slides",
  );
  return {
    ...actual,
    generateDeckPart: (...args: unknown[]) => {
      callLog.push("ai:generate");
      return generateMock(...args);
    },
  };
});

import { POST } from "@/app/api/documents/[id]/slides/route";

const USER = "user-1";

function callRoute(body: unknown = {}, id = "doc-1") {
  return POST(
    new Request(`http://localhost/api/documents/${id}/slides`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  callLog.length = 0;
  sbState = {
    document: {
      id: "doc-1",
      title: "محاضرة 3",
      file_type: "pdf",
      page_count: 3,
      status: "ready",
      unread_pages: [],
      deck: null,
    },
    pages: [
      // ⚠️ الصفحات طويلة عمداً ⇒ التقسيم بالحروف يعمل **أكثر من جزء**
      //    (4500 حرف للجزء) ⇒ نقدر نختبر parts مختلفة.
      {
        source_page: "1",
        content: `${"التيار الكهربي المتغير هو المؤثر في الإزاحة. ".repeat(60)}`,
      },
      {
        source_page: "2",
        content: `${"التغاير في المجال بيولد تيار كهربائي. ".repeat(60)}`,
      },
    ],
  };
  (globalThis as unknown as { __sb: unknown }).__sb = makeSupabase();

  guardMock.mockImplementation(async () => {
    callLog.push("guard:allow");
    return { ok: true, refId: "document_slides:user-1:doc-1" };
  });
  quotaMock.mockImplementation(async () => {
    callLog.push("quota");
    return { allowed: true, remaining: 9, tier: "pro", reasonAr: "" };
  });
  generateMock.mockImplementation(async () => {
    callLog.push("ai:result");
    return {
      slides: [
        {
          heading: "عنوان",
          bullets: [{ text: "نقطة", page: 1, quote: "اقتباس" }],
        },
      ],
      model: "openai/gpt-oss-120b",
      aiCalls: 1,
    };
  });
});

/* ═══════════════════════════ المسار الناجح ═══════════════════════════ */

describe("العرض التقديمي — المسار الناجح", () => {
  it("✅ بيرجّع الـ deck JSON", async () => {
    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.slides).toHaveLength(1);
    expect(body.total_parts).toBeGreaterThan(0);
  });

  it("✅ الحارس بيتنادى **قبل** التوليد", async () => {
    await callRoute();

    const guardIndex = callLog.indexOf("guard:allow");
    const aiIndex = callLog.indexOf("ai:generate");

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(aiIndex).toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(aiIndex);
  });

  it("💳 كريدت واحد لكل المستند — نفس المرجع عبر الأجزاء", async () => {
    await callRoute({ partIndex: 0 });
    await callRoute({ partIndex: 1 });

    expect(guardMock).toHaveBeenCalledTimes(2);
    const refIds = guardMock.mock.calls.map(
      (c) => (c[3] as { refId?: string })?.refId,
    );
    // ⚠️ نفس المرجع ⇒ `reserve_ai_credit` بيرجّع `already_existed` ⇒
    //    الأجزاء التانية **مش بتخصم تاني**.
    expect(refIds[0]).toBe(refIds[1]);
    expect(refIds[0]).toContain("document_slides");
    expect(refIds[0]).toContain(USER);
    expect(refIds[0]).toContain("doc-1");
  });

  it("✅ الحفظ بيحصل بعد التوليد", async () => {
    await callRoute();
    expect(callLog.indexOf("ai:generate")).toBeLessThan(
      callLog.indexOf("db:save"),
    );
  });
});

/* ═══════════════════════════ الرفض ═══════════════════════════ */

describe("العرض التقديمي — الرفض بيحصل قبل أي تكلفة", () => {
  it("⛔ مستند مش موجود ⇒ 404 (من غير نداء موديل)", async () => {
    sbState.document = null;

    const response = await callRoute();

    expect(response.status).toBe(404);
    expect(callLog).not.toContain("ai:generate");
    expect(guardMock).not.toHaveBeenCalled();
  });

  it("⛔ مستند من غير صفحات ⇒ 422 (من غير نداء موديل)", async () => {
    sbState.pages = [];

    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("NO_PAGES");
    expect(callLog).not.toContain("ai:generate");
    expect(guardMock).not.toHaveBeenCalled();
  });

  it("⛔ جزء برّه المدى ⇒ 400 (من غير نداء موديل)", async () => {
    const response = await callRoute({ partIndex: 99 });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("BAD_PART_INDEX");
    expect(callLog).not.toContain("ai:generate");
  });

  it("⛔ الحارس رافض ⇒ مفيش نداء موديل", async () => {
    guardMock.mockImplementation(async () => ({
      ok: false,
      response: new Response(
        JSON.stringify({ ok: false, error: "مفيش رصيد" }),
        { status: 402 },
      ),
    }));

    const response = await callRoute();

    expect(response.status).toBe(402);
    expect(callLog).not.toContain("ai:generate");
  });

  it("⛔ حدّ الباقة (free) ⇒ 402 قبل أي نداء", async () => {
    quotaMock.mockImplementation(async () => ({
      allowed: false,
      remaining: 0,
      tier: "free",
      reasonAr: "الميزة دي للمشتركين.",
      resetAtUtc: null,
    }));

    const response = await callRoute();

    expect(response.status).toBe(402);
    expect(callLog).not.toContain("ai:generate");
  });

  it("⚠️ فشل التوليد بيرجّع الـ credit", async () => {
    generateMock.mockImplementation(async () => {
      throw new Error("الموديل وقع");
    });

    const response = await callRoute();

    expect(response.status).toBe(502);
    expect(refundMock).toHaveBeenCalledTimes(1);
  });
});
