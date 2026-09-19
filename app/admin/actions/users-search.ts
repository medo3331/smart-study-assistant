"use server";

import { createServiceClient } from "@/lib/supabase/admin";

export interface UserSearchResult {
  id: string;
  display_name: string | null;
  email: string | null;
  persona: string | null;
  role: string | null;
  user_code: string | null;
  is_banned: boolean;
  plan_key: string | null;
  on_trial: boolean;
}

export async function searchUsers(query: string, planFilter: string, statusFilter: string): Promise<UserSearchResult[]> {
  try {
    const privileged = createServiceClient();
    // Basic query: join profiles + user_codes + entitlements
    // Note: EPIC-6 user_codes table is basic; full activation flow separate.
    let baseQuery = privileged
      .from("profiles")
      .select("id, display_name, email, persona, role, user_codes(code, is_active), entitlements(kind, value, metadata)")
      .or(`display_name.ilike.%${query}%,email.ilike.%${query}%`);

    // Note: real filtering by plan/status would require additional joins.
    // For this step, we return profile data with basic code info.
    const { data, error } = await baseQuery.limit(20);
    if (error || !data) return [];

    return (data as any[]).map((row: any) => ({
      id: row.id,
      display_name: row.display_name,
      email: row.email,
      persona: row.persona,
      role: row.role,
      user_code: row.user_codes?.[0]?.code || null,
      is_banned: false, // Note: actual ban status requires additional tracking table or field (future enhancement)
      plan_key: row.entitlements?.find?.((e: any) => e.kind === "plan")?.value || null,
      on_trial: row.entitlements?.some?.((e: any) => e.kind === "plan" && e.metadata?.source === "premium_trial_0_5") || false,
    }));
  } catch {
    return [];
  }
}
