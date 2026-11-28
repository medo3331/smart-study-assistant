/**
 * عقد migration الفلوس والتبديل (db/115 — D-M-08/D-M-09) — static contract
 * على نمط tests/economy-truth-migration.test.ts. بيمسك أي رجوع يحذف الحماية
 * (سعر البيع أقل من الشراء، REVOKE من anon، الخصم الذري) قبل ما يوصل للإنتاج.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  creditsForCoins,
  coinsForCredits,
  validateExchangeInput,
  exchangeErrorMessage,
} from "@/lib/shop/exchange";

const root = join(__dirname, "..");
const sql = readFileSync(join(root, "db", "115-market-money-exchange.sql"), "utf8").replace(/\r\n/g, "\n");

describe("db/115 — coin_packs (D-M-09)", () => {
  it("الجدول موجود + RLS قراءة للمفعّل فقط", () => {
    expect(sql).toContain("create table if not exists public.coin_packs");
    expect(sql).toContain("alter table public.coin_packs enable row level security");
    expect(sql).toContain("using (is_active = true)");
  });

  it("الباقات المعتمدة من التصميم (§6): 100/10 · 550/50 · 1200/100 · 2700/200", () => {
    expect(sql).toMatch(/\('باقة البداية',\s*100,\s*10\.00/);
    expect(sql).toMatch(/\('الباقة الشهيرة',\s*550,\s*50\.00/);
    expect(sql).toMatch(/\('الباقة الموفرة',\s*1200,\s*100\.00/);
    expect(sql).toMatch(/\('الباقة الضخمة',\s*2700,\s*200\.00/);
  });
});

describe("db/115 — purchase_requests kind=coins", () => {
  it("kind check بيقبل الأنواع الثلاثة", () => {
    expect(sql).toContain("check (kind in ('credits', 'plan', 'coins'))");
  });

  it("قيد الـ payload بيطابق البنية الفعلية (pack_id/credits · plan_key · coin_pack_id/coins)", () => {
    expect(sql).toContain("(kind = 'credits' and pack_id is not null and credits is not null)");
    expect(sql).toContain("(kind = 'plan'    and plan_key is not null)");
    expect(sql).toContain("(kind = 'coins'   and coin_pack_id is not null and coins is not null)");
  });
});

describe("db/115 — economy_exchange_settings (D-M-08)", () => {
  it("صف واحد + سعر البيع أقل من سعر الشراء (منع الـ arbitrage الدائري)", () => {
    expect(sql).toContain("check (id = 1)");
    expect(sql).toContain("check (rate_coins_per_credit_out < rate_coins_per_credit)");
  });

  it("السقوف اليومية موجودة + قراءة عامة", () => {
    expect(sql).toContain("daily_cap_coins");
    expect(sql).toContain("daily_cap_credits");
    expect(sql).toContain('create policy "economy_exchange_settings: public read"');
  });
});

describe("db/115 — المصادر وقواعد المنح", () => {
  it("credit_grants.source اتوسع بـ 'exchange' (من غيرها المنح هترفض)", () => {
    expect(sql).toMatch(/credit_grants_source_check\s*\n\s*check \(source in \('monthly', 'manual', 'trial', 'bonus', 'refund', 'exchange'\)\)/);
  });

  it("add_coins_grant بيقبل 'exchange' في التصنيفات المسموحة", () => {
    expect(sql).toContain("p_source_class not in ('purchase', 'ads', 'admin', 'exchange')");
  });

  it("مصدر purchase اتفعّل بدون سقف يومي (كل طلب مدفوع ومراجَع)", () => {
    expect(sql).toMatch(/set is_live = true, daily_cap = null\s*\n\s*where id = 'purchase'/);
  });
});

describe("db/115 — RPCs التبديل", () => {
  it("الاتجاهين موجودان و SECURITY DEFINER بمصادقة إجبارية", () => {
    expect(sql).toContain("create or replace function public.exchange_coins_to_credits(p_coins int)");
    expect(sql).toContain("create or replace function public.exchange_credits_to_coins(p_credits int)");
    expect(sql).toContain("raise exception 'exchange_coins_to_credits: لازم تكون داخل بحسابك'");
    expect(sql).toContain("raise exception 'exchange_credits_to_coins: لازم تكون داخل بحسابك'");
  });

  it("الخصم والإضافة في نفس الدالة (ذرّي) + حساب على الـ ledgerين", () => {
    expect(sql).toContain("source_type = 'spend'");
    expect(sql).toContain("reason, delta, ref_id, metadata");
    expect(sql).toContain("public.add_coins_grant(");
  });

  it("فشل المنح → استرداد الكريدت (لا خصم بلا مقابل)", () => {
    expect(sql).toContain("exchange_refund");
  });

  it("مصادقة: anon ممنوع من الاتجاهين + authenticated مسموح", () => {
    expect(sql.match(/revoke all on function public\.exchange_coins_to_credits\(int\) from public, anon;/g)?.length).toBe(1);
    expect(sql.match(/revoke all on function public\.exchange_credits_to_coins\(int\) from public, anon;/g)?.length).toBe(1);
    expect(sql).toContain("grant execute on function public.exchange_coins_to_credits(int) to authenticated");
    expect(sql).toContain("grant execute on function public.exchange_credits_to_coins(int) to authenticated");
  });

  it("سقف يومي بتوقيت القاهرة في الاتجاهين + داخل add_coins_grant", () => {
    expect((sql.match(/cairo_day\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("lib/shop/exchange — نفس معادلات السيرفر", () => {
  const settings = {
    coins_to_credits_enabled: true,
    credits_to_coins_enabled: true,
    rate_coins_per_credit: 10,
    rate_coins_per_credit_out: 8,
    min_coins: 50,
    min_credits: 10,
    daily_cap_coins: 3000,
    daily_cap_credits: 300,
  };

  it("creditsForCoins: أرضية صحيحة — 95 كوين بسعر 10 = 0 كريدت", () => {
    expect(creditsForCoins(95, 10)).toBe(9);
    expect(creditsForCoins(9, 10)).toBe(0);
  });

  it("coinsForCredits: ضرب مباشر — 30 كريدت × 8 = 240 كوين", () => {
    expect(coinsForCredits(30, 8)).toBe(240);
  });

  it("validateExchangeInput: الحدود الدنيا والمبالغ غير الصالحة", () => {
    expect(validateExchangeInput(49, "coins_to_credits", settings).valid).toBe(false);
    expect(validateExchangeInput(50, "coins_to_credits", settings).valid).toBe(true);
    expect(validateExchangeInput(9, "credits_to_coins", settings).valid).toBe(false);
    expect(validateExchangeInput(0, "coins_to_credits", settings).valid).toBe(false);
    // مبلغ فوق الحد الأدنى بس أقل من سعر كريدت واحد (min=5, rate=10)
    const lowRate = { ...settings, min_coins: 5 };
    expect(validateExchangeInput(5, "coins_to_credits", lowRate).error).toContain("أقل من سعر كريدت واحد");
  });

  it("المفاتيح المقفولة بتمنع التبديل في الاتجاه المقفول", () => {
    const off = { ...settings, coins_to_credits_enabled: false };
    expect(validateExchangeInput(500, "coins_to_credits", off).valid).toBe(false);
    expect(validateExchangeInput(500, "credits_to_coins", off).valid).toBe(true);
  });

  it("exchangeErrorMessage بينضف اسم الدالة من رسالة Postgres", () => {
    expect(exchangeErrorMessage("exchange_coins_to_credits: وصلت سقف التبديل اليومي (3000 كوين)")).toBe(
      "وصلت سقف التبديل اليومي (3000 كوين)",
    );
  });
});
