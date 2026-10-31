import { NextResponse } from "next/server";
import { isPgConfigured, pgQuery } from "@/lib/admin/pg";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const secret = process.env.ALERT_EVAL_SECRET;
  const provided = request.headers.get("x-alert-secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isPgConfigured()) return NextResponse.json({ ok: false, error: "pg not configured" }, { status: 503 });

  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  let created = 0;
  try {
    const agg = await pgQuery<{ provider: string | null; total: string; failed: string }>(`
      SELECT provider, count(*)::text total, count(*) FILTER (WHERE status <> 'completed')::text failed
      FROM public.ai_usage_events
      WHERE created_at >= $1
      GROUP BY provider
    `, [since]);

    const service = createServiceClient();
    for (const row of agg) {
      const total = parseInt(row.total, 10);
      const failed = parseInt(row.failed, 10);
      if (total < 20) continue;
      const rate = failed / total;
      if (rate < 0.2) continue;
      // dedup: check active alert same provider/category
      const { data: existing } = await service
        .from("admin_alerts")
        .select("id")
        .eq("status", "active")
        .eq("category", "provider_failure_rate")
        .eq("provider", row.provider || "")
        .limit(1);
      if (existing && existing.length) {
        await service.from("admin_alerts").update({
          last_seen_at: new Date().toISOString(),
          count: failed,
          details: `failure rate ${Math.round(rate * 100)}% (${failed}/${total}) in last 10m`,
        }).eq("id", existing[0].id);
      } else {
        await service.from("admin_alerts").insert({
          category: "provider_failure_rate",
          severity: "warning",
          title: `Elevated failure rate: ${row.provider || "unknown"}`,
          details: `failure rate ${Math.round(rate * 100)}% (${failed}/${total}) in last 10m`,
          provider: row.provider,
          status: "active",
        });
        created++;
      }
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, created });
}
