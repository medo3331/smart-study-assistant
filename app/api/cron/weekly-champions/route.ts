import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/cron/daily-maintenance";

/**
 * GET /api/cron/weekly-champions — جوائز Magicly Weekly Champions (التصميم §7)
 *
 * بتشتغل مرة أسبوعيًا (الأحد 22:00 UTC = منتصف ليل القاهرة تقريبًا — نهاية
 * الأسبوع). المنحة نفسها في `grant_weekly_champion_prizes()` (db/118):
 *   - الترتيب بمكافآت **الدراسة** المشتركة في الأسبوع المنتهي
 *     (source_class='study') — مش بعدد الكوينز المشتراة (D-M-01).
 *   - المركز الأول 200 · الثاني 150 · الثالث 100 — من `add_coins_grant`
 *     بصنف 'rewards' ومرجع الأسبوع الفريد.
 *   - idempotent: unique (week_start, champ_rank) + unique (week_start, user_id)
 *     + مرجع الأسبوع الفريد في coin_ledger — إعادة التشغيل ما بتنحش كوينز.
 *
 * ⚠️ الأمان: `CRON_SECRET` فشل مُغلق (نفس daily-maintenance).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("grant_weekly_champion_prizes");

  if (error) {
    console.error("[weekly-champions] rpc error:", error.message);
    return NextResponse.json(
      { error: "champion prizes failed", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, awarded: data ?? [] });
}
