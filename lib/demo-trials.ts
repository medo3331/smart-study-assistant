/**
 * lib/demo-trials.ts — إدارة تجارب الزوار المجانية لمسار /api/demo
 * الغرض: منح كل زائر مجهول ما يصل إلى 3 تجارب ناجحة قبل التوجيه للتسجيل.
 * التخزين على السيرفر فقط (Supabase)، بدون الاعتماد على المتصفح.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export const DEMO_TRIAL_LIMIT = 3;
export const DEMO_TRIALS_TABLE = "demo_visitor_trials";

export type TrialReserveResult =
  | { ok: true; remaining: number; consumed: boolean }
  | {
      ok: false;
      code: "TRIALS_EXHAUSTED";
      remaining: 0;
      consumed: false;
      registerUrl: string;
    }
  | { ok: false; code: "STORAGE_ERROR"; remaining: number; consumed: false };

export type TrialRecordResult =
  | { ok: true; remaining: number }
  | { ok: false; code: "STORAGE_ERROR"; remaining: number };

export function sanitizeVisitorId(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const safe = value.replace(/[^a-zA-Z0-9-]/g, "");
  return safe.length >= 8 && safe.length <= 128 ? safe : null;
}

export function createVisitorId(): string {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof (crypto as unknown as { randomUUID?: () => string }).randomUUID ===
        "function"
    ) {
      return (crypto as unknown as { randomUUID: () => string }).randomUUID!();
    }
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2, 16)}`;
}

function getAdminClient(): SupabaseClient | null {
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}

export async function reserveDemoTrial(
  visitorId: string,
  registerUrl: string = "/register"
): Promise<TrialReserveResult> {
  const client = getAdminClient();
  if (!client) {
    return {
      ok: false,
      code: "STORAGE_ERROR",
      remaining: 0,
      consumed: false,
    };
  }

  try {
    const { data: rpcResult, error: rpcError } = await client.rpc(
      "reserve_demo_trial",
      { p_visitor_id: visitorId, p_limit: DEMO_TRIAL_LIMIT }
    );

    if (!rpcError && typeof rpcResult === "number") {
      if (rpcResult === -1) {
        return {
          ok: false,
          code: "TRIALS_EXHAUSTED",
          remaining: 0,
          consumed: false,
          registerUrl,
        };
      }
      return { ok: true, remaining: rpcResult, consumed: true };
    }

    if (rpcError) {
      console.warn("[demo-trials] RPC unavailable, falling back:", rpcError.message);
    }

    const { data: row, error: selectError } = await client
      .from(DEMO_TRIALS_TABLE)
      .select("visitor_id, trials_used, updated_at")
      .eq("visitor_id", visitorId)
      .maybeSingle();

    if (selectError && selectError.code !== "PGRST116") {
      console.error("[demo-trials] select error:", selectError.message);
      return {
        ok: false,
        code: "STORAGE_ERROR",
        remaining: 0,
        consumed: false,
      };
    }

    const currentUsed = row?.trials_used ?? 0;

    if (currentUsed >= DEMO_TRIAL_LIMIT) {
      return {
        ok: false,
        code: "TRIALS_EXHAUSTED",
        remaining: 0,
        consumed: false,
        registerUrl,
      };
    }

    const newUsed = currentUsed + 1;
    const { error: upsertError } = await client
      .from(DEMO_TRIALS_TABLE)
      .upsert(
        {
          visitor_id: visitorId,
          trials_used: newUsed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "visitor_id" }
      );

    if (upsertError) {
      console.error("[demo-trials] upsert error:", upsertError.message);
      return {
        ok: false,
        code: "STORAGE_ERROR",
        remaining: currentUsed,
        consumed: false,
      };
    }

    return {
      ok: true,
      remaining: DEMO_TRIAL_LIMIT - newUsed,
      consumed: true,
    };
  } catch (error) {
    console.error('[demo-trials] unexpected error:', error);
    return {
      ok: false,
      code: 'STORAGE_ERROR',
      remaining: 0,
      consumed: false,
    };
  }
}

export async function recordDemoTrialCompleted(
  visitorId: string
): Promise<TrialRecordResult> {
  const client = getAdminClient();
  if (!client) {
    return { ok: false, code: "STORAGE_ERROR", remaining: 0 };
  }

  try {
    const { data: row, error } = await client
      .from(DEMO_TRIALS_TABLE)
      .select("trials_used")
      .eq("visitor_id", visitorId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("[demo-trials] record select error:", error.message);
      return { ok: false, code: "STORAGE_ERROR", remaining: 0 };
    }

    const currentUsed = row?.trials_used ?? 0;

    if (!row) {
      const { error: insertError } = await client
        .from(DEMO_TRIALS_TABLE)
        .insert({
          visitor_id: visitorId,
          trials_used: 1,
          updated_at: new Date().toISOString(),
        });
      if (insertError) {
        console.error("[demo-trials] record insert error:", insertError.message);
        return { ok: false, code: "STORAGE_ERROR", remaining: 0 };
      }
      return { ok: true, remaining: DEMO_TRIAL_LIMIT - 1 };
    }

    return { ok: true, remaining: DEMO_TRIAL_LIMIT - currentUsed };
  } catch (error) {
    console.error("[demo-trials] record unexpected error:", error);
    return { ok: false, code: "STORAGE_ERROR", remaining: 0 };
  }
}

export async function getDemoTrialsRemaining(
  visitorId: string
): Promise<number> {
  const client = getAdminClient();
  if (!client) return DEMO_TRIAL_LIMIT;

  try {
    const { data, error } = await client
      .from(DEMO_TRIALS_TABLE)
      .select("trials_used")
      .eq("visitor_id", visitorId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("[demo-trials] get remaining error:", error.message);
      return DEMO_TRIAL_LIMIT;
    }

    const used = data?.trials_used ?? 0;
    return Math.max(0, DEMO_TRIAL_LIMIT - used);
  } catch {
    return DEMO_TRIAL_LIMIT;
  }
}

export function buildVisitorCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/demo",
    maxAge: 60 * 60 * 24 * 30,
  };
}

/**
 * إعادة مبلغ تجربة إذا فشل مزود AI بعد أن تم حجزها.
 * يُستدعى فقط عندما لم نحصل على استجابة صالحة من المزوّد،
 * لضمان ألا تحتسب تجربة فاشلة ضد الزائر.
 */
export async function refundDemoTrial(
  visitorId: string
): Promise<{ ok: boolean; remaining: number }> {
  const client = getAdminClient();
  if (!client) {
    return { ok: false, remaining: 0 };
  }

  try {
    const { data: rpcResult, error: rpcError } = await client.rpc(
      "refund_demo_trial",
      { p_visitor_id: visitorId, p_limit: DEMO_TRIAL_LIMIT }
    );

    if (!rpcError && typeof rpcResult === "number") {
      return { ok: true, remaining: rpcResult };
    }

    if (rpcError) {
      console.warn("[demo-trials] RPC unavailable, falling back:", rpcError.message);
    }

    const { data: row, error } = await client
      .from(DEMO_TRIALS_TABLE)
      .select("trials_used")
      .eq("visitor_id", visitorId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("[demo-trials] refund select error:", error.message);
      return { ok: false, remaining: 0 };
    }

    const currentUsed = row?.trials_used ?? 0;
    if (currentUsed === 0) {
      return { ok: true, remaining: DEMO_TRIAL_LIMIT };
    }

    const newUsed = Math.max(0, currentUsed - 1);
    const { error: upsertError } = await client
      .from(DEMO_TRIALS_TABLE)
      .upsert(
        {
          visitor_id: visitorId,
          trials_used: newUsed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "visitor_id" }
      );

    if (upsertError) {
      console.error("[demo-trials] refund upsert error:", upsertError.message);
      return { ok: false, remaining: DEMO_TRIAL_LIMIT - currentUsed };
    }

    return { ok: true, remaining: DEMO_TRIAL_LIMIT - newUsed };
  } catch (error) {
    console.error("[demo-trials] refund unexpected error:", error);
    return { ok: false, remaining: 0 };
  }
}
