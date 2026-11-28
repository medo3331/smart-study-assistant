import { pgQuery } from "./pg";

/**
 * 🎛️ Economy Balancing (D-M-06) — قراءة حالة الاقتصاد للتعديل الإداري.
 *
 * الأسعار والمكافآت **جداول مش كود** — الصفحة دي هي اللي بتخلي الإدارة
 * تعدّلها بدون نشر. الكل قراءة مباشرة (service عبر DATABASE_URL) —
 * الكتابة في `app/admin/actions/economy-balancing.ts` مع Audit Log.
 */

export interface CoinSourceRuleRow {
  id: string;
  amount: number;
  daily_cap: number | null;
  is_live: boolean;
  is_variable: boolean;
}

export interface ExchangeSettingsRow {
  coins_to_credits_enabled: boolean;
  credits_to_coins_enabled: boolean;
  rate_coins_per_credit: number;
  rate_coins_per_credit_out: number;
  min_coins: number;
  min_credits: number;
  daily_cap_coins: number;
  daily_cap_credits: number;
}

export interface PackRow {
  id: string;
  title_ar: string;
  amount: number; // credits أو coins
  price: string;
  currency: string;
  is_active: boolean;
}

export interface EconomyBalancing {
  /** إجمالي مُصدر حسب التصنيف — من coin_ledger_classified */
  byClass: Array<{ source_class: string; total: string }>;
  /** إجمالي مُصدر حسب المصدر (أعلى 12) */
  bySource: Array<{ source: string; total: string }>;
  avgBalance: string;
  topBalances: Array<{ user_id: string; balance: string }>;
  earnUsers: number;
  spendUsers: number;
  rules: CoinSourceRuleRow[];
  exchange: ExchangeSettingsRow | null;
  coinPacks: PackRow[];
  creditPacks: PackRow[];
}

export async function getEconomyBalancing(): Promise<{ data: EconomyBalancing | null; error: string | null }> {
  try {
    const [byClass, bySource, avg, top, earnU, spendU, rules, exchange, coinPacks, creditPacks] =
      await Promise.all([
        pgQuery<{ source_class: string; total: string }>(
          `SELECT coalesce(source_class,'other') as source_class, coalesce(sum(amount),0)::text as total
             FROM coin_ledger WHERE source_type='earn' GROUP BY 1 ORDER BY sum(amount) DESC`,
        ),
        pgQuery<{ source: string; total: string }>(
          `SELECT source, coalesce(sum(amount),0)::text as total
             FROM coin_ledger WHERE source_type='earn' GROUP BY 1 ORDER BY sum(amount) DESC LIMIT 12`,
        ),
        pgQuery<{ avg: string }>(
          `SELECT coalesce(round(avg(bal)),0)::text as avg FROM (
             SELECT user_id, sum(amount)::numeric as bal FROM coin_ledger GROUP BY user_id
           ) t`,
        ),
        pgQuery<{ user_id: string; balance: string }>(
          `SELECT user_id, sum(amount)::text as balance FROM coin_ledger GROUP BY user_id
             ORDER BY sum(amount) DESC LIMIT 5`,
        ),
        pgQuery<{ n: string }>(
          `SELECT count(DISTINCT user_id)::text as n FROM coin_ledger WHERE source_type='earn'`,
        ),
        pgQuery<{ n: string }>(
          `SELECT count(DISTINCT user_id)::text as n FROM coin_ledger WHERE source_type='spend'`,
        ),
        pgQuery<CoinSourceRuleRow>(`SELECT id, amount, daily_cap, is_live, is_variable FROM coin_source_rules ORDER BY id`),
        pgQuery<ExchangeSettingsRow>(`SELECT * FROM economy_exchange_settings WHERE id = 1`),
        pgQuery<PackRow>(`SELECT id, title_ar, coins as amount, price::text as price, currency, is_active FROM coin_packs ORDER BY sort_order`),
        pgQuery<PackRow>(`SELECT id, title_ar, credits as amount, price::text as price, currency, is_active FROM credit_packs ORDER BY sort_order`),
      ]);

    return {
      data: {
        byClass,
        bySource,
        avgBalance: avg[0]?.avg ?? "0",
        topBalances: top,
        earnUsers: parseInt(earnU[0]?.n ?? "0", 10),
        spendUsers: parseInt(spendU[0]?.n ?? "0", 10),
        rules,
        exchange: exchange[0] ?? null,
        coinPacks,
        creditPacks,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "خطأ غير معروف" };
  }
}
