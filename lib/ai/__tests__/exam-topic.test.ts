import { describe, it, expect, vi } from "vitest";

/**
 * 🌍 «موضوع عام» — ثالث مصدر للامتحان (من غير أي ملف).
 *
 * ⚠️ **اللي بنختبره**:
 *   ① الـRPC الجديد بيبني جلسة ببند واحد (مصدره الموضوع).
 *   ② الموضوع لوحده (مش مخلوط بملفات) — والسيرفر بيمنع الخلط.
 *   ③ الـprompt في الوضع العام بيقول «معلوماتك العامة» بدل «التفريغ».
 *   ④ مفيش topic ⇒ خطأ واضح (مش 500).
 */
describe("المصدر العام — إنشاء الجلسة", async () => {
  const FAKE = "11111111-1111-1111-1111-111111111111";

  function makeMock() {
    return { rpc: vi.fn() } as unknown as { rpc: ReturnType<typeof vi.fn> };
  }

  it("بينادي الـRPC الجديد بـp_topic", async () => {
    const { createExamSession } = await import("../exam-sessions");
    const supabase = makeMock();
    supabase.rpc.mockResolvedValue({
      data: [
        {
          session_id: FAKE,
          status: "created",
          credit_reserved_at: "2026-11-04T10:00:00Z",
          total_chars: 20,
          total_chunks: 1,
          estimated_tokens: 5,
        },
      ],
      error: null,
    });

    const result = await createExamSession(supabase as never, {
      mode: "last_minute_review",
      lectureIds: [],
      topic: "البناء الضوئي",
    });

    expect(result.ok).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc.mock.calls[0][0]).toBe("create_exam_session_with_topic_reserve");
    expect(supabase.rpc.mock.calls[0][1]).toMatchObject({ p_topic: "البناء الضوئي" });
  });

  it("الـRPC مش موجود ⇒ TOPIC_UNAVAILABLE (مش 500)", async () => {
    const { createExamSession } = await import("../exam-sessions");
    const supabase = makeMock();
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });

    const result = await createExamSession(supabase as never, {
      mode: "last_minute_review",
      lectureIds: [],
      topic: "الفيزياء",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TOPIC_UNAVAILABLE");
  });

  it("الموضوع + ملفات مع بعض ⇒ VALIDATION (مصدر واحد بس)", async () => {
    const { createExamSession } = await import("../exam-sessions");
    const supabase = makeMock();

    const result = await createExamSession(supabase as never, {
      mode: "last_minute_review",
      lectureIds: [FAKE],
      topic: "الفيزياء",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("مفيش موضوع ولا مصادر ⇒ VALIDATION", async () => {
    const { createExamSession } = await import("../exam-sessions");
    const supabase = makeMock();

    const result = await createExamSession(supabase as never, {
      mode: "last_minute_review",
      lectureIds: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
  });

  it("الموضوع قصير (أقل من 3) ⇒ VALIDATION", async () => {
    const { createExamSession } = await import("../exam-sessions");
    const supabase = makeMock();

    const result = await createExamSession(supabase as never, {
      mode: "last_minute_review",
      lectureIds: [],
      topic: "ا",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
  });
});

describe("المصدر العام — تنظيف الموضوع", async () => {
  it("ينضّف المسافات ويحذف محارف التحكم", async () => {
    const { normalizeTopic } = await import("../exam-sources");
    expect(normalizeTopic("  البناء   الضوئي  ")).toBe("البناء الضوئي");
    expect(normalizeTopic("البناء\u0007 الضوئي")).toBe("البناء الضوئي");
  });

  it("نص قصير ⇒ null، ونص طويل ⇒ يتقص", async () => {
    const { normalizeTopic, EXAM_TOPIC_MAX_CHARS } = await import("../exam-sources");
    expect(normalizeTopic("ا")).toBeNull();
    expect(normalizeTopic(null)).toBeNull();
    expect(normalizeTopic(123)).toBeNull();
    expect(normalizeTopic("ا".repeat(400))?.length).toBe(EXAM_TOPIC_MAX_CHARS);
  });
});

describe("المصدر العام — تسمية المصدر", async () => {
  it("«موضوع عام» للتاب الجديد", async () => {
    const { examSourceLabel } = await import("../exam-sources");
    expect(examSourceLabel("topic")).toBe("موضوع عام");
    expect(examSourceLabel("document")).toBe("مستند");
    expect(examSourceLabel("recording")).toBe("محاضرة");
  });
});
