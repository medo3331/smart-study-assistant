// ============================================================
// EPIC-2 / Rewards — Activity Read (Server Action)
// Uses existing ai_credit_ledger + coin_ledger (no new criteria)
// ============================================================

"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { requireAdminPermission } from "@/lib/admin/auth-check";

export interface ActivityRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  ai_credits_24h: number;
  coin_earns_24h: number;
  total_activity_score: number;
}

export async function getMostActiveUsers(limitRaw = 10): Promise<ActivityRow[]> {
  // Phase 4.8 (RBAC review): فحص داخل الفعل (server action قابلة للاستدعاء
  // بالـaction ID من أي عميل — فحص الصفحة وحده مش كفاية) + تحديد limit.
  await requireAdminPermission("rewards.manage");
  const limit = Math.min(Math.max(Math.floor(Number(limitRaw) || 10), 1), 100);
  const supabase = createServiceClient();
  // Use pgQuery for aggregate counts (same pattern as admin/page.tsx Phase E)
  // Note: We rely on the DB being reachable; if not, we return empty and handle gracefully.
  try {
    // Fallback to direct Supabase query when pg is unavailable
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: profiles } = await supabase.from("profiles").select("id, email, display_name").limit(50);
    if (!profiles) return [];

    const result: ActivityRow[] = [];
    for (const p of profiles) {
      // AI Credits: count of ai_reserve in last 24h per user
      const { count: aiCount } = await supabase
        .from("ai_credit_ledger")
        .select("*", { count: "exact", head: true })
        .eq("user_id", p.id)
        .eq("reason", "ai_reserve")
        .gte("created_at", since24h);
      // Coins: sum of earn in last 24h per user
      const { data: coinRows } = await supabase
        .from("coin_ledger")
        .select("amount")
        .eq("user_id", p.id)
        .eq("source_type", "earn")
        .gte("created_at", since24h);
      const coinEarns = (coinRows || []).reduce((s, r) => s + (r.amount || 0), 0);

      result.push({
        user_id: p.id,
        email: p.email,
        display_name: p.display_name,
        ai_credits_24h: aiCount || 0,
        coin_earns_24h: coinEarns,
        total_activity_score: (aiCount || 0) + Math.abs(coinEarns),
      });
    }
    result.sort((a, b) => b.total_activity_score - a.total_activity_score);
    return result.slice(0, limit);
  } catch (e: any) {
    console.error("[rewards-activity] DB unavailable — returning empty:", e?.message || e);
    return [];
  }
}
