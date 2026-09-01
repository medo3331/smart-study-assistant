/**
 * Phase 4.0 Foundation Rewards — Signup + Daily Login
 *
 * لا Store، لا AI Tokens، لا Wheel UI — فقط الأساس.
 * كل كسب يمر عبر SECURITY DEFINER (award_coins / claim_*)،
 * المبلغ من coin_source_rules لا من الكلاينت، والـ idempotency عبر
 * unique index (user_id, source, ref_id) + daily_cap + FOR UPDATE.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface FoundationRewardResult {
  awarded: number;
  balance: number;
  capped: boolean;
  alreadyClaimed: boolean;
}

function toResult(row: { awarded?: number; balance?: number; capped?: boolean } | null, fallback: number): FoundationRewardResult {
  const awarded = row?.awarded ?? 0;
  return {
    awarded,
    balance: row?.balance ?? fallback,
    capped: row?.capped ?? false,
    alreadyClaimed: awarded === 0,
  };
}

/**
 * محاولة منح مكافأة التسجيل (+20) — مرة واحدة في العمر.
 * idempotent: إعادة النداء ترجع awarded=0 بدون خطأ.
 * يُستدعى تلقائياً عبر trigger على profiles insert، وهذا النداء هو fallback.
 */
export async function claimSignupBonus(
  supabase: SupabaseClient,
  currentBalance = 0
): Promise<FoundationRewardResult> {
  const { data, error } = await supabase.rpc("claim_signup_bonus");
  if (error) {
    // P0001 من award_coins — نعيدها كـ capped/alreadyClaimed بدون كسر
    const msg = (error as { message?: string }).message || "";
    if (msg.includes("is_anonymous") || msg.includes("ملف شخصي")) {
      return { awarded: 0, balance: currentBalance, capped: false, alreadyClaimed: true };
    }
    throw error;
  }
  const row = (Array.isArray(data) ? data[0] : data) as { awarded?: number; balance?: number; capped?: boolean } | null;
  return toResult(row, currentBalance);
}

/**
 * محاولة منح دخول اليوم (+10) — مرة/يوم UTC.
 * idempotent: نفس اليوم → awarded=0, capped=false (unique index).
 * لا يتطلب مذاكرة — الحدث هو الدخول نفسه.
 */
export async function claimDailyLogin(
  supabase: SupabaseClient,
  currentBalance = 0
): Promise<FoundationRewardResult> {
  const { data, error } = await supabase.rpc("claim_daily_login");
  if (error) {
    const msg = (error as { message?: string }).message || "";
    if (msg.includes("is_anonymous")) {
      return { awarded: 0, balance: currentBalance, capped: false, alreadyClaimed: true };
    }
    throw error;
  }
  const row = (Array.isArray(data) ? data[0] : data) as { awarded?: number; balance?: number; capped?: boolean } | null;
  return toResult(row, currentBalance);
}

/**
 * Hook مدمج: يحاول الاثنين معاً عند فتح التطبيق المصادق عليه.
 * آمن للتكرار (refresh/multiple tabs/concurrent) — السيرفر يضمن idempotency.
 * يُستدعى مرة واحدة لكل mount، مع فصل الأخطاء.
 */
export async function claimFoundationRewards(
  supabase: SupabaseClient,
  currentBalance = 0
): Promise<{ signup: FoundationRewardResult; daily: FoundationRewardResult }> {
  const [signup, daily] = await Promise.allSettled([
    claimSignupBonus(supabase, currentBalance),
    claimDailyLogin(supabase, currentBalance),
  ]);

  return {
    signup: signup.status === "fulfilled" ? signup.value : { awarded: 0, balance: currentBalance, capped: false, alreadyClaimed: true },
    daily: daily.status === "fulfilled" ? daily.value : { awarded: 0, balance: currentBalance, capped: false, alreadyClaimed: true },
  };
}
