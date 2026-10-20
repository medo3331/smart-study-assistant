"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  rememberReferralCodeFromUrl,
  readStoredReferralCode,
  clearStoredReferralCode,
} from "@/lib/referral/client";

/**
 * زارني زائر من رابط دعوة؟ (?ref=CODE)
 *
 * المكوّن ده مركّب في الـ root layout، فبيشوف أول تحميل صفحة لأي زائر
 * (اللاندينج، /register، /login — كلهم). بيحفظ الكود في localStorage،
 * ولو الزائر بقى عنده جلسة (سجّل أو دخل) بيبعت الكود لراوت التتبع
 * وبيمسحه. كله شفاف: من غير جلسة أو من غير كود مابيعملش حاجة.
 */
export function ReferralBootstrap() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    rememberReferralCodeFromUrl(window.location.search);

    void (async () => {
      const stored = readStoredReferralCode();
      if (!stored) return;

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      try {
        const res = await fetch("/api/referrals/attribute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: stored }),
        });
        const data = (await res.json().catch(() => null)) as {
          success?: boolean;
        } | null;
        // اتجاهل أو اتسجل؟ في الحالتين امسح عشان مايتحاولش تاني.
        if (!cancelled && data?.success) clearStoredReferralCode();
      } catch {
        // النت قاطع — الكود يفضل محفوظ للمحاولة الجاية
      }
    })();

    return () => {
      cancelled = true;
    };
    // بيشتغل على كل تنقّل عشان يلقط أول جلسة حقيقية بعد التسجيل
  }, [pathname]);

  return null;
}
