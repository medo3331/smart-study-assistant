import { pgQuery } from "./pg";

/**
 * 🤖 مراقبة الذكاء الاصطناعي — منطق منقول حرفيًا من app/admin/page.tsx
 * (Phase D) بدون تغيير في الاستعلامات. المصدر: ai_credit_ledger + entitlements.
 */

export interface AiOverview {
  total: number;
  last24h: number;
  last3h: number;
  super24h: number;
  ultra24h: number;
  entitlements: number;
}

export async function getAiOverview(): Promise<{ data: AiOverview | null; error: string | null }> {
  try {
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const since3h = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    const [totalRes, last24Res, last3Res, entRes] = await Promise.all([
      pgQuery<{ count: string }>(`SELECT count(*)::text as count FROM ai_credit_ledger WHERE reason='ai_reserve'`),
      pgQuery<{ count: string }>(
        `SELECT count(*)::text as count FROM ai_credit_ledger WHERE reason='ai_reserve' AND created_at >= $1`,
        [since24h]
      ),
      pgQuery<{ count: string }>(
        `SELECT count(*)::text as count FROM ai_credit_ledger WHERE reason='ai_reserve' AND created_at >= $1`,
        [since3h]
      ),
      pgQuery<{ count: string }>(`SELECT count(*)::text as count FROM entitlements`),
    ]);

    let super24h = 0;
    let ultra24h = 0;
    try {
      const rows = await pgQuery<{ metadata: { model?: string } | null }>(
        `SELECT metadata FROM ai_credit_ledger WHERE reason='ai_reserve' AND created_at >= $1 LIMIT 500`,
        [since24h]
      );
      for (const r of rows) {
        const m = r?.metadata?.model;
        if (m === "nvidia/nemotron-3-super-120b-a12b") super24h++;
        if (m === "nvidia/nemotron-3-ultra-550b-a55b") ultra24h++;
      }
    } catch {
      // لو الـmetadata شكلها مختلف، الأرقام تفضل 0 بدل ما نفشل الصفحة كلها.
    }

    return {
      data: {
        total: parseInt(totalRes[0]?.count || "0", 10),
        last24h: parseInt(last24Res[0]?.count || "0", 10),
        last3h: parseInt(last3Res[0]?.count || "0", 10),
        super24h,
        ultra24h,
        entitlements: parseInt(entRes[0]?.count || "0", 10),
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message || "تعذر جلب إحصائيات AI" };
  }
}
