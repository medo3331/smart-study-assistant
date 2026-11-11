/**
 * 🔁 Route-level tests — Conversation Summary (Sprint 2b.1 / 2b.1.2)
 * ═════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **ليه اختبارات على الراوت نفسه مش على الـ helpers فقط:** التلخيص
 *    سلوك HTTP كامل — عدّ البيانات، قرار التحديث، مفتاح الاستخدام
 *    المنفصل، والـ Compare-and-Swap كلها بتحدث *داخل* `/api/unified-ai`
 *    بعد نجاح الرد الأساسي. الـ helpers في `lib/magic/summary.ts` ليها
 *    اختباراتها الوحدة الخاصة؛ هنا بنقفل ان العقد الكاملة شغالة.
 *
 * مافيش نداءات مزودين حقيقية: `unifiedAI` و`aiRouter.completeChat`
 * مجاوبين بمقِيَم ثابتة، وSupabase fake بيتصرّف زي البوستجرس الملموس.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const PROMPT = "اشرح لي البناء الضوئي خطوة بخطوة";

/** ⚠️ vi.hoisted إجباري: vi.mock بتترفع لفوق قبل تعريف المتغيرات العادية. */
const h = vi.hoisted(() => {
  type UpdateRecord = {
    table: string;
    payload: Record<string, unknown>;
    casMode: "is-null" | "eq" | null;
    casValue: unknown;
    complete: boolean;
  };

  type FakeResult = { data: unknown; error: unknown; count?: number | null };

  interface FakeBuilder extends PromiseLike<FakeResult> {
    select(arg?: unknown, opts?: { count?: string }): FakeBuilder;
    eq(col: string, val: unknown): FakeBuilder;
    is(col: string, val: unknown): FakeBuilder;
    order(...args: unknown[]): FakeBuilder;
    update(payload: Record<string, unknown>): FakeBuilder;
    insert(rows: unknown): FakeBuilder;
    maybeSingle(): Promise<FakeResult>;
    single(): Promise<FakeResult>;
    then<R1 = FakeResult, R2 = never>(
      onFulfilled?: ((value: FakeResult) => R1 | PromiseLike<R1>) | null,
      onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
    ): PromiseLike<R1 | R2>;
  }

  // ⚠️ Identity objects only — beforeEach mutates fields, never reassigns,
  // so the closures inside makeSupabase always see the fresh values.
  const state = {
    user: { id: "u1" } as { id: string } | null,
    conversation: null as null | { id: string; summary: string | null; updated_at: string },
    loadedMsgs: [] as Array<{ role: string; content: string }>,
    /** الـ count اللي بيرجع لسؤال count(head:true) — العدد الحقيقي الكلي. */
    msgCount: 10,
    /** نتيجة الـ maybeSingle بتاعة UPDATE الملخص: صف = نجاح CAS، null = رفض CAS. */
    casData: { id: "conv-1" } as { id: string } | null,
  };
  const log = {
    updates: [] as UpdateRecord[],
    inserts: [] as Array<{ table: string; rows: unknown }>,
    rpcs: [] as string[],
  };
  const unifiedAI = vi.fn();
  const summaryChat = vi.fn();
  const memorySession = vi.fn();

  function makeBuilder(table: string): FakeBuilder {
    interface Q extends FakeBuilder {
      _selectOpts: { count?: string } | null;
      /** هل استُدعيت select() على السلسلة أصلًا (بلا options مثل CAS: select("id"))؟ */
      _selected: boolean;
      _updatePayload: Record<string, unknown> | undefined;
      _updateRecord: UpdateRecord | undefined;
      _casMode: "is-null" | "eq" | null;
      _casValue: unknown;
      _resolve(): FakeResult;
    }
    const q: Q = {
      _selectOpts: null,
      _selected: false,
      _updatePayload: undefined,
      _updateRecord: undefined,
      _casMode: null,
      _casValue: undefined,
      select(arg?: unknown, opts?: { count?: string }) {
        q._selectOpts = opts ?? null;
        q._selected = true;
        return q;
      },
      eq(col: string, val: unknown) {
        if (q._updatePayload !== undefined && col === "summary") {
          q._casMode = "eq";
          q._casValue = val;
        }
        return q;
      },
      is(col: string, val: unknown) {
        if (q._updatePayload !== undefined && col === "summary" && val === null) {
          q._casMode = "is-null";
          q._casValue = val;
        }
        return q;
      },
      order() {
        return q;
      },
      update(payload) {
        q._updatePayload = payload;
        q._updateRecord = { table, payload, casMode: null, casValue: undefined, complete: false };
        log.updates.push(q._updateRecord);
        return q;
      },
      insert(rows) {
        log.inserts.push({ table, rows });
        return q;
      },
      maybeSingle() {
        return Promise.resolve(q._resolve());
      },
      single() {
        return Promise.resolve({ data: { id: "conv-new" }, error: null } as FakeResult);
      },
      _resolve(): FakeResult {
        // UPDATE query — CAS terminal (maybeSingle) reads the canned result.
        if (q._updateRecord) {
          q._updateRecord.complete = true;
          q._updateRecord.casMode = q._casMode;
          q._updateRecord.casValue = q._casValue;
          // CAS chains always .select("id") before maybeSingle — a selected
          // update returns the canned row (matches → success / null → rejected).
          return q._selected ? { data: state.casData, error: null } : { data: null, error: null };
        }
        if (table === "chat_messages") {
          return q._selectOpts?.count === "exact"
            ? { count: state.msgCount, data: null, error: null }
            : { data: state.loadedMsgs, error: null };
        }
        if (table === "chat_conversations") {
          return { data: state.conversation, error: null };
        }
        return { data: null, error: null };
      },
      then(onFulfilled?, onRejected?) {
        // The direct `await supabase.from(...)...` chains use this terminal.
        return Promise.resolve(q._resolve()).then(onFulfilled, onRejected);
      },
    };
    return q;
  }

  function makeSupabase() {
    return {
      auth: { getUser: async () => ({ data: { user: state.user } }) },
      rpc: async (name: string) => {
        log.rpcs.push(name);
        return { data: null, error: null };
      },
      from: (table: string) => makeBuilder(table),
    };
  }

  return {
    state,
    log,
    unifiedAI,
    summaryChat,
    memorySession,
    makeSupabase,
    usage: {
      operationId: "OP-SUM",
      idempotencyKey: "KEY-SUM",
      source: "server",
      userId: "u1",
      feature: "chat",
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => h.makeSupabase(),
}));
vi.mock("@/lib/unified-ai/unified-ai", () => ({
  unifiedAI: h.unifiedAI,
}));
vi.mock("@/lib/ai/router", () => ({
  aiRouter: { completeChat: h.summaryChat },
}));
vi.mock("@/lib/ai/routing", () => ({
  routeCandidates: () => [],
  completeChatWithProviderFallback: vi.fn(),
}));
vi.mock("@/lib/ai/model-state", () => ({
  isModelRuntimeEnabled: () => true,
  refreshModelStateCache: async () => true,
  getRuntimePriority: (_id: string, p: number) => p,
}));
vi.mock("@/lib/ai/model-access", () => ({
  CURRENT_AI_MODEL: "openai/gpt-oss-20b",
  getModelAccessPolicy: () => ({ access: "free" }),
  filterAccessibleModels: async (candidates: unknown) => candidates,
}));
vi.mock("@/lib/ai/models", () => ({
  findModel: () => null,
}));
vi.mock("@/lib/ai/rate-limit", () => ({
  checkAiRateLimit: async () => ({ allowed: true }),
  buildRateLimitBody: () => ({}),
  checkModelRateLimit: async () => ({ allowed: true }),
  buildModelRateLimitBody: () => ({}),
  checkAgentRateLimit: async () => ({ allowed: true }),
  buildAgentRateLimitBody: () => ({}),
  checkGuestRateLimit: async () => ({ allowed: true }),
  buildGuestRateLimitBody: () => ({}),
  isKnownAgentLimit: () => false,
}));
vi.mock("@/lib/ai/usage-context", () => ({
  resolveUsageRequestContext: () => h.usage,
}));
vi.mock("@/lib/ai/prompt-builder", () => ({
  buildSystemPrompt: async () => "",
}));
vi.mock("@/lib/workspace/digest", () => ({
  getWorkspaceDigest: async () => "",
}));
vi.mock("@/lib/ai/chat-intent", () => ({
  classifyChatIntent: () => ({ intent: "GENERAL", reason: "deterministic" }),
}));
vi.mock("@/lib/magic/decision", () => ({
  makeDecision: () => ({
    chatIntent: "GENERAL",
    reason: "deterministic",
    mode: "study",
    needsRetrieval: false,
    needsExternalSearch: false,
    understanding: {
      intent: "GENERAL",
      difficulty: "easy",
      detailLevel: "medium",
      outputFormat: "short",
    },
  }),
}));
vi.mock("@/lib/ai/workspace-source-context", () => ({
  buildWorkspaceSourceContext: async () => ({ ok: false, resolution: { status: "not_found" } }),
}));
vi.mock("@/lib/magicly-ai", () => ({
  buildMagiclySystemPrompt: () => "magic system",
  getStudentContext: async () => ({}),
  getStudyToolFacts: async () => ({}),
  parseMode: () => "study",
  rememberSessionContext: h.memorySession,
}));

import { POST } from "@/app/api/unified-ai/route";

function defaultMsgs(n = 10) {
  const msgs: Array<{ role: string; content: string }> = [];
  for (let i = 1; i <= n; i++) {
    msgs.push({ role: i % 2 === 1 ? "user" : "assistant", content: `الرسالة القديمة رقم ${i}` });
  }
  return msgs;
}

function buildReq(prompt: string, conversationId = "conv-1") {
  return new Request("http://localhost/api/unified-ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, language: "ar", context: { conversationId } }),
  });
}

function summaryUserContent(): string {
  const arg = h.summaryChat.mock.calls[0]?.[1] as
    | { messages?: Array<{ role: string; content: string }> }
    | undefined;
  return arg?.messages?.find((m) => m.role === "user")?.content ?? "";
}

function summaryUpdates() {
  return h.log.updates.filter(
    (u) => typeof u.payload.summary === "string" && (u.payload.summary as string).length > 0
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.user = { id: "u1" };
  h.state.conversation = { id: "conv-1", summary: null, updated_at: "2026-01-01T00:00:00Z" };
  h.state.loadedMsgs = defaultMsgs(10);
  h.state.msgCount = 10;
  h.state.casData = { id: "conv-1" };
  h.log.updates.length = 0;
  h.log.inserts.length = 0;
  h.log.rpcs.length = 0;
  h.unifiedAI.mockResolvedValue({ ok: true, answer: "إجابة المساعد التجريبية", metadata: {} });
  h.summaryChat.mockResolvedValue({ content: "ملخص تجريبي جديد" });
  h.memorySession.mockResolvedValue(undefined);
});

describe("Conversation summary — scheduling", () => {
  it("A1 — يولّد الملخص الأول عند 10+ رسائل بملخص NULL (CAS is-null) ويضيف علامة التغطية", async () => {
    const res = await POST(buildReq(PROMPT));
    const body = (await res.json()) as { ok: boolean; answer?: string };

    expect(body.ok).toBe(true);
    expect(body.answer).toBe("إجابة المساعد التجريبية");
    expect(h.summaryChat).toHaveBeenCalledTimes(1);

    const updates = summaryUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].payload.summary).toBe("[covered:10] ملخص تجريبي جديد");
    // Initial creation over a NULL summary must use the is-null conditional.
    expect(updates[0].casMode).toBe("is-null");
    expect(updates[0].complete).toBe(true);
  });

  it("A2 — لا توليد تحت 10 رسائل", async () => {
    h.state.msgCount = 9;
    await POST(buildReq(PROMPT));

    expect(h.summaryChat).not.toHaveBeenCalled();
    expect(summaryUpdates()).toHaveLength(0);
  });

  it("A3 — تحديث بعد ≥ 5 رسائل جديدة (exactly +5) بشرط CAS eq", async () => {
    h.state.conversation = { id: "conv-1", summary: "[covered:10] ملخص قديم", updated_at: "2026-01-01T00:00:00Z" };
    h.state.msgCount = 15;

    const res = await POST(buildReq(PROMPT));
    const body = (await res.json()) as { ok: boolean };

    expect(body.ok).toBe(true);
    expect(h.summaryChat).toHaveBeenCalledTimes(1);

    const updates = summaryUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].payload.summary).toBe("[covered:15] ملخص تجريبي جديد");
    expect(updates[0].complete).toBe(true);
    expect(updates[0].casMode).toBe("eq");
    expect(updates[0].casValue).toBe("[covered:10] ملخص قديم");
  });

  it("A4 — لا تحديث قبل العتبة (أقل من 5 رسائل جديدة)", async () => {
    h.state.conversation = { id: "conv-1", summary: "[covered:15] ملخص قديم", updated_at: "2026-01-01T00:00:00Z" };
    h.state.msgCount = 19;

    await POST(buildReq(PROMPT));

    expect(h.summaryChat).not.toHaveBeenCalled();
    expect(summaryUpdates()).toHaveLength(0);
  });

  it("A5 — ملخص قديم بدون علامة يتلقى ختم تغطية واحدًا بدون AI (2b.1.3)", async () => {
    h.state.conversation = { id: "conv-1", summary: "ملخص قديم بدون علامة", updated_at: "2026-01-01T00:00:00Z" };
    h.state.msgCount = 40;

    await POST(buildReq(PROMPT));

    // The summary text is preserved, stamped with the CURRENT count — no AI.
    expect(h.summaryChat).not.toHaveBeenCalled();
    const updates = summaryUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].payload.summary).toBe("[covered:40] ملخص قديم بدون علامة");
    expect(updates[0].casMode).toBe("eq");
    expect(updates[0].casValue).toBe("ملخص قديم بدون علامة");
    expect(updates[0].complete).toBe(true);
  });
});

describe("Conversation summary — legacy coverage stamp (Sprint 2b.1.3 regression)", () => {
  const LEGACY = "ملخص قديم بدون علامة تغطية";

  it("R1 — 40 رسالة: ختم [covered:40] دون أي استدعاء AI", async () => {
    h.state.conversation = { id: "conv-1", summary: LEGACY, updated_at: "2026-01-01T00:00:00Z" };
    h.state.msgCount = 40;

    const res = await POST(buildReq(PROMPT));
    const body = (await res.json()) as { ok: boolean; answer?: string };

    expect(body.ok).toBe(true);
    expect(body.answer).toBe("إجابة المساعد التجريبية");
    // Requirement 1: no AI invocation merely to add metadata.
    expect(h.summaryChat).not.toHaveBeenCalled();
    const updates = summaryUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].payload.summary).toBe(`[covered:40] ${LEGACY}`);
    // Requirement 4: CAS against the EXACT previous summary.
    expect(updates[0].casMode).toBe("eq");
    expect(updates[0].casValue).toBe(LEGACY);
  });

  it("R2 — 44 رسالة بعد الختم عند 40: لا تحديث ولا AI (لم تكتمل العتبة)", async () => {
    h.state.conversation = { id: "conv-1", summary: "[covered:40] ملخص مختوم سابقًا", updated_at: "2026-01-01T00:00:00Z" };
    h.state.msgCount = 44;

    await POST(buildReq(PROMPT));

    expect(h.summaryChat).not.toHaveBeenCalled();
    expect(summaryUpdates()).toHaveLength(0);
  });

  it("R3 — 45 رسالة بعد الختم عند 40: التحديث يشتغل بالمسار الطبيعي (AI)", async () => {
    h.state.conversation = { id: "conv-1", summary: "[covered:40] ملخص مختوم سابقًا", updated_at: "2026-01-01T00:00:00Z" };
    h.state.msgCount = 45;

    await POST(buildReq(PROMPT));

    // Back to the normal schedule: AI refresh with the previous summary in input.
    expect(h.summaryChat).toHaveBeenCalledTimes(1);
    const content = summaryUserContent();
    expect(content).toContain("ملخص سابق: ملخص مختوم سابقًا");
    const updates = summaryUpdates();
    expect(updates[0].payload.summary).toBe("[covered:45] ملخص تجريبي جديد");
    expect(updates[0].casMode).toBe("eq");
    expect(updates[0].casValue).toBe("[covered:40] ملخص مختوم سابقًا");
  });

  it("R4 — رفض CAS أثناء الختم: لا كتابة فوق ملخص مُحدّث تزامنيًا ولا إعادة محاولة", async () => {
    h.state.conversation = { id: "conv-1", summary: LEGACY, updated_at: "2026-01-01T00:00:00Z" };
    h.state.msgCount = 40;
    h.state.casData = null; // Another request stamped/refreshed the summary first.

    const res = await POST(buildReq(PROMPT));
    const body = (await res.json()) as { ok: boolean; answer?: string };

    expect(body.ok).toBe(true);
    expect(body.answer).toBe("إجابة المساعد التجريبية");
    // Requirement 5: one conditional attempt, skipped silently, no AI, no retry.
    expect(h.summaryChat).not.toHaveBeenCalled();
    const updates = summaryUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].complete).toBe(true);
    expect(updates[0].casValue).toBe(LEGACY);
  });

  it("R5 — الملخص الفارغ (مسافات) يتبع قواعد التوليد الأولي، لا الختم", async () => {
    h.state.conversation = { id: "conv-1", summary: "   ", updated_at: "2026-01-01T00:00:00Z" };
    h.state.msgCount = 12;

    await POST(buildReq(PROMPT));

    // Whitespace-only = missing summary → AI generation. The CAS compares
    // against the exact previous value (non-null "   "), which also blocks
    // overwriting a summary concurrently generated by another request.
    expect(h.summaryChat).toHaveBeenCalledTimes(1);
    const updates = summaryUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].payload.summary).toBe("[covered:12] ملخص تجريبي جديد");
    expect(updates[0].casMode).toBe("eq");
    expect(updates[0].casValue).toBe("   ");
  });

  it("R6 — بادئة مشوّهة مع نص: تعاد كتابتها كبادئة سليمة بلا AI", async () => {
    h.state.conversation = { id: "conv-1", summary: "[covered:abc] شرحنا المحاضرة واتفقنا.", updated_at: "2026-01-01T00:00:00Z" };
    h.state.msgCount = 25;

    await POST(buildReq(PROMPT));

    // Deliberate handling — malformed metadata replaced, text kept, no AI.
    expect(h.summaryChat).not.toHaveBeenCalled();
    const updates = summaryUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].payload.summary).toBe("[covered:25] شرحنا المحاضرة واتفقنا.");
    expect(updates[0].casMode).toBe("eq");
  });
});

describe("Conversation summary — input construction", () => {
  it("B1 — المدخلات فيها الملخص السابق (بدون علامة التغطية الداخلية)", async () => {
    h.state.conversation = { id: "conv-1", summary: "[covered:10] ملخص قديم", updated_at: "2026-01-01T00:00:00Z" };
    h.state.msgCount = 16;

    await POST(buildReq(PROMPT));

    const content = summaryUserContent();
    expect(content).toContain("ملخص سابق: ملخص قديم");
    expect(content).not.toContain("[covered:10]");
  });

  it("B2 — رسالة المستخدم الحالية تظهر مرة واحدة فقط", async () => {
    h.state.msgCount = 12;
    await POST(buildReq(PROMPT));

    const content = summaryUserContent();
    const occurrences = content.split(PROMPT).length - 1;
    expect(occurrences).toBe(1);
  });
});

describe("Conversation summary — failure handling", () => {
  it("C1 — مخرجات الموديل الفارغة لا تُخزَّن", async () => {
    h.state.msgCount = 12;
    h.summaryChat.mockResolvedValue({ content: "   " });

    const res = await POST(buildReq(PROMPT));
    const body = (await res.json()) as { ok: boolean };

    expect(body.ok).toBe(true);
    expect(summaryUpdates()).toHaveLength(0);
  });

  it("C2 — فشل مزود التلخيص لا يؤثر على الرد الأساسي", async () => {
    h.state.msgCount = 12;
    h.summaryChat.mockRejectedValue(new Error("provider down"));

    const res = await POST(buildReq(PROMPT));
    const body = (await res.json()) as { ok: boolean; answer?: string };

    expect(body.ok).toBe(true);
    expect(body.answer).toBe("إجابة المساعد التجريبية");
    expect(summaryUpdates()).toHaveLength(0);
  });
});

describe("Conversation summary — concurrency (CAS)", () => {
  it("D1 — CAS ناجح مع ملخص سابق non-null: تحديث شرطي على قيمة الملخص القديمة", async () => {
    h.state.conversation = { id: "conv-1", summary: "[covered:10] ملخص قديم", updated_at: "2026-01-01T00:00:00Z" };
    h.state.msgCount = 15;
    h.state.casData = { id: "conv-1" };

    await POST(buildReq(PROMPT));

    const updates = summaryUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].complete).toBe(true);
    expect(updates[0].casMode).toBe("eq");
    // The conditional must compare against the EXACT previous summary value.
    expect(updates[0].casValue).toBe("[covered:10] ملخص قديم");
  });

  it("D2 — CAS مرفوض (طلب آخر غيّر الملخص): يتجاهل الكتابة بسكوت ولا يعاد المحاولة", async () => {
    h.state.msgCount = 12;
    h.state.casData = null; // Another request changed the summary first.

    const res = await POST(buildReq(PROMPT));
    const body = (await res.json()) as { ok: boolean; answer?: string };

    expect(body.ok).toBe(true);
    expect(body.answer).toBe("إجابة المساعد التجريبية");
    // The conditional write was attempted exactly once, then skipped — no retries.
    const updates = summaryUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].complete).toBe(true);
    expect(updates[0].casMode).toBe("is-null");
  });
});

describe("Conversation summary — usage accounting", () => {
  it("E1 — مفتاح الاستخدام للملخص منفصل عن مفتاح الطلب الأساسي", async () => {
    h.state.msgCount = 12;
    await POST(buildReq(PROMPT));

    // Main request keeps its own identity.
    const mainInput = h.unifiedAI.mock.calls[0][0] as { usage?: { idempotencyKey: string } };
    expect(mainInput.usage?.idempotencyKey).toBe("KEY-SUM");

    // Summary call carries a suffixed key — never collides with the main one.
    const summaryCall = h.summaryChat.mock.calls[0] as unknown as [
      string,
      { usage?: { idempotencyKey: string } },
    ];
    expect(summaryCall[1].usage?.idempotencyKey).toBe("KEY-SUM-summary");
  });

  it("E2 — التلخيص لا يحجز AI Credit إضافي", async () => {
    h.state.msgCount = 12;
    await POST(buildReq(PROMPT));

    // Exactly one reservation — the main request. Summary adds zero.
    const reserves = h.log.rpcs.filter((name) => name === "reserve_ai_credit");
    expect(reserves).toHaveLength(1);
  });
});

describe("Student memory — P0 route integration", () => {
  it("F1 — فشل حفظ الذاكرة (rejection) لا لا يضر الرد الأساسي إطلاقًا", async () => {
    h.state.msgCount = 12;
    h.memorySession.mockRejectedValue(new Error("memory table down"));

    const res = await POST(buildReq(PROMPT));
    const body = (await res.json()) as { ok: boolean; answer?: string };

    expect(body.ok).toBe(true);
    expect(body.answer).toBe("إجابة المساعد التجريبية");
    // summary flow unaffected by memory failure
    expect(h.summaryChat).toHaveBeenCalledTimes(1);
  });

  it("F2 — الكتابة اللانزمنية للذاكرة بنطاق المالك الصحيح", async () => {
    h.state.msgCount = 12;
    await POST(buildReq(PROMPT));

    expect(h.memorySession).toHaveBeenCalledTimes(1);
    // args: (supabase, userId, studentContext) — the real user id, never null
    const args = h.memorySession.mock.calls[0] as unknown as [unknown, string, unknown];
    expect(args[1]).toBe("u1");
  });
});
