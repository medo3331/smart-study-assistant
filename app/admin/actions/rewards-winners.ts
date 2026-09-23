// ============================================================
// EPIC-2 / Rewards — Winners Read + Rewards History
// ============================================================

"use server";

import { createServiceClient } from "@/lib/supabase/admin";

export interface RewardHistoryRow {
  id: string;
  recipient_user_id: string;
  recipient_email: string | null;
  recipient_display_name: string | null;
  reward_type: string;
  reward_value: number;
  duration_days: number | null;
  issued_by_email: string | null;
  note: string | null;
  created_at: string;
}

export async function getRewardsHistory(limit = 20): Promise<RewardHistoryRow[]> {
  const supabase = createServiceClient();
  try {
    const { data } = await supabase
      .from("rewards_issued")
      .select(`
        id,
        recipient_user_id,
        reward_type,
        reward_value,
        duration_days,
        note,
        created_at,
        issued_by
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!data) return [];

    // Enrich recipient info from profiles
    const userIds = [...new Set(data.map((r) => r.recipient_user_id).filter(Boolean))] as string[];
    const { data: profilesData } = await supabase.from("profiles").select("id, email, display_name").in("id", userIds.slice(0, 50));
    const profileMap = new Map((profilesData || []).map((p) => [p.id, p]));

    // Enrich issuer email from site_admins / auth (simplified: just show user id if no profile match)
    const result: RewardHistoryRow[] = data.map((r: any) => ({
      id: r.id,
      recipient_user_id: r.recipient_user_id,
      recipient_email: profileMap.get(r.recipient_user_id)?.email || null,
      recipient_display_name: profileMap.get(r.recipient_user_id)?.display_name || null,
      reward_type: r.reward_type,
      reward_value: r.reward_value,
      duration_days: r.duration_days,
      issued_by_email: null, // Could be enriched from auth.users if needed; kept simple
      note: r.note,
      created_at: r.created_at,
    }));
    return result;
  } catch (e: any) {
    console.error("[rewards-winners] DB unavailable:", e?.message || e);
    return [];
  }
}
