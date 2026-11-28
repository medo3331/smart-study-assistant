import { describe, it, expect, vi, beforeEach } from "vitest";

/* ==========================================================================
   اختبار route الشات الديني (/api/worship/quiz) عبر mocks كاملة:
   • ask — نداء AI فعلي بحجز كريديت وrefund عند الفشل.
   • quiz-start — سؤال من البنك بدون كريديت + جلسة db/120.
   • quiz-answer — تصحيح سيرفري + عدم تسريب الإجابة قبل التصحيح +
     إقفال الجلسة بعد العاشر + award_coins بعقد db/121 بالحرف.
   ========================================================================== */

vi.mock("@/lib/api-guard", () => ({
  requireUser: vi.fn(),
  checkRateLimit: vi.fn(async () => null),
  clampText: (value: unknown, max: number) =>
    typeof value === "string" ? value.slice(0, max) : "",
}));

vi.mock("@/lib/ai/ai-credit-guard", () => ({
  guardAiAccessAndReserve: vi.fn(),
  refundAiCreditIfNeeded: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/ai/direct-provider-usage", () => ({
  recordDirectProviderAttempt: vi.fn(),
  startProviderAttempt: vi.fn(() => () => 5),
}));

vi.mock("@/lib/ai/usage-context", () => ({
  resolveUsageRequestContext: vi.fn(() => ({ requestId: "req-1" })),
}));

const groqCreateMock = vi.fn();
vi.mock("groq-sdk", () => ({
  default: class Groq {
    chat = { completions: { create: groqCreateMock } };
  },
}));

// after() من next/server بتشتغل جوّه request scope فقط — بنستبدلها هنا.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

import { POST } from "@/app/api/worship/quiz/route";
import { requireUser } from "@/lib/api-guard";
import {
  guardAiAccessAndReserve,
  refundAiCreditIfNeeded,
} from "@/lib/ai/ai-credit-guard";
import { createServiceClient } from "@/lib/supabase/admin";

/* ── أدوات الـ mocks ── */

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

type DbResult = { data: unknown; error: { message: string } | null };

/** query-builder وهمي قابل للـ await والسلسلة الكاملة اللي الـ route بيستخدمها. */
function makeChain(result: () => DbResult) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.is = vi.fn(self);
  chain.order = vi.fn(self);
  chain.limit = vi.fn(self);
  chain.insert = vi.fn(self);
  chain.update = vi.fn(self);
  chain.single = vi.fn(() => Promise.resolve(result()));
  chain.maybeSingle = vi.fn(() => Promise.resolve(result()));
  chain.then = (
    onFulfilled: (v: DbResult) => unknown,
    onRejected: (e: unknown) => unknown,
  ) => Promise.resolve(result()).then(onFulfilled, onRejected);
  return chain as {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    then: unknown;
  };
}

const storedQuestion = (i: number) => ({
  question: `سؤال رقم ${i}`,
  options: ["أول", "تاني", "تالت", "رابع"],
  correct: 0,
  source: "صحيح البخاري، حديث ٨",
  explanation: `شرح السؤال ${i}`,
});

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/worship/quiz", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const jsonOf = async (res: Response) =>
  (await res.json()) as Record<string, unknown>;

/* ── mocks الحالة ── */

const requireUserMock = vi.mocked(requireUser);
const guardMock = vi.mocked(guardAiAccessAndReserve);
const refundMock = vi.mocked(refundAiCreditIfNeeded);
const createServiceClientMock = vi.mocked(createServiceClient);

let supabaseFrom: ReturnType<
  typeof vi.fn<(table: string) => ReturnType<typeof makeChain>>
>;
let serviceFrom: ReturnType<
  typeof vi.fn<(table: string) => ReturnType<typeof makeChain>>
>;
let rpcMock: ReturnType<
  typeof vi.fn<(name: string, args: Record<string, unknown>) => Promise<unknown>>
>;

/** سلاسل sessions المسجّلة — بترتيب الاستدعاء (تحميل ثم تحديث...). */
let sessionsChains: ReturnType<typeof makeChain>[];
function trackSessions() {
  sessionsChains = [];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GROQ_API_KEY = "test-key";

  requireUserMock.mockResolvedValue({
    user: { id: USER_ID } as never,
    supabase: {
      from: (table: string) => supabaseFrom(table),
      rpc: (name: string, args: Record<string, unknown>) => rpcMock(name, args),
    } as never,
    response: null,
  });
  guardMock.mockResolvedValue({ ok: true, refId: "ref-1" });
  rpcMock = vi.fn(async () => ({
    data: [{ awarded: 10, balance: 42 }],
    error: null,
  }));
  supabaseFrom = vi.fn(() => makeChain(() => ({ data: null, error: null })));
  serviceFrom = vi.fn(() => makeChain(() => ({ data: null, error: null })));
  createServiceClientMock.mockReturnValue({
    from: (table: string) => serviceFrom(table),
    rpc: rpcMock,
  } as never);
});

/* ==========================================================================
   ask — الشات الديني
   ========================================================================== */

describe("POST action=ask", () => {
  it("برد سليم: بيجاوب Groq ببرومبت النظام + السياق ويرجّع الرد", async () => {
    groqCreateMock.mockResolvedValue({
      choices: [{ message: { content: "أركان الإسلام خمسة." } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const res = await POST(
      makeRequest({
        action: "ask",
        messages: [
          { role: "user", content: "إيه أركان الإسلام؟" },
          { role: "assistant", content: "خمسة." },
          { role: "user", content: "اذكرهم." },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect((await jsonOf(res)).reply).toBe("أركان الإسلام خمسة.");

    // برومبت النظام + آخر سياق اتوصلوا للموديل
    const call = groqCreateMock.mock.calls[0][0] as {
      messages: { role: string; content: string }[];
    };
    expect(call.messages[0].role).toBe("system");
    expect(call.messages[0].content).toContain("ممنوع اختلاق مصدر");
    expect(call.messages[call.messages.length - 1].content).toBe("اذكرهم.");

    // الكريديت اتحجز ومفيش refund
    expect(guardMock).toHaveBeenCalledOnce();
    expect(refundMock).not.toHaveBeenCalled();
  });

  it("سياق غير صالح → 400 من غير حجز كريديت ولا نداء AI", async () => {
    const res = await POST(makeRequest({ action: "ask", messages: "بايظ" }));
    expect(res.status).toBe(400);
    expect(guardMock).not.toHaveBeenCalled();
    expect(groqCreateMock).not.toHaveBeenCalled();
  });

  it("فشل Groq → refund الكريديت و500", async () => {
    groqCreateMock.mockRejectedValue(new Error("provider down"));
    const res = await POST(
      makeRequest({
        action: "ask",
        messages: [{ role: "user", content: "سؤال" }],
      }),
    );
    expect(res.status).toBe(500);
    expect(refundMock).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      "ref-1",
    );
  });

  it("رد فاضي من الموديل → refund و502", async () => {
    groqCreateMock.mockResolvedValue({
      choices: [{ message: { content: "   " } }],
    });
    const res = await POST(
      makeRequest({
        action: "ask",
        messages: [{ role: "user", content: "سؤال" }],
      }),
    );
    expect(res.status).toBe(502);
    expect(refundMock).toHaveBeenCalledOnce();
  });
});

/* ==========================================================================
   quiz-start — فتح جولة «اختبرني» من البنك
   ========================================================================== */

describe("POST action=quiz-start", () => {
  it("بيرجّع سؤال من البنك من غير correct/explanation وبفتح جلسة", async () => {
    const q = storedQuestion(1);
    serviceFrom.mockImplementation(() =>
      makeChain(() => ({
        data: [{ id: "row-1", questions: [q], used_count: 0, last_used_at: null }],
        error: null,
      })),
    );
    let inserted: unknown = null;
    trackSessions();
    supabaseFrom.mockImplementation(() => {
      const chain = makeChain(() => ({ data: { id: SESSION_ID }, error: null }));
      (chain.insert as ReturnType<typeof vi.fn>).mockImplementation((payload: unknown) => {
        inserted = payload;
        return chain;
      });
      return chain;
    });

    const res = await POST(makeRequest({ action: "quiz-start" }));
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.sessionId).toBe(SESSION_ID);
    expect(body.total).toBe(10);
    expect(body.question).toEqual({
      question: q.question,
      options: q.options,
      source: q.source,
    });
    // مفيش تسريب للإجابة الصحيحة ولا الشرح
    expect(JSON.stringify(body)).not.toContain("correct");
    expect(JSON.stringify(body)).not.toContain("explanation");

    // الجلسة اتفتحت بسؤالها الأول (سيرفر فقط) — عقد db/120
    expect(inserted).toMatchObject({
      user_id: USER_ID,
      score: 0,
      total: 10,
      bank_id: "row-1",
    });
    expect((inserted as { questions: unknown[] }).questions).toHaveLength(1);

    // البنك = بدون حجز كريديت ولا نداء AI
    expect(guardMock).not.toHaveBeenCalled();
    expect(groqCreateMock).not.toHaveBeenCalled();
  });

  it("بنك فاضي → 503 من غير فتح جلسة", async () => {
    serviceFrom.mockImplementation(() =>
      makeChain(() => ({ data: [], error: null })),
    );
    const res = await POST(makeRequest({ action: "quiz-start" }));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await jsonOf(res))).toContain("بيتعبى");
  });
});

/* ==========================================================================
   quiz-answer — التصحيح السيرفري وإقفال الجولة والصرف
   ========================================================================== */

function sessionRow(questions: unknown[], answers: unknown[], score: number) {
  return {
    id: SESSION_ID,
    user_id: USER_ID,
    questions,
    answers,
    score,
    completed_at: null,
  };
}

describe("POST action=quiz-answer", () => {
  it("إجابة صحيحة نصية: تصحيح سيرفري + سؤال الدور اللي بعده من غير الإجابة", async () => {
    const current = storedQuestion(1);
    const nextQuestion = storedQuestion(2);
    // قراءة الجلسة من عميل المستخدم
    trackSessions();
    supabaseFrom.mockImplementation((table: string) => {
      if (table === "worship_quiz_sessions") {
        const chain = makeChain(() => ({
          data: sessionRow([current], [], 0),
          error: null,
        }));
        sessionsChains.push(chain);
        return chain;
      }
      return makeChain(() => ({ data: null, error: null }));
    });
    // سحب السؤال التالي من البنك
    serviceFrom.mockImplementation(() =>
      makeChain(() => ({
        data: [
          {
            id: "row-2",
            questions: [nextQuestion],
            used_count: 1,
            last_used_at: null,
          },
        ],
        error: null,
      })),
    );

    const res = await POST(
      makeRequest({
        action: "quiz-answer",
        sessionId: SESSION_ID,
        answer: "أول", // correct = 0
      }),
    );

    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.finished).toBe(false);
    expect(body.correct).toBe(true);
    expect(body.correctText).toBe("أول");
    expect(body.source).toBe(current.source);
    // السؤال التالي من غير correct ولا explanation
    expect(body.next).toEqual({
      question: nextQuestion.question,
      options: nextQuestion.options,
      source: nextQuestion.source,
    });
    expect(JSON.stringify(body.next)).not.toContain("explanation");

    // التحديث: إجابة رقمية + نتيجة ١ — من غير إقفال الجلسة
    const sessionsChain = sessionsChains[1]; // [0] التحميل، [1] التحديث
    const updateArg = (sessionsChain.update as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Record<string, unknown>;
    expect(updateArg.answers).toEqual([0]);
    expect(updateArg.score).toBe(1);
    expect(updateArg.completed_at).toBeUndefined();
    // مفيش صرف نص جولة
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("السؤال العاشر الصحيح: إقفال الجلسة + award_coins بعقد db/121 بالحرف", async () => {
    const current = storedQuestion(10);
    const nine = Array.from({ length: 9 }, (_, i) => storedQuestion(i + 1));
    const nineAnswers = Array.from({ length: 9 }, () => 0);
    trackSessions();
    supabaseFrom.mockImplementation((table: string) => {
      if (table === "worship_quiz_sessions") {
        const chain = makeChain(() => ({
          data: sessionRow([...nine, current], nineAnswers, 8),
          error: null,
        }));
        sessionsChains.push(chain);
        return chain;
      }
      return makeChain(() => ({ data: null, error: null }));
    });
    // البنك مش محتاج سؤال جديد — الجولة هتقفل
    serviceFrom.mockImplementation(() => makeChain(() => ({ data: [], error: null })));

    const res = await POST(
      makeRequest({
        action: "quiz-answer",
        sessionId: SESSION_ID,
        answer: "1", // correct = 0 بالرقم
      }),
    );

    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.finished).toBe(true);
    expect(body.correct).toBe(true);
    expect(body.score).toBe(9);
    expect(body.total).toBe(10);
    expect(body.awarded).toBe(10);
    expect(body.balance).toBe(42);
    expect(body.next).toBeUndefined();

    // عقد db/121 بالحرف: مصدر worship_quiz + مرجع quiz:<uuid>
    expect(rpcMock).toHaveBeenCalledOnce();
    expect(rpcMock).toHaveBeenCalledWith("award_coins", {
      p_source: "worship_quiz",
      p_ref_id: `quiz:${SESSION_ID}`,
      p_metadata: { score: 9, total: 10, activity: "worship-quiz" },
    });

    // الجلسة اتقفت بـ completed_at
    const sessionsChain = sessionsChains[1]; // [0] التحميل، [1] التحديث
    const updateArg = (sessionsChain.update as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Record<string, unknown>;
    expect(typeof updateArg.completed_at).toBe("string");
    expect(updateArg.total).toBe(10);
  });

  it("إجابة ماينفعش تتحقق: بتتحسب غلط وتُخزَّن -1 والشرح بيرجع", async () => {
    const current = storedQuestion(1);
    const nextQuestion = storedQuestion(2);
    trackSessions();
    supabaseFrom.mockImplementation((table: string) => {
      if (table === "worship_quiz_sessions") {
        const chain = makeChain(() => ({ data: sessionRow([current], [], 0), error: null }));
        sessionsChains.push(chain);
        return chain;
      }
      return makeChain(() => ({ data: null, error: null }));
    });
    serviceFrom.mockImplementation(() =>
      makeChain(() => ({
        data: [{ id: "row-2", questions: [nextQuestion], used_count: 0, last_used_at: null }],
        error: null,
      })),
    );

    const res = await POST(
      makeRequest({
        action: "quiz-answer",
        sessionId: SESSION_ID,
        answer: "حاجة تانية خالص",
      }),
    );

    const body = await jsonOf(res);
    expect(body.correct).toBe(false);
    expect(body.correctText).toBe("أول");
    const sessionsChain = sessionsChains[1]; // [0] التحميل، [1] التحديث
    const updateArg = (sessionsChain.update as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Record<string, unknown>;
    expect(updateArg.answers).toEqual([-1]);
    expect(updateArg.score).toBe(0);
  });

  it("جولة مكتملة من قبل → 400 ومفيش صرف تاني", async () => {
    supabaseFrom.mockImplementation((table: string) =>
      table === "worship_quiz_sessions"
        ? makeChain(() => ({
            data: { ...sessionRow([storedQuestion(1)], [0], 1), completed_at: new Date().toISOString() },
            error: null,
          }))
        : makeChain(() => ({ data: null, error: null })),
    );

    const res = await POST(
      makeRequest({ action: "quiz-answer", sessionId: SESSION_ID, answer: "أول" }),
    );
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("جولة مش موجودة/مش مملوكة → 400", async () => {
    supabaseFrom.mockImplementation((table: string) =>
      table === "worship_quiz_sessions"
        ? makeChain(() => ({ data: null, error: null }))
        : makeChain(() => ({ data: null, error: null })),
    );
    const res = await POST(
      makeRequest({ action: "quiz-answer", sessionId: SESSION_ID, answer: "أول" }),
    );
    expect(res.status).toBe(400);
  });

  it("معرّف جولة مش UUID → 400", async () => {
    const res = await POST(
      makeRequest({ action: "quiz-answer", sessionId: "not-a-uuid", answer: "أول" }),
    );
    expect(res.status).toBe(400);
  });

  it("إجابة فاضية → 400", async () => {
    const res = await POST(
      makeRequest({ action: "quiz-answer", sessionId: SESSION_ID, answer: "   " }),
    );
    expect(res.status).toBe(400);
  });
});

/* ==========================================================================
   حارس مشترك
   ========================================================================== */

describe("حارس الـ route المشترك", () => {
  it("action غير معروف → 400", async () => {
    const res = await POST(makeRequest({ action: "nope" }));
    expect(res.status).toBe(400);
  });
});
