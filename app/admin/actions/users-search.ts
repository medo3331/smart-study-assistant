"use server";

import { createServiceClient } from "@/lib/supabase/admin";

export interface UserSearchResult {
  id: string;
  display_name: string | null;
  email: string | null;
  persona: string | null;
  role: string | null;
  user_code: string | null;
  public_user_code: string | null;
  is_banned: boolean;
  banned_at: string | null;
  ban_reason: string | null;
  plan_key: string | null;
  on_trial: boolean;
  created_at: string | null;
}

/**
 * بحث المستخدمين — Phase 4.4: فلاتر حقيقية على الداتابيز عبر service client.
 *
 * - q: بحث ilike على display_name/email/public_user_code.
 * - planFilter: free (بلا premium) / premium (غير تجربة) / trial (مصدر premium_trial_0_5).
 * - statusFilter: banned = profiles.is_banned = true (الفجوة الموثقة أُغلقت — الحالة حقيقية من DB).
 * - codeFilter: with_code (public_user_code غير فارغ) / without_code (فارغ).
 * - createdAfter/createdBefore: نطاق تاريخ (YYYY-MM-DD) على profiles.created_at.
 * - ترتيب: الأحدث أولًا. حد أقصى 50.
 */
export async function searchUsers(
  query: string,
  planFilter: string = "all",
  statusFilter: string = "all",
  codeFilter: string = "all",
  createdAfter: string | null = null,
  createdBefore: string | null = null
): Promise<UserSearchResult[]> {
  try {
    const privileged = createServiceClient();
    const q = (query || "").trim();

    let baseQuery = privileged
      .from("profiles")
      .select("id, display_name, email, persona, role, public_user_code, is_banned, banned_at, ban_reason, created_at, user_codes(code, is_active), entitlements(kind, value, metadata)");

    if (q) {
      const like = `%${q}%`;
      baseQuery = baseQuery.or(
        `display_name.ilike.${like},email.ilike.${like},public_user_code.ilike.${like}`
      );
    }

    if (statusFilter === "banned") baseQuery = baseQuery.eq("is_banned", true);
    else if (statusFilter === "active") baseQuery = baseQuery.or("is_banned.is.null,is_banned.eq.false");

    if (codeFilter === "with_code") baseQuery = baseQuery.not("public_user_code", "is", null);
    else if (codeFilter === "without_code") baseQuery = baseQuery.is("public_user_code", null);

    if (createdAfter && /^\d{4}-\d{2}-\d{2}$/.test(createdAfter)) {
      baseQuery = baseQuery.gte("created_at", createdAfter);
    }
    if (createdBefore && /^\d{4}-\d{2}-\d{2}$/.test(createdBefore)) {
      baseQuery = baseQuery.lte("created_at", createdBefore + "T23:59:59.999Z");
    }

    baseQuery = baseQuery.order("created_at", { ascending: false, nullsFirst: false });

    const { data, error } = await baseQuery.limit(50);
    if (error || !data) {
      // fallback: سكيمة قديمة بدون created_at — أعد المحاولة بدون الأعمدة الزمنية
      if (error?.message?.includes("created_at")) {
        const retry = await privileged
          .from("profiles")
          .select("id, display_name, email, persona, role, public_user_code, is_banned, banned_at, ban_reason, user_codes(code, is_active), entitlements(kind, value, metadata)")
          .limit(50);
        if (retry.error || !retry.data) return [];
        return mapRows(retry.data as any[], planFilter);
      }
      return [];
    }

    return mapRows(data as any[], planFilter);
  } catch {
    return [];
  }
}

function mapRows(rows: any[], planFilter: string): UserSearchResult[] {
  return rows
    .map((row: any) => {
      const ents = row.entitlements as any[] | undefined;
      const isTrial = !!ents?.some?.((e: any) => e.kind === "plan" && e.metadata?.source === "premium_trial_0_5");
      const hasPremium = !!ents?.some?.((e: any) => e.kind === "plan" && e.value === "premium");
      return {
        id: row.id,
        display_name: row.display_name,
        email: row.email,
        persona: row.persona,
        role: row.role,
        user_code: row.user_codes?.[0]?.code || null,
        public_user_code: row.public_user_code || null,
        is_banned: row.is_banned === true,
        banned_at: row.banned_at || null,
        ban_reason: row.ban_reason || null,
        plan_key: hasPremium ? "premium" : "free",
        on_trial: isTrial,
        created_at: row.created_at || null,
      } as UserSearchResult;
    })
    .filter((u) => {
      if (planFilter === "premium") return u.plan_key === "premium" && !u.on_trial;
      if (planFilter === "trial") return u.on_trial;
      if (planFilter === "free") return u.plan_key === "free";
      return true;
    });
}
