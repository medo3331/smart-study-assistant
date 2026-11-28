import { describe, it, expect } from "vitest";
import {
  COIN_SOURCES,
  COIN_GRANT_SOURCES,
  maxDailyCoins,
  isCoinSource,
} from "../economy";

/**
 * عقد السجل الموحّد (P0-B — Economy Truth).
 * القواعد دي هي اللي بتخلي lib/shop/economy.ts = db/113-economy-truth.sql.
 * أي مصدر جديد يتضاف للاتنين معًا، والاختبارات دي بتمسك أي نسيان.
 */

describe("economy registry — canonical contract (db/113)", () => {
  it("كل المعرفات فريدة", () => {
    const ids = Object.keys(COIN_SOURCES);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("كل مصدر live إما له dailyCap أو internal بدون سقف (محدود بالمعاملة)", () => {
    for (const s of Object.values(COIN_SOURCES)) {
      if (!s.live) continue;
      if ("kind" in s && s.kind === "internal") {
        // box_refund بس اللي بدون سقف — محدود بمعاملة الصندوق (تعويض < سعر)
        if (s.dailyCap === null) expect(s.id).toBe("box_refund");
        continue;
      }
      expect(s.dailyCap).not.toBeNull();
    }
  });

  it("oneTime وinternal مش داخلين في حساب الكسب اليومي الأقصى", () => {
    const manual = Object.values(COIN_SOURCES)
      .filter(
        (s) =>
          s.live &&
          !("streakTier" in s && s.streakTier) &&
          !("kind" in s && (s.kind === "oneTime" || s.kind === "internal")),
      )
      .reduce((sum, s) => sum + s.amount * (s.dailyCap ?? 1), 0);
    expect(maxDailyCoins()).toBe(manual);
  });

  it("snapshot — السقف اليومي النظري (يتراجع مع أي تعديل مبالغ)", () => {
    // الأساس القائم + مصادر الألعاب (G0-B) — التغيير هنا مقصود يتراجع مع D-M
    expect(maxDailyCoins()).toBe(652);
  });

  it("escape_room = 25 (قرار D-1 — مش 60)", () => {
    expect(COIN_SOURCES.escape_room.amount).toBe(25);
    expect(COIN_SOURCES.escape_room.live).toBe(true);
  });

  it("مصادر الألعاب المعتمدة (G0-B) live وبسقوف", () => {
    for (const id of ["break_riddle", "break_riddle_fast", "break_game", "daily_mission", "weekly_mission"] as const) {
      expect(COIN_SOURCES[id].live).toBe(true);
      expect(COIN_SOURCES[id].dailyCap).not.toBeNull();
    }
  });

  it("مصادر DEV-M1 الجديدة (اختبار الدرس/المراجعة/الامتحان) مش live لحد إثبات سيرفري", () => {
    for (const id of ["lesson_quiz_passed", "review_done", "exam_passed"] as const) {
      expect(COIN_SOURCES[id].live).toBe(false);
    }
  });

  it("مصادر المنح (شراء/إعلانات/إداري) منفصلة عن مصادر الكسب", () => {
    for (const g of COIN_GRANT_SOURCES) {
      expect(isCoinSource(g)).toBe(false);
    }
  });
});
