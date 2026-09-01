"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { claimFoundationRewards } from "@/lib/shop/foundation-rewards";

/**
 * Phase 4.0 — Foundation Rewards Bootstrap
 *
 * يشتغل مرة واحدة عند فتح التطبيق المصادق عليه:
 *   User opens authenticated app → Server checks today's reward → grant if needed
 *
 * - Signup +20: مرة/عمر (ref=user_id) — trigger يمنح تلقائياً، هذا fallback idempotent
 * - Daily Login +10: مرة/يوم UTC (ref=YYYY-MM-DD)
 *
 * آمن ضد: refresh / double click / multiple tabs / concurrent requests
 * السيرفر يضمن idempotency عبر unique index + FOR UPDATE.
 * لا يغيّر UI ولا يطلب تدخل المستخدم — يحدّث الرصيد في الخلفية.
 *
 * يُزرع في app/dashboard/layout أو app/dashboard/page أو أي layout مصادق عليه.
 */
export default function FoundationRewardsBootstrap() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const supabase = createClient();

    void (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || (user as unknown as { is_anonymous?: boolean }).is_anonymous) return;

        // لا نحتاج currentBalance هنا — الـ RPC يرجع balance الجديد لو منح
        const { signup, daily } = await claimFoundationRewards(supabase, 0);

        // لوج هادئ للمراجعة — لا toast مزعج في Foundation
        if (signup.awarded > 0) {
          console.info(`[foundation] signup_bonus +${signup.awarded} → balance ${signup.balance}`);
          // إشارة لباقي الواجهة لتحديث الرصيد لو كانت تستمع
          window.dispatchEvent(new CustomEvent("foundation:coins", { detail: { source: "signup_bonus", awarded: signup.awarded, balance: signup.balance } }));
        }
        if (daily.awarded > 0) {
          console.info(`[foundation] daily_login +${daily.awarded} → balance ${daily.balance}`);
          window.dispatchEvent(new CustomEvent("foundation:coins", { detail: { source: "daily_login", awarded: daily.awarded, balance: daily.balance } }));
        }
      } catch (e) {
        // فشل الشبكة/الداتابيز لا يكسر التطبيق — مجرد لوج
        console.warn("[foundation] bootstrap failed:", (e as Error).message);
      }
    })();
  }, []);

  return null;
}
