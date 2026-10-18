/* ==========================================================================
 *  quota-check.test.ts — اختبارات وحدة كوتا الاشتراك (Quota Check)
 *  ═══════════════════════════════════════════════════════════════════════
 *
 *  اختبار وحدة خالص مع fake in-memory Supabase client — لا شبكة،
 *  لا process.env، لا DB حقيقية.
 *
 *  التشغيل:
 *    npx vitest run lib/ai/__tests__/quota-check.test.ts
 *  ==========================================================================
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { checkSubscriptionQuota } from "@/lib/ai/quota-check";
import { createServiceClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase/admin");

/** Fake in-memory Supabase client للـ RPC. */
class FakeRpcClient {
  public rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
  public rpcData: unknown = null;
  public rpcError: Error | null = null;

  rpc(name: string, params: Record<string, unknown>) {
    this.rpcCalls.push({ name, params });
    return { data: this.rpcData, error: this.rpcError };
  }
}

/** Fake SupabaseClient يزود باب `rpc` فقط. */
function makeFakeSupabase(rpcClient: FakeRpcClient): SupabaseClient {
  return {
    rpc: rpcClient.rpc.bind(rpcClient),
    from: () => rpcClient,
  } as unknown as SupabaseClient;
}

/** تضبط RPC client للاستجابة بتخصيص بيانات أو خطأ. */
function setRpcResponse(client: FakeRpcClient, data: unknown, error: Error | null = null) {
  client.rpcData = data;
  client.rpcError = error;
}

describe("checkSubscriptionQuota (quota-check.ts)", () => {
  let rpcClient: FakeRpcClient;
  let supabase: SupabaseClient;
  const mockedCreateServiceClient = vi.mocked(createServiceClient);

  beforeEach(() => {
    rpcClient = new FakeRpcClient();
    supabase = makeFakeSupabase(rpcClient);
    mockedCreateServiceClient.mockReturnValue(supabase);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("مالك يتخطى الحدود الداخلية بدون استدعاء RPC (isOwner=true)", async () => {
    const result = await checkSubscriptionQuota("user-123", "message", true);
    expect(result.allowed).toBe(true);
    expect(result.ownerBypass).toBe(true);
    expect(result.planKey).toBe("owner");
    expect(result.limit).toBe(-1);
    expect(rpcClient.rpcCalls).toHaveLength(0);
  });

  it("مالك يتخطى الحدود للرفع أيضاً (isOwner=true, kind=upload)", async () => {
    const result = await checkSubscriptionQuota("user-123", "upload", true);
    expect(result.allowed).toBe(true);
    expect(result.ownerBypass).toBe(true);
    expect(rpcClient.rpcCalls).toHaveLength(0);
  });

  it("RPC يرجع allowed=false → fail-closed (إعراض 429)", async () => {
    setRpcResponse(rpcClient, {
      allowed: false,
      used: 90,
      limit: 100,
      reset_at: null,
      already_consumed: false,
    });
    const result = await checkSubscriptionQuota("user-123", "message");
    expect(result.allowed).toBe(false);
    expect(result.planKey).toBe("free");
    expect(result.used).toBe(90);
    expect(result.limit).toBe(100);
    expect(result.reasonAr).toContain("رسالة");
    expect(rpcClient.rpcCalls).toHaveLength(1);
    expect(rpcClient.rpcCalls[0].name).toBe("consume_subscription_quota");
  });

  it("RPC يرجع allowed=true → نتيجة ناجحة", async () => {
    setRpcResponse(rpcClient, {
      allowed: true,
      used: 5,
      limit: 100,
      reset_at: "2026-10-18T00:00:00Z",
      already_consumed: false,
    });
    const result = await checkSubscriptionQuota("user-123", "message");
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(5);
    expect(result.limit).toBe(100);
    expect(result.resetAt).toBe("2026-10-18T00:00:00Z");
    expect(result.ownerBypass).toBeUndefined();
    expect(rpcClient.rpcCalls).toHaveLength(1);
  });

  it("RPC يرجع already_consumed=true → سبب العنفة المكررة", async () => {
    setRpcResponse(rpcClient, {
      allowed: true,
      used: 5,
      limit: 100,
      reset_at: null,
      already_consumed: true,
    });
    const result = await checkSubscriptionQuota("user-123", "message");
    expect(result.allowed).toBe(true);
    expect(result.reasonAr).toContain("عنفة");
  });

  it("RPC throws → fail-open (QUOTA_FAIL_OPEN != false)", async () => {
    const original = process.env.QUOTA_FAIL_OPEN;
    process.env.QUOTA_FAIL_OPEN = "true";
    setRpcResponse(rpcClient, null, new Error("Database connection failed"));
    const result = await checkSubscriptionQuota("user-123", "message");
    expect(result.allowed).toBe(true);
    expect(result.planKey).toBe("unknown");
    expect(result.limit).toBe(-1);
    process.env.QUOTA_FAIL_OPEN = original;
  });

  it("RPC throws → fail-closed (QUOTA_FAIL_OPEN غير موجود — الافتراضي fail-closed)", async () => {
    const original = process.env.QUOTA_FAIL_OPEN;
    delete process.env.QUOTA_FAIL_OPEN;
    setRpcResponse(rpcClient, null, new Error("Database connection failed"));
    const result = await checkSubscriptionQuota("user-123", "message");
    expect(result.allowed).toBe(false); // fail-closed هو الافتراضي عندما env غير مضبوط
    expect(result.reasonAr).toContain("نظام الكوتة");
    process.env.QUOTA_FAIL_OPEN = original;
  });

  it("RPC throws → fail-closed (QUOTA_FAIL_OPEN=false)", async () => {
    const original = process.env.QUOTA_FAIL_OPEN;
    process.env.QUOTA_FAIL_OPEN = "false";
    setRpcResponse(rpcClient, null, new Error("Database connection failed"));
    const result = await checkSubscriptionQuota("user-123", "message");
    expect(result.allowed).toBe(false);
    expect(result.reasonAr).toContain("نظام الكوتة");
    process.env.QUOTA_FAIL_OPEN = original;
  });

  it("RPC throws → fail-open فقط عند QUOTA_FAIL_OPEN=true صريحاً", async () => {
    const original = process.env.QUOTA_FAIL_OPEN;
    process.env.QUOTA_FAIL_OPEN = "true";
    setRpcResponse(rpcClient, null, new Error("Database connection failed"));
    const result = await checkSubscriptionQuota("user-123", "message");
    expect(result.allowed).toBe(true); // fail-open صريح فقط عندما env = "true"
    expect(result.planKey).toBe("unknown");
    expect(result.limit).toBe(-1);
    process.env.QUOTA_FAIL_OPEN = original;
  });

  it("يستخدم مفتاح عنفة (idempotency key) في استدعاء RPC", async () => {
    setRpcResponse(rpcClient, {
      allowed: true,
      used: 5,
      limit: 100,
      reset_at: null,
      already_consumed: false,
    });

    const result = await checkSubscriptionQuota("user-123", "message", false);
    expect(result.allowed).toBe(true);
    expect(rpcClient.rpcCalls).toHaveLength(1);
    const todayUtc = new Date().toISOString().split("T")[0]; // YYYY-MM-DD (UTC)
    expect(rpcClient.rpcCalls[0].params).toHaveProperty(
      "p_idempotency_key",
      `quota:user-123:message:${todayUtc}`
    );
  });
});
