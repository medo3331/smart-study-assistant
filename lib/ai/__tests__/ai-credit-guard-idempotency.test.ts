/**
 * 💳 اختبار حارس الكروت — الحجز المكرّر بنفس المرجع
 *
 * ═══ ليه الاختبار مهم ═══
 * `reserve_ai_credit` عند الـ owner بيعمل INSERT مباشر (reason =
 * 'owner_usage') **من غير** ما يتشيك على وجود حجز سابق. وفي فهرس فريد
 * على (user_id, reason, ref_id) ⇒ الطلب التاني بنفس المرجع بيقع في
 * unique violation.
 *
 * ده بالظبط اللي بيصير لما عملية واحدة تعمل **أكتر من طلب** بنفس
 * المرجع — زي «الشرح المكثف» (كل جزء طلب مستقل) — فلازم الحجز
 * المكرر يتعامل كـ «محجوز قبل كده» (يعني: **منع خصم تاني**) مش
 * كفشل.
 *
 * ⚠️ مافيش نداء شبكي — الـ rate limits مOCKed وكل حاجة تانية mock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/* ⚠️ الـ rate limits بتستعلم الـ DB — بنمockها عشان الاختبار يركز
   على سلوك الحجز نفسه. */
vi.mock("@/lib/ai/rate-limit", () => ({
  checkAiRateLimit: async () => ({ allowed: true, limit: 30, remaining: 29, retryAfter: 0, windowMs: 0 }),
  buildRateLimitBody: () => ({ ok: false, error: "rate limited" }),
  checkModelRateLimit: async () => ({ allowed: true, limit: 30, remaining: 29, retryAfter: 0, windowMs: 0 }),
  buildModelRateLimitBody: () => ({ ok: false, error: "model rate limited" }),
  checkAgentRateLimit: async () => ({ allowed: true, limit: 30, remaining: 29, retryAfter: 0, windowMs: 0 }),
  buildAgentRateLimitBody: () => ({ ok: false, error: "agent rate limited" }),
  checkGuestRateLimit: async () => ({ allowed: true, limit: 5, remaining: 4, retryAfter: 0, windowMs: 0 }),
  buildGuestRateLimitBody: () => ({ ok: false, error: "guest rate limited" }),
  isKnownAgentLimit: () => false,
  isPremiumUser: async () => false,
}));

import { guardAiAccessAndReserve } from "@/lib/ai/ai-credit-guard";

const USER = "user-1";
const MODEL = "openai/gpt-oss-120b";

type SbState = {
  /** الخطأ اللي الـ RPC هيرجعه (null = نجاح). */
  error: { message: string; code?: string } | null;
  /** عدد نداءات الـ RPC. */
  called: number;
  /** المراجع اللي اتبعتت. */
  refs: string[];
};

function makeSupabase(): {
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  from: () => unknown;
  __state: SbState;
} {
  const state: SbState = { error: null, called: 0, refs: [] };
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.called += 1;
      if (typeof args?.p_ref_id === "string") state.refs.push(args.p_ref_id);
      if (state.error) return { error: state.error, data: null };
      void name;
      return { error: null, data: [] };
    },
    from: () => ({}),
    __state: state,
  };
}

let sb: ReturnType<typeof makeSupabase>;

beforeEach(() => {
  vi.clearAllMocks();
  sb = makeSupabase();
});

describe("guardAiAccessAndReserve — مرجع الحجز", () => {
  it("✅ من غير refId ⇒ مرجع فريد لكل طلب (السلوك القديم)", async () => {
    const first = await guardAiAccessAndReserve(sb as never, USER, MODEL);
    const second = await guardAiAccessAndReserve(sb as never, USER, MODEL);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    // ⚠️ مرجعين مختلفين ⇒ كل طلب بيحجز لوحده.
    expect(first.ok && first.refId).not.toBe(second.ok && second.refId);
  });

  it("✅ مع refId ⇒ نفس المرجع بيتكرر (عملية واحدة = حجز واحد)", async () => {
    const refId = "lecture_intensive:user-1:lec-1";
    const first = await guardAiAccessAndReserve(sb as never, USER, MODEL, { refId });
    const second = await guardAiAccessAndReserve(sb as never, USER, MODEL, { refId });

    expect(first.ok && first.refId).toBe(refId);
    expect(second.ok && second.refId).toBe(refId);
    // ⚠️ نفس المرجع بيوصل للـ RPC في الطلبين.
    expect(sb.__state.refs.every((r) => r === refId)).toBe(true);
  });
});

describe("الحجز المكرر — unique violation", () => {
  it("✅ duplicate key ⇒ يتعامل كـ «محجوز قبل كده» (مش فشل)", async () => {
    // ⚠️ دي الرسالة اللي Postgres بيرميها على الـ unique index
    //    `ai_credit_ledger_user_reason_ref_unique`.
    sb.__state.error = {
      message:
        'duplicate key value violates unique constraint "ai_credit_ledger_user_reason_ref_unique"',
      code: "23505",
    };

    const result = await guardAiAccessAndReserve(sb as never, USER, MODEL, {
      refId: "lecture_intensive:user-1:lec-1",
    });

    // ⚠️ لازم يعدّي (ok) — الحجز موجود خلاص، فمش المفروض يتخصم تاني.
    expect(result.ok).toBe(true);
    expect(result.ok && result.refId).toBe("lecture_intensive:user-1:lec-1");
  });

  it("✅ «duplicate key» بالرسالة المختصرة برضو بتعدّي", async () => {
    sb.__state.error = { message: "duplicate key value violates unique constraint", code: "23505" };

    const result = await guardAiAccessAndReserve(sb as never, USER, MODEL, {
      refId: "lecture_intensive:user-1:lec-1",
    });

    expect(result.ok).toBe(true);
  });

  it("⛔ خطأ تاني (مش duplicate) ⇒ بيفشل زي ما كان", async () => {
    sb.__state.error = { message: "connection terminated unexpectedly", code: "08006" };

    const result = await guardAiAccessAndReserve(sb as never, USER, MODEL, {
      refId: "lecture_intensive:user-1:lec-1",
    });

    expect(result.ok).toBe(false);
  });

  it("⛔ رصيد غير كافٍ ⇒ 402 (مش duplicate)", async () => {
    sb.__state.error = { message: "insufficient credits" };

    const result = await guardAiAccessAndReserve(sb as never, USER, MODEL, {
      refId: "lecture_intensive:user-1:lec-1",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.response.status).toBe(402);
  });
});
