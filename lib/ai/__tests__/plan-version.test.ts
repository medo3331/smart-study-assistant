/* ==========================================================================
 *  plan-version.test.ts — اختبارات وحدة إدارة إصدار الخطط (Plan Version)
 *  ═══════════════════════════════════════════════════════════════════════
 *
 *  اختبار وحدة خالص مع fake in-memory Supabase client — لا شبكة،
 *  لا process.env، لا DB حقيقية.
 *
 *  التشغيل:
 *    npx vitest run lib/ai/__tests__/plan-version.test.ts
 *  ==========================================================================
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  getActivePlanVersion,
  getActivePlanRow,
  planKeyExists,
  type GetActivePlanVersionResult,
  type ActivePlanVersion,
} from "@/lib/ai/plan-version";
import { createServiceClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase/admin");

class FakeRpcClient {
  public rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
  private responses: Array<{ data: unknown; error: Error | null }> = [];
  private callIndex = 0;

  setResponses(responses: Array<{ data: unknown; error: Error | null }>) {
    this.responses = responses;
    this.callIndex = 0;
  }

  rpc(name: string, params: Record<string, unknown>) {
    this.rpcCalls.push({ name, params });
    const response = this.responses[this.callIndex];
    this.callIndex++;
    if (!response) {
      return { data: null, error: null };
    }
    return { data: response.data, error: response.error };
  }
}

function makeFakeSupabase(rpcClient: FakeRpcClient): SupabaseClient {
  return {
    rpc: rpcClient.rpc.bind(rpcClient),
    from: () => rpcClient,
  } as unknown as SupabaseClient;
}

function setRpcResponse(client: FakeRpcClient, data: unknown, error: Error | null = null) {
  client.setResponses([{ data, error }]);
}

const sampleRow: ActivePlanVersion = {
  plan_key: "pro",
  name: "Pro Plan",
  display_name_ar: "باقةプロفيشونال",
  profile_limit: 10,
  messages_per_2h: 100,
  uploads_daily: 30,
  max_file_size_mb: 100,
  file_types: ["pdf", "docx"],
  video_audio_exclusive: false,
  priority_queue: "standard",
  trial_days: 7,
  is_active: true,
  version: 2,
  effective_date: "2026-01-01",
};

describe("getActivePlanVersion (plan-version.ts)", () => {
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

  it("يرجع الصف النشط عندما توجد خطة نشطة", async () => {
    setRpcResponse(rpcClient, [sampleRow]);
    const result = await getActivePlanVersion("pro");
    expect(result.row).toEqual(sampleRow);
    expect(result.foundButInactive).toBe(false);
    expect(result.error).toBeUndefined();
    expect(rpcClient.rpcCalls[0].name).toBe("get_active_plan_version");
    expect(rpcClient.rpcCalls[0].params).toEqual({ p_plan_key: "pro" });
  });

  it("يرجع row=null و foundButInactive=true عندما توجد الخطة لكنها غير نشطة", async () => {
    // أول استدعاء يرجع فارغ (لا نشطة)، والثاني يرجع بيانات (توجد الخطة)
    rpcClient.setResponses([
      { data: [], error: null },
      { data: [sampleRow], error: null },
    ]);
    const result = await getActivePlanVersion("pro");
    expect(result.row).toBeNull();
    expect(result.foundButInactive).toBe(true);
    expect(result.error).toContain("no active version");
  });

  it("يرجع row=null و foundButInactive=false عندما لا توجد الخطة أصلاً", async () => {
    // كلا الاستدعاءين يرجع فارغ
    rpcClient.setResponses([
      { data: [], error: null },
      { data: [], error: null },
    ]);
    const result = await getActivePlanVersion("nonexistent");
    expect(result.row).toBeNull();
    expect(result.foundButInactive).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("يرجع error عند فشل RPC", async () => {
    setRpcResponse(rpcClient, null, new Error("RPC failed"));
    const result = await getActivePlanVersion("pro");
    expect(result.row).toBeNull();
    expect(result.foundButInactive).toBe(false);
    expect(result.error).toBe("RPC failed");
  });
});

describe("getActivePlanRow (plan-version.ts)", () => {
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

  it("يرجع الصف النشط مباشرة", async () => {
    setRpcResponse(rpcClient, [sampleRow]);
    const row = await getActivePlanRow("pro");
    expect(row).toEqual(sampleRow);
  });

  it("يرجع null عندما لا توجد خطة نشطة", async () => {
    setRpcResponse(rpcClient, []);
    const row = await getActivePlanRow("pro");
    expect(row).toBeNull();
  });
});

describe("planKeyExists (plan-version.ts)", () => {
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

  it("يرجع true عندما توجد الخطة", async () => {
    setRpcResponse(rpcClient, [sampleRow]);
    const exists = await planKeyExists("pro");
    expect(exists).toBe(true);
  });

  it("يرجع false عندما لا توجد الخطة", async () => {
    setRpcResponse(rpcClient, []);
    const exists = await planKeyExists("nonexistent");
    expect(exists).toBe(false);
  });

  it("يرجع false عند فشل RPC", async () => {
    setRpcResponse(rpcClient, null, new Error("RPC failed"));
    const exists = await planKeyExists("pro");
    expect(exists).toBe(false);
  });
});
