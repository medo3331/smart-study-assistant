import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getTrialStatus,
  reserveTrialAttempt,
  refundTrialAttempt,
  hasPaidTranscriptionAccess,
  LECTURE_TRANSCRIPTION_FREE_TRIAL_LIMIT,
} from "@/lib/ai/lecture-transcription-access";

function makeSupabase(overrides: Record<string, unknown> = {}) {
  const rpc = vi.fn();
  const from = vi.fn();
  return { rpc, from, ...overrides } as unknown as { rpc: typeof rpc; from: typeof from };
}

describe("lecture-transcription-access", () => {
  it("free trial limit is 3", () => {
    expect(LECTURE_TRANSCRIPTION_FREE_TRIAL_LIMIT).toBe(3);
  });

  it("getTrialStatus returns 0 for new account", async () => {
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    } as unknown;
    const s = await getTrialStatus(supabase as never, "u1");
    expect(s.used).toBe(0);
    expect(s.remaining).toBe(3);
    expect(s.exhausted).toBe(false);
  });

  it("getTrialStatus counts used", async () => {
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { used_count: 2 }, error: null }) }) }),
      }),
    } as unknown;
    const s = await getTrialStatus(supabase as never, "u1");
    expect(s.used).toBe(2);
    expect(s.remaining).toBe(1);
    expect(s.exhausted).toBe(false);
  });

  it("getTrialStatus exhausted at 3", async () => {
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { used_count: 3 }, error: null }) }) }),
      }),
    } as unknown;
    const s = await getTrialStatus(supabase as never, "u1");
    expect(s.exhausted).toBe(true);
    expect(s.remaining).toBe(0);
  });

  it("reserveTrialAttempt via RPC success", async () => {
    const supabase = {
      rpc: async () => ({ data: { ok: true, remaining: 2 }, error: null }),
    } as unknown;
    const r = await reserveTrialAttempt(supabase as never, "u1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(2);
  });

  it("reserveTrialAttempt via RPC exhausted", async () => {
    const supabase = {
      rpc: async () => ({ data: { ok: false, remaining: 0 }, error: null }),
    } as unknown;
    const r = await reserveTrialAttempt(supabase as never, "u1");
    expect(r.ok).toBe(false);
  });

  it("hasPaidTranscriptionAccess true via entitlements non-free", async () => {
    const supabase = {
      rpc: async () => ({ data: false, error: null }),
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                or: () => ({
                  limit: async () => ({ data: [{ id: "ent-1" }], error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as unknown;
    const r = await hasPaidTranscriptionAccess(supabase as never, "u1");
    expect(r.allowed).toBe(true);
  });

  it("hasPaidTranscriptionAccess true with multiple entitlement rows", async () => {
    const supabase = {
      rpc: async () => ({ data: false, error: null }),
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                or: () => ({
                  limit: async () => ({ data: [{ id: "ent-1" }, { id: "ent-2" }], error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as unknown;
    const r = await hasPaidTranscriptionAccess(supabase as never, "u1");
    expect(r.allowed).toBe(true);
  });

  it("hasPaidTranscriptionAccess false for free", async () => {
    const supabase = {
      rpc: async () => ({ data: false, error: null }),
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                or: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as unknown;
    const r = await hasPaidTranscriptionAccess(supabase as never, "u1");
    expect(r.allowed).toBe(false);
  });

  it("hasPaidTranscriptionAccess false for expired premium", async () => {
    const supabase = {
      rpc: async () => ({ data: false, error: null }),
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                or: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as unknown;
    const r = await hasPaidTranscriptionAccess(supabase as never, "u1");
    expect(r.allowed).toBe(false);
  });
});
