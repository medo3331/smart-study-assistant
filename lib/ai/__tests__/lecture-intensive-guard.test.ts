/**
 * 🔒 اختبار حارس الكروت + حراسة التوقيتات على /api/lectures/[id]/intensive
 *
 * ═══ ليه الاختبار على الراوت نفسه ═══
 * المطلوب إثباته مش إن الحارس موجود، ده إن **الرفض بيحصل قبل أي نداء
 * للموديل وقبل أي كتابة**. الاختبار بيرتّب النداءات فعلياً وبيقرا
 * الترتيب من السجل — فلو حد نقل `guardAiAccessAndReserve` تحت
 * التوليد، الاختبار ده بيقع.
 *
 * ⚠️ **الاختبار التاني أهم**: من غير توقيتات مفيش Citations — فالراوت
 * لازم يرفض (422) **قبل** الحارس وقبل أي نداء. لو راح للموديل الأول،
 * الطالب هيحرق credit على حاجة مش هترجّع sources.
 *
 * ⚠️ **كل الاعتماديات بتعمل بـ mock**. مافيش نداء شبكي ولا مزوّد حقيقي.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/* ═════════════════ سجل النداءات — الترتيب هو موضوع الاختبار ══════════ */

const callLog: string[] = [];

const guardMock = vi.fn();
const refundMock = vi.fn();
const generateMock = vi.fn();
const saveMock = vi.fn();

function guardRejects(status = 429): void {
  guardMock.mockImplementation(async () => ({
    ok: false,
    response: new Response(
      JSON.stringify({ ok: false, error: "وصلت للحد المجاني.", code: "RATE_LIMIT" }),
      { status, headers: { "Content-Type": "application/json", "Retry-After": "3600" } },
    ),
  }));
}

function guardAllows(): void {
  guardMock.mockImplementation(async () => {
    callLog.push("guard:allow");
    return { ok: true, refId: "ref-test-1" };
  });
}

const USER_ID = "user-1";

type SbState = {
  lecture: {
    id: string;
    transcript_text: string | null;
    transcript_data: unknown;
    duration_seconds: number | null;
  } | null;
  readFails: boolean;
};

type SupabaseMock = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
  from: () => {
    select: () => unknown;
    eq: () => unknown;
    maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
    update: () => unknown;
  };
  __state: SbState;
};

function makeSupabase(): SupabaseMock {
  const state: SbState = {
    lecture: {
      id: "lec-1",
      transcript_text: "نص المحاضرة الطويل",
      transcript_data: {
        segments: [
          { text: "المقطع الأول", start: 0, end: 5, speaker: null },
          { text: "المقطع التاني", start: 5, end: 9, speaker: null },
        ],
      },
      duration_seconds: 60,
    },
    readFails: false,
  };

  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => {
      callLog.push("db:read");
      if (state.readFails) {
        return { data: null, error: { code: "XX", message: "boom" } };
      }
      return { data: state.lecture, error: null };
    },
    update: () => builder,
  };

  return {
    auth: {
      getUser: async () => {
        callLog.push("auth");
        return { data: { user: { id: USER_ID } } };
      },
    },
    from: () => builder,
    __state: state,
  };
}

/* ══════════════════ الاستيراد بعد تثبيت الـ mocks ══════════════════ */

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => (globalThis as unknown as { __sb: SupabaseMock }).__sb,
}));

vi.mock("@/lib/ai/ai-credit-guard", () => ({
  guardAiAccessAndReserve: (...args: unknown[]) => guardMock(...args),
  refundAiCreditIfNeeded: (...args: unknown[]) => refundMock(...args),
}));

vi.mock("@/lib/ai/lecture-intensive", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/lecture-intensive")>(
    "@/lib/ai/lecture-intensive",
  );
  return {
    ...actual,
    generateIntensiveExplanation: (...args: unknown[]) => {
      callLog.push("ai:generate");
      return generateMock(...args);
    },
    saveIntensiveExplanation: (...args: unknown[]) => {
      callLog.push("db:save");
      return saveMock(...args);
    },
  };
});

import { POST } from "@/app/api/lectures/[id]/intensive/route";

function callIntensive(id = "lec-1") {
  return POST(
    new Request("http://localhost/api/lectures/lec-1/intensive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  callLog.length = 0;
  vi.clearAllMocks();
  (globalThis as unknown as { __sb: SupabaseMock }).__sb = makeSupabase();
  guardAllows();
  generateMock.mockImplementation(async () => {
    callLog.push("ai:result");
    return {
      explanation: {
        version: 1,
        generated_at: "2026-01-01T00:00:00.000Z",
        model: "openai/gpt-oss-120b",
        chunks: { ok: 1, failed: 0 },
        sections: [],
      },
      aiCalls: 1,
    };
  });
  saveMock.mockImplementation(async () => {
    callLog.push("db:save:ok");
  });
});

/* ═══════════════════════ المسار الناجح ═══════════════════════ */

describe("الشرح المكثف — المستخدم المسجّل", () => {
  it("بيرجّع النتيجة بنجاح", async () => {
    const response = await callIntensive();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.lectureId).toBe("lec-1");
    expect(body.intensive.chunks).toEqual({ ok: 1, failed: 0 });
  });

  it("الحارس بيتنادى **قبل** التوليد", async () => {
    await callIntensive();

    const guardIndex = callLog.indexOf("guard:allow");
    const aiIndex = callLog.indexOf("ai:generate");

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(aiIndex).toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(aiIndex);
  });

  it("الحفظ بيحصل بعد التوليد", async () => {
    await callIntensive();

    expect(callLog.indexOf("ai:generate")).toBeLessThan(callLog.indexOf("db:save"));
  });

  it("الحارس بيتنادى بمعرّف المستخدم من الجلسة (مش من الـ body)", async () => {
    await callIntensive();

    expect(guardMock).toHaveBeenCalledTimes(1);
    expect(guardMock.mock.calls[0][1]).toBe(USER_ID);
  });
});

/* ═══════════════════════ حراسة التوقيتات ═══════════════════════ */

describe("الشرح المكثف — من غير توقيتات مفيش مصادر", () => {
  it("⛔ محاضرة من غير segments ⇒ 422 — والحارس والموديل مااتنادوش", async () => {
    const sb = (globalThis as unknown as { __sb: SupabaseMock }).__sb;
    sb.__state.lecture = {
      id: "lec-1",
      transcript_text: "نص المحاضرة",
      transcript_data: { segments: [] },
      duration_seconds: 60,
    };

    const response = await callIntensive();
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("NO_TIMINGS");
    // ⚠️ الأهم: مفيش نداء موديل ومفيش حجز credit.
    expect(callLog).not.toContain("guard:allow");
    expect(callLog).not.toContain("ai:generate");
    expect(guardMock).not.toHaveBeenCalled();
  });

  it("⛔ transcript_data كله null ⇒ 422", async () => {
    const sb = (globalThis as unknown as { __sb: SupabaseMock }).__sb;
    sb.__state.lecture = {
      id: "lec-1",
      transcript_text: "نص المحاضرة",
      transcript_data: null,
      duration_seconds: 60,
    };

    const response = await callIntensive();
    expect(response.status).toBe(422);
    expect(guardMock).not.toHaveBeenCalled();
  });
});

/* ═══════════════════════ الرفض بالحراسة ═══════════════════════ */

describe("حارس الكروت — الرفض بيحصل قبل أي تكلفة", () => {
  it("الرفض بيمنع نداء الموديل", async () => {
    guardRejects(429);

    const response = await callIntensive();
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBeDefined();
    expect(callLog).not.toContain("ai:generate");
    expect(callLog).not.toContain("db:save");
  });

  it("⚠️ فشل التوليد بيرجّع الـ credit", async () => {
    generateMock.mockImplementation(async () => {
      throw new Error("الموديل وقع");
    });

    const response = await callIntensive();

    expect(response.status).toBe(502);
    expect(refundMock).toHaveBeenCalledTimes(1);
  });
});

/* ═══════════════════════ المصادقة ═══════════════════════ */

describe("المصادقة والملكية", () => {
  it("⛔ من غير جلسة ⇒ 401", async () => {
    const sb = (globalThis as unknown as { __sb: SupabaseMock }).__sb;
    sb.auth.getUser = async () => {
      callLog.push("auth");
      return { data: { user: null } };
    };

    const response = await callIntensive();

    expect(response.status).toBe(401);
    expect(callLog).not.toContain("ai:generate");
  });

  it("⛔ محاضرة مش موجودة ⇒ 404 (مش 403 — مانكشفش وجودها)", async () => {
    const sb = (globalThis as unknown as { __sb: SupabaseMock }).__sb;
    sb.__state.lecture = null;

    const response = await callIntensive();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("LECTURE_NOT_FOUND");
  });

  it("⛔ تفريغ فاضي ⇒ 422", async () => {
    const sb = (globalThis as unknown as { __sb: SupabaseMock }).__sb;
    sb.__state.lecture = {
      id: "lec-1",
      transcript_text: "   ",
      transcript_data: { segments: [{ text: "x", start: 0, end: 1 }] },
      duration_seconds: 60,
    };

    const response = await callIntensive();
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("NO_TRANSCRIPT");
    expect(guardMock).not.toHaveBeenCalled();
  });
});
