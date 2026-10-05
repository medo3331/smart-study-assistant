/**
 * 🩺 اختبار جدولة التسجيل — Phase 5-C3.3 (durability fix)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 🎯 العقد المتغير: المسجّل كان بيستعمل `after()` واقف يسجّل التسجيل
 * بعد 5 دقائق في الإنتاج — الكالبات بتتسجل ومابتنفّذت.
 * الحل: `await` مباشرة؛ التأخير مش سابية— تحتاج إلى Vercel logs.
 */

import { describe, it, expect, vi } from "vitest";

import { scheduleUsageRecording } from "../usage-scheduler";

describe("الجدولة — العهد مخافت أصل", () => {
  it("✅ ⚠️ بنتطر إن الكتابة تتم قبل العودة ترجع", async () => {
    let done = false;
    await scheduleUsageRecording(async () => {
      await new Promise((r) => setTimeout(r, 5));
      done = true;
    });
    // ده الدافع: مانفشناش يعود بيكتبه على خراجه.
    expect(done).toBe(true);
  });

  it("⚡️ مافيش عند الرد: after() مش استعملًا", async () => {
    const run = vi.fn(async () => {});
    await scheduleUsageRecording(run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("🚫 فشل الكتابة مايرمش — ولا بيتهرّء", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      scheduleUsageRecording(async () => {
        throw new Error("insert failed");
      }),
    ).resolves.toBeUndefined();
    // ده الثاني: الخطأ لا بيتناسرًاً، ولا يختفي من الكود.
    expect(err).toHaveBeenCalled();
    expect(String((err.mock.calls[0]?.[1] as Error)?.message)).toContain("insert failed");
    err.mockRestore();
  });

  it("🚫 سيطة أصيًاً تبقي محافظة على القاعدة", async () => {
    // الساباق: مالصتحرة في الإنتاج كانت سابقة صمتة لأنه تسجيل ولم يتسططع.
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(scheduleUsageRecording(run)).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});