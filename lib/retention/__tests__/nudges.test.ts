import { describe, it, expect } from "vitest";

import { CATALOG } from "@/lib/shop/catalog";
import { STUDY_DAY_XP_REWARD } from "@/lib/shop/economy";
import { STREAK_BONUSES } from "@/lib/retention/streak-tiers";
import {
  STEP_XP_REWARD,
  STORE_ENTRY_PRICE,
  buildNudges,
  missionsSmartHint,
} from "@/lib/retention/nudges";

const base = {
  xp: 0,
  coins: 0,
  streak: 0,
  rank: null as number | null,
  xpToNextRank: null as number | null,
  missionsDone: 0,
  missionsTotal: 4,
};

describe("أرقام الرسايل مش مكتوبة بالإيد", () => {
  it("عائد المرحلة في الرسايل = عائد المرحلة في الاقتصاد", () => {
    expect(STEP_XP_REWARD).toBe(STUDY_DAY_XP_REWARD);
  });

  it("سعر الدخول للمتجر = أرخص عنصر مدفوع فعلاً", () => {
    const cheapest = Math.min(...CATALOG.filter((item) => item.price > 0).map((item) => item.price));
    expect(STORE_ENTRY_PRICE).toBe(cheapest);
  });
});

describe("buildNudges — الأولوية", () => {
  it("المركز الأول رسالة تثبيت مش تحدي", () => {
    const [first] = buildNudges({ ...base, xp: 900, rank: 1 });
    expect(first.id).toBe("rank-first");
    expect(first.tone).toBe("celebrate");
    expect(first.body).toContain("900");
  });

  it("الترتيب القريب بيتحسب بخطوة واحدة بس", () => {
    const [first] = buildNudges({ ...base, rank: 4, xpToNextRank: 50 });
    expect(first.id).toBe("rank-close");
    expect(first.title).toContain("50");
    expect(first.title).toContain("3"); // المركز اللي فوقه
    expect(first.body).toContain(String(STEP_XP_REWARD));
  });

  it("فارق كبير في الترتيب مبيطلعش رسالة تضغط", () => {
    const ids = buildNudges({ ...base, rank: 40, xpToNextRank: 900 }).map((n) => n.id);
    expect(ids).not.toContain("rank-close");
  });

  it("السلسلة اللي محطتها بكرة بتيجي قبل النصايح", () => {
    const [first] = buildNudges({ ...base, streak: 6, missionsDone: 3 });
    expect(first.id).toBe("streak-tomorrow");
    expect(first.title).toContain("6");
    expect(first.body).toContain("120");
    expect(first.body).toContain("50");
  });

  it("سلسلة صفر ⇒ بداية لطيفة مش لوم", () => {
    const ids = buildNudges({ ...base, streak: 0 }).map((n) => n.id);
    expect(ids).toContain("streak-start");
    expect(buildNudges({ ...base, streak: 0 })[0].title).toContain("ابدأ");
  });

  it("المحطة مش بكرة ⇒ مفيش رسالة محطة", () => {
    // سلسلة ٤ ⇒ المحطة الجاية يوم ٦ (فاضل يومين)، فمش «بكرة»
    const ids = buildNudges({ ...base, streak: 4 }).map((n) => n.id);
    expect(ids).not.toContain("streak-tomorrow");
  });

  it("مهمة واحدة فاضلة بتطلع رسالة المهام", () => {
    const nudges = buildNudges({ ...base, missionsDone: 3, missionsTotal: 4 });
    const mission = nudges.find((n) => n.id === "missions-last-one");
    expect(mission).toBeDefined();
    expect(mission!.title).toBe("فاضل مهمة واحدة بس");
    expect(mission!.cta?.href).toBe("/missions");
  });

  it("الكوينز الكافية بتطلع نصيحة المتجر بالسعر الحقيقي", () => {
    const nudges = buildNudges({ ...base, coins: 250 });
    const shop = nudges.find((n) => n.id === "coins-shop");
    expect(shop).toBeDefined();
    expect(shop!.title).toContain("250");
    expect(shop!.body).toContain(String(STORE_ENTRY_PRICE));
  });

  it("مفيش كوينز كافية ⇒ مفيش نصيحة متجر", () => {
    const ids = buildNudges({ ...base, coins: STORE_ENTRY_PRICE - 1 }).map((n) => n.id);
    expect(ids).not.toContain("coins-shop");
  });

  it("دايماً فيه رسالة واحدة على الأقل تظهر", () => {
    expect(buildNudges(base).length).toBeGreaterThan(0);
    expect(buildNudges(base).at(-1)!.id).toBe("default-step");
  });

  it("بيتعامل مع أرقام تالفة من غير ما يرمي", () => {
    const nudges = buildNudges({
      ...base,
      xp: Number.NaN,
      coins: -5,
      streak: Number.POSITIVE_INFINITY,
      rank: 0,
      xpToNextRank: Number.NaN,
      missionsDone: -1,
      missionsTotal: 0,
    });
    expect(Array.isArray(nudges)).toBe(true);
    expect(nudges.length).toBeGreaterThan(0);
  });

  it("أرقام المحطات في الرسالة جاية من STREAK_BONUSES", () => {
    const week = STREAK_BONUSES.find((b) => b.every === 7)!;
    const [first] = buildNudges({ ...base, streak: 6 });
    expect(first.body).toContain(String(week.coins));
    expect(first.body).toContain(String(week.xp));
  });
});

describe("missionsSmartHint", () => {
  it("فاضل واحدة ⇒ النص المطلوب حرفيًا", () => {
    expect(missionsSmartHint(3, 4)).toBe("فاضل مهمة واحدة بس وتاخد كل مكافآت النهاردة!");
  });

  it("فاضل أكتر من واحدة ⇒ عدد واضح", () => {
    expect(missionsSmartHint(1, 4)).toContain("3");
  });

  it("خلصت الكل ⇒ تهنئة", () => {
    expect(missionsSmartHint(4, 4)).toContain("🎉");
  });

  it("مفيش مهام ⇒ null بدل رسالة فاضية", () => {
    expect(missionsSmartHint(0, 0)).toBeNull();
  });
});
