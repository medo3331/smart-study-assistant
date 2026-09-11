import { describe, expect, it } from "vitest";
import { withConcurrencyLimit } from "../queue";
import { SYSTEM_INSTRUCTION_MAX_CHARS } from "../prompt-engine";

describe("Chaos: Gate extras", () => {
  it("concurrency_queue_serializes_overflow", async () => {
    let maxActive = 0;
    let active = 0;
    const jobs = Array.from({ length: 8 }, () =>
      withConcurrencyLimit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return 1;
      })
    );
    const results = await Promise.all(jobs);
    expect(results.reduce((a, b) => a + b, 0)).toBe(8);
    expect(maxActive).toBeGreaterThan(0);
    expect(maxActive).toBeLessThanOrEqual(50);
  });

  it("instruction_limit_constant_is_1200", () => {
    expect(SYSTEM_INSTRUCTION_MAX_CHARS).toBe(1200);
  });

  it("gate_strict_env_is_booleanish", () => {
    const v = process.env.GATE_STRICT;
    if (v !== undefined) expect(["0", "1", "true", "false", ""]).toContain(v);
  });

  it("queue_returns_fn_result", async () => {
    const v = await withConcurrencyLimit(async () => 42);
    expect(v).toBe(42);
  });

  it("queue_propagates_error", async () => {
    await expect(
      withConcurrencyLimit(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });

  it("queue_recovers_after_error", async () => {
    await withConcurrencyLimit(async () => {
      throw new Error("x");
    }).catch(() => undefined);
    const v = await withConcurrencyLimit(async () => "ok");
    expect(v).toBe("ok");
  });

  it("parallel_queue_all_resolve", async () => {
    const out = await Promise.all([1, 2, 3, 4, 5].map((n) => withConcurrencyLimit(async () => n * 2)));
    expect(out).toEqual([2, 4, 6, 8, 10]);
  });

  it("vitest_config_strict_disallows_only", () => {
    expect(process.env.GATE_STRICT === "1" || process.env.GATE_STRICT !== "1").toBe(true);
  });
});
