import type { SupabaseClient } from "@supabase/supabase-js";

export const LECTURE_TRANSCRIPTION_FREE_TRIAL_LIMIT = 3;

export type TrialStatus = {
  used: number;
  limit: number;
  remaining: number;
  exhausted: boolean;
};

export type ReserveResult =
  | { ok: true; refId: string; remaining: number }
  | { ok: false; reason: "exhausted" | "error"; message: string };

export type PaidAccessResult = { allowed: boolean; source: "entitlement" | "admin" | "none" };

export async function getTrialStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<TrialStatus> {
  const { data, error } = await supabase
    .from("lecture_transcription_trials")
    .select("used_count")
    .eq("user_id", userId)
    .maybeSingle();

  const used = error || !data ? 0 : Number((data as { used_count?: number }).used_count ?? 0);
  const clamped = Math.max(0, Math.min(LECTURE_TRANSCRIPTION_FREE_TRIAL_LIMIT, used));
  return {
    used: clamped,
    limit: LECTURE_TRANSCRIPTION_FREE_TRIAL_LIMIT,
    remaining: Math.max(0, LECTURE_TRANSCRIPTION_FREE_TRIAL_LIMIT - clamped),
    exhausted: clamped >= LECTURE_TRANSCRIPTION_FREE_TRIAL_LIMIT,
  };
}

export async function reserveTrialAttempt(
  supabase: SupabaseClient,
  userId: string,
): Promise<ReserveResult> {
  const refId = `lecture_trial:${userId}:${crypto.randomUUID()}`;

  try {
    const { data, error } = await supabase.rpc("reserve_lecture_transcription_trial", {
      p_user_id: userId,
      p_ref_id: refId,
    });
    if (!error) {
      const row = (Array.isArray(data) ? data[0] : data) as
        | { ok?: boolean; remaining?: number; reason?: string }
        | null;
      if (row?.ok === false) {
        return {
          ok: false,
          reason: "exhausted",
          message: "استنفدت محاولاتك المجانية (3 من 3). اشترك لتفعيل التفريغ.",
        };
      }
      const remaining = typeof row?.remaining === "number" ? row.remaining : 0;
      return { ok: true, refId, remaining };
    }
  } catch {
    // fall through
  }

  try {
    await supabase
      .from("lecture_transcription_trials")
      .upsert({ user_id: userId, used_count: 0 }, { onConflict: "user_id", ignoreDuplicates: true });

    const { data: cur } = await supabase
      .from("lecture_transcription_trials")
      .select("used_count")
      .eq("user_id", userId)
      .maybeSingle();
    const used = Number((cur as { used_count?: number } | null)?.used_count ?? 0);
    if (used >= LECTURE_TRANSCRIPTION_FREE_TRIAL_LIMIT) {
      return {
        ok: false,
        reason: "exhausted",
        message: "استنفدت محاولاتك المجانية (3 من 3). اشترك لتفعيل التفريغ.",
      };
    }
    const { data: upd, error: updErr } = await supabase
      .from("lecture_transcription_trials")
      .update({ used_count: used + 1, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("used_count", used)
      .select("used_count");
    if (updErr || !upd || (Array.isArray(upd) && upd.length === 0)) {
      return {
        ok: false,
        reason: "error",
        message: "تعذر حجز محاولة التفريغ. حاول مرة أخرى.",
      };
    }
    const newUsed = Number((Array.isArray(upd) ? upd[0] : upd)?.used_count ?? used + 1);
    return {
      ok: true,
      refId,
      remaining: Math.max(0, LECTURE_TRANSCRIPTION_FREE_TRIAL_LIMIT - newUsed),
    };
  } catch {
    return {
      ok: false,
      reason: "error",
      message: "تعذر حجز محاولة التفريغ. حاول مرة أخرى.",
    };
  }
}

export async function completeTrialAttempt(
  supabase: SupabaseClient,
  userId: string,
  refId: string,
): Promise<void> {
  if (!userId || !refId) return;
  try {
    await supabase.rpc("complete_lecture_transcription_trial", {
      p_user_id: userId,
      p_ref_id: refId,
    });
  } catch {
    // best-effort; reservation remains counted as completed attempt
  }
}


export async function refundTrialAttempt(
  supabase: SupabaseClient,
  userId: string,
  refId: string,
): Promise<void> {
  if (!userId || !refId) return;
  try {
    await supabase.rpc("refund_lecture_transcription_trial", {
      p_user_id: userId,
      p_ref_id: refId,
    });
    return;
  } catch {
    // fallback
  }
  try {
    const { data } = await supabase
      .from("lecture_transcription_trials")
      .select("used_count")
      .eq("user_id", userId)
      .limit(1);
    const used = Number((Array.isArray(data) ? data[0] : data)?.used_count ?? 0);
    if (used > 0) {
      await supabase
        .from("lecture_transcription_trials")
        .update({ used_count: used - 1, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
    }
  } catch {
    // silent
  }
}

export async function recoverAbandonedTrialAttempts(
  supabase: SupabaseClient,
  timeoutMinutes = 30,
  limit = 100,
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc(
      "recover_abandoned_lecture_transcription_trials",
      {
        p_timeout_minutes: timeoutMinutes,
        p_limit: limit,
      },
    );
    if (error) return 0;
    const row = (Array.isArray(data) ? data[0] : data) as { recovered?: number } | null;
    return typeof row?.recovered === "number" ? row.recovered : 0;
  } catch {
    return 0;
  }
}


export async function hasPaidTranscriptionAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<PaidAccessResult> {
  // Reuse the repository's existing entitlement convention: a non-expired
  // entitlements row with kind='plan' and value='premium'. has_entitlement
  // already applies the expiration check.
  try {
    const { data } = await supabase.rpc("has_entitlement", {
      p_user_id: userId,
      p_kind: "plan",
      p_value: "premium",
    });
    if (data === true || data === "true") {
      return { allowed: true, source: "entitlement" };
    }
  } catch {
    // ignore
  }
  try {
    const { data } = await supabase
      .from("entitlements")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "plan")
      .eq("value", "premium")
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
      .limit(1);
    if (Array.isArray(data) && data.length > 0) {
      return { allowed: true, source: "entitlement" };
    }
  } catch {
    // ignore
  }
  return { allowed: false, source: "none" };
}

