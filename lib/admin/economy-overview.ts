import { pgQuery } from "./pg";

/**
 * 🪙 اقتصاد العملات — منطق منقول حرفيًا من app/admin/page.tsx (Phase E)
 * بدون تغيير في الاستعلامات. المصدر: coin_ledger + coin_wallets.
 */

export interface EconomyOverview {
  totalEarns: number;
  earns24h: number;
  wallets: number;
  purchases24h: number;
  dailyLogin24h: number;
  streak24h: number;
  dayDone24h: number;
  totalCoinsIssued: number;
  totalCoinsSpent: number;
  wheelTotal: number;
  wheel24h: number;
  wheelCoins: number;
}

export async function getEconomyOverview(): Promise<{ data: EconomyOverview | null; error: string | null }> {
  try {
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [
      coinsTotalRes,
      coins24hRes,
      walletsRes,
      purchase24hRes,
      dailyLogin24hRes,
      streak24hRes,
      dayDone24hRes,
      wheelTotalRes,
      wheel24hRes,
    ] = await Promise.all([
      pgQuery<{ count: string }>(`SELECT count(*)::text as count FROM coin_ledger WHERE source_type='earn'`),
      pgQuery<{ count: string }>(
        `SELECT count(*)::text as count FROM coin_ledger WHERE source_type='earn' AND created_at >= $1`,
        [since24h]
      ),
      pgQuery<{ count: string }>(`SELECT count(*)::text as count FROM coin_wallets`),
      pgQuery<{ count: string }>(
        `SELECT count(*)::text as count FROM coin_ledger WHERE source IN ('purchase','store_purchase') AND source_type='spend' AND created_at >= $1`,
        [since24h]
      ),
      pgQuery<{ count: string }>(
        `SELECT count(*)::text as count FROM coin_ledger WHERE source='daily_login' AND created_at >= $1`,
        [since24h]
      ),
      pgQuery<{ count: string }>(
        `SELECT count(*)::text as count FROM coin_ledger WHERE source='streak_day' AND created_at >= $1`,
        [since24h]
      ),
      pgQuery<{ count: string }>(
        `SELECT count(*)::text as count FROM coin_ledger WHERE source='day_done' AND created_at >= $1`,
        [since24h]
      ),
      pgQuery<{ count: string }>(`SELECT count(*)::text as count FROM coin_ledger WHERE source='wheel' AND source_type='earn'`),
      pgQuery<{ count: string }>(
        `SELECT count(*)::text as count FROM coin_ledger WHERE source='wheel' AND created_at >= $1`,
        [since24h]
      ),
    ]);

    const sumRows = await pgQuery<{ sum: string }>(`SELECT coalesce(sum(amount),0)::text as sum FROM coin_ledger WHERE source_type='earn'`);
    const spendRows = await pgQuery<{ sum: string }>(`SELECT coalesce(sum(amount),0)::text as sum FROM coin_ledger WHERE source_type='spend'`);
    const wheelSumRows = await pgQuery<{ sum: string }>(`SELECT coalesce(sum(amount),0)::text as sum FROM coin_ledger WHERE source='wheel'`);

    return {
      data: {
        totalEarns: parseInt(coinsTotalRes[0]?.count || "0", 10),
        earns24h: parseInt(coins24hRes[0]?.count || "0", 10),
        wallets: parseInt(walletsRes[0]?.count || "0", 10),
        purchases24h: parseInt(purchase24hRes[0]?.count || "0", 10),
        dailyLogin24h: parseInt(dailyLogin24hRes[0]?.count || "0", 10),
        streak24h: parseInt(streak24hRes[0]?.count || "0", 10),
        dayDone24h: parseInt(dayDone24hRes[0]?.count || "0", 10),
        totalCoinsIssued: parseInt(sumRows[0]?.sum || "0", 10),
        totalCoinsSpent: Math.abs(parseInt(spendRows[0]?.sum || "0", 10)),
        wheelTotal: parseInt(wheelTotalRes[0]?.count || "0", 10),
        wheel24h: parseInt(wheel24hRes[0]?.count || "0", 10),
        wheelCoins: parseInt(wheelSumRows[0]?.sum || "0", 10),
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: (e as { message?: string }).message || "تعذر جلب إحصائيات Economy" };
  }
}
