/**
 * 🔒 اختبار حارس الكروت على /api/lectures/[id]/process
 *
 * ═══ ليه الاختبار على الراوت نفسه ═══
 * المطلوب إثباته مش إن الحارس موجود، ده إن **الرفض بيحصل قبل أي نداء
 * للموديل وقبل أي كتابة**. الاختبار بيرتّب النداءات فعلياً وبيقرا
 * الترتيب من السجل — فلو حد نقل `guardAiAccessAndReserve` تحت
 * `analyzeLecture`، الاختبار ده بيقع. مراجعة الكود بالعين ممكن تفوّت
 * ده، مراجعة الكود بالعين ممكن تفوّته، لكن التنفيذ مايفوّتش.
 *
 * ⚠️ **كل الاعتماديات بتاعت Supabase والراوتر بتعمل بـ mock**. مافيش
 * نداء شبكي ولا مزوّد حقيقي في أي اختبار هنا.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/* ═════════════════ سجل النداءات — الترتيب هو موضوع الاختبار ══════════ */

/** كل خطوة بتتسجّل هنا عشان نتحقق من الترتيب بعد التنفيذ. */
const callLog: string[] = [];

const guardMock = vi.fn();
const refundMock = vi.fn();
const analyzeMock = vi.fn();

/** يرد بحارس رافض (429) — بالشكل اللي الحارس الحقيقي بيرجّعه. */
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

/** حالة الـ mock — بنتحكم فيها من الاختبار. */
type SbState = {
  /** المحاضرة اللي بترجع للاستعلام. */
  lecture: { id: string; transcript_text: string } | null;
  /** لو true، الاستعلام بيرمي خطأ. */
  readFails: boolean;
};

type SupabaseMock = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } } }> };
  from: () => {
    select: () => unknown;
    eq: () => unknown;
    maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  };
  __state: SbState;
};

/** عميل Supabase مزيّف — بيتصرّف كأنه رجّع جلسة + محاضرة. */
function makeSupabase(): SupabaseMock {
  const state: SbState = {
    lecture: { id: "lec-1", transcript_text: "نص المحاضرة الطويل" },
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

vi.mock("@/lib/ai/lecture-analysis", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/lecture-analysis")>(
    "@/lib/ai/lecture-analysis",
  );
  return {
    ...actual,
    analyzeLecture: (...args: unknown[]) => {
      callLog.push("ai:analyze");
      return analyzeMock(...args);
    },
  };
});

import { POST } from "@/app/api/lectures/[id]/process/route";

/** ينفّذ الراوت بنفس الشكل المطلوب. */
function callProcess(type: unknown, id = "lec-1") {
  return POST(
    new Request("http://localhost/api/lectures/lec-1/process", {
      method: "POST",
      body: JSON.stringify({ type }),
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
  analyzeMock.mockImplementation(async () => {
    callLog.push("ai:result");
    return { summary: "ملخص", explanation: "شرح", aiCalls: 2 };
  });
});

/* ═══════════════════════ المسار الناجح ═══════════════════════ */

describe("معالجة المحاضرة — المستخدم المسجّل", () => {
  it("المعالجة العادية لسه شغالة وبترجّع النتيجة", async () => {
    const response = await callProcess("summary");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.lectureId).toBe("lec-1");
    expect(body.summary).toBe("ملخص");
  });

  it("الحارس بيتنادى **قبل** التوليد", async () => {
    // ⚠️ الترتيب هو جوهر الحماية. لو الحارس اتنادى بعد التوليد، الرفض
    // بيحصل بعد ما الكروت اتصرفت.
    await callProcess("summary");

    const guardIndex = callLog.indexOf("guard:allow");
    const aiIndex = callLog.indexOf("ai:analyze");

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(aiIndex).toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(aiIndex);
  });

  it("الحارس بيتنادى بمعرّف المستخدم من الجلسة (مش من الـ body)", async () => {
    await callProcess("summary");

    expect(guardMock).toHaveBeenCalledTimes(1);
    // (supabase, userId, modelId) — والمستخدم لازم يكون من الجلسة.
    expect(guardMock.mock.calls[0][1]).toBe(USER_ID);
  });
});

/* ═══════════════════════ الرفض بالحراسة ═══════════════════════ */

describe("حارس الكروت — الرفض بيحصل قبل أي تكلفة", () => {
  for (const type of ["summary", "explanation", "all"] as const) {
    it(`type="${type}" — الرفض بيمنع نداء الموديل`, async () => {
      guardRejects(429);

      const response = await callProcess(type);

      expect(response.status).toBe(429);
      // ⚠️ الأهم: الموديل ما اتناداش خالص.
      expect(analyzeMock).not.toHaveBeenCalled();
      expect(callLog).not.toContain("ai:analyze");
    });

    it(`type="${type}" — الرفض بيرجّع شكل المشروع الأصلي`, async () => {
      guardRejects(429);

      const response = await callProcess(type);
      const body = await response.json();

      // نفس بنية `buildRateLimitBody` المستخدمة في باقي المشروع:
      // { ok:false, error, code } — مش نظام تاني.
      expect(body.ok).toBe(false);
      expect(body.code).toBe("RATE_LIMIT");
      expect(typeof body.error).toBe("string");
      // وبيحمل ترويسة Retry-After زي باقي الراوتات.
      expect(response.headers.get("Retry-After")).toBe("3600");
    });
  }

  it("❌ الرفض بيمنع أي كتابة في المحاضرة", async () => {
    guardRejects(429);

    await callProcess("all");

    // `analyzeLecture` هي اللي بتعمل الـ update. لو ماتبعتش، مافيش
    // أي كتابة. أي كتابة كانت هتبان كـ "ai:analyze" في السجل.
    expect(callLog).not.toContain("ai:analyze");
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it("❌ الرفض بيحصل قبل قراءة محاضرة حد تاني (مش هونCk الـ id)", async () => {
    // لو الـ guard اتنادى **قبل** التحقق من الملكية، كان هنقدر نكشف
    // لحد إن في rate limit عنده من غير ما يملك المحاضرة. الترتيب
    // الصح: مصادقة ← ملكية ← حارس.
    guardRejects(429);
    (globalThis as unknown as { __sb: SupabaseMock }).__sb.__state.lecture = null;

    const response = await callProcess("summary");

    // 404 (مفيش محاضرة) هي اللي رجعت، مش 429 — يعني الملكية اتفحصت
    // قبل الحارس.
    expect(response.status).toBe(404);
    expect(guardMock).not.toHaveBeenCalled();
  });

  it("رفض 402 (كروت غير كافية) بيرجّع 402 زي باقي المشروع", async () => {
    guardRejects(402);

    const response = await callProcess("summary");

    expect(response.status).toBe(402);
    expect(analyzeMock).not.toHaveBeenCalled();
  });
});

/* ═══════════════════════ الاسترداد ═══════════════════════ */

describe("استرداد الكرت عند الفشل", () => {
  it("فشل التوليد بيرجّع الكرت للطالب", async () => {
    analyzeMock.mockImplementation(async () => {
      callLog.push("ai:result");
      throw new Error("model exploded");
    });

    const response = await callProcess("summary");

    expect(response.status).toBeGreaterThanOrEqual(500);
    // الطالب مايتحمّلش كرت نتيجة خطأ مش من فعله.
    expect(refundMock).toHaveBeenCalledTimes(1);
  });

  it("النجاح بيرجّعCredit وبيستردش", async () => {
    await callProcess("summary");

    expect(refundMock).not.toHaveBeenCalled();
  });

  it("الرفض بالحارس بيستردش (مافيش credit محجوز أصلاً)", async () => {
    guardRejects(429);

    await callProcess("summary");

    expect(refundMock).not.toHaveBeenCalled();
  });
});

/* ═══════════════════════ الحمايات القائمة ═══════════════════════ */

describe("الحمايات القائمة لسه شغالة", () => {
  it("type غريب بيرجّع 400 قبل أي حاجة تانية", async () => {
    const response = await callProcess("flashcards-maybe");

    expect(response.status).toBe(400);
    expect(guardMock).not.toHaveBeenCalled();
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it("محاضرة مش موجودة بيرجّع 404", async () => {
    (globalThis as unknown as { __sb: SupabaseMock }).__sb.__state.lecture = null;

    const response = await callProcess("summary");

    expect(response.status).toBe(404);
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it("تفريغ فاضي بيرجّع 422 قبل الحارس", async () => {
    // التفريغ الفاضي مش مشكلة كروت — الرفض هنا أرخص للطرفين.
    (globalThis as unknown as { __sb: SupabaseMock }).__sb.__state.lecture = {
      id: "lec-1",
      transcript_text: "   ",
    };

    const response = await callProcess("summary");

    expect(response.status).toBe(422);
    expect(guardMock).not.toHaveBeenCalled();
  });

  it("الاستعلام يفشل بيرجّع 500", async () => {
    (globalThis as unknown as { __sb: SupabaseMock }).__sb.__state.readFails = true;

    const response = await callProcess("summary");

    expect(response.status).toBe(500);
    expect(analyzeMock).not.toHaveBeenCalled();
  });
});
