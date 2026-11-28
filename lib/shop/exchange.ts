/**
 * حسابات التبديل بين الكوينز والكريدت (D-M-08).
 *
 * دوال نقية مشتركة بين واجهة التبديل والاختبارات — كل الأرقام القادمة من
 * `economy_exchange_settings` (صف واحد)، والخصم الفعلي بيحصل في RPCs
 * `exchange_coins_to_credits` / `exchange_credits_to_coins` على السيرفر.
 * الواجهة بتستخدم نفس المعادلات للمعاينة فقط — السيرفر هو مصدر الحقيقة.
 */

export type ExchangeSettings = {
  coins_to_credits_enabled: boolean;
  credits_to_coins_enabled: boolean;
  rate_coins_per_credit: number; // كام كوين = كريدت واحد (اتجاه الشراء)
  rate_coins_per_credit_out: number; // كام كوين بيرجعوا مقابل كريدت (اتجاه البيع)
  min_coins: number;
  min_credits: number;
  daily_cap_coins: number;
  daily_cap_credits: number;
};

/** كام كريدت هياخدهم الطالب مقابل `coins` كوين — أرضية كريدت واحد. */
export function creditsForCoins(coins: number, rate: number): number {
  if (!Number.isFinite(coins) || coins <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
  return Math.floor(coins / rate);
}

/** كام كوين هيرجعوا مقابل `credits` كريدت — ضرب مباشر في سعر البيع. */
export function coinsForCredits(credits: number, rateOut: number): number {
  if (!Number.isFinite(credits) || credits <= 0 || !Number.isFinite(rateOut) || rateOut <= 0) return 0;
  return credits * rateOut;
}

/** صالح للتبديل؟ — رسالة الخطأ بالعربي للعرض المباشر في الواجهة. */
export function validateExchangeInput(
  amount: number,
  direction: "coins_to_credits" | "credits_to_coins",
  settings: ExchangeSettings,
): { valid: boolean; error: string | null } {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, error: "اكتب مبلغًا صحيحًا." };
  }
  if (direction === "coins_to_credits") {
    if (!settings.coins_to_credits_enabled) {
      return { valid: false, error: "التبديل من كوينز لكريدت مقفول حاليًا." };
    }
    if (amount < settings.min_coins) {
      return { valid: false, error: `أقل مبلغ للتبديل ${settings.min_coins} كوين.` };
    }
    if (creditsForCoins(amount, settings.rate_coins_per_credit) < 1) {
      return { valid: false, error: `المبلغ أقل من سعر كريدت واحد (${settings.rate_coins_per_credit} كوين).` };
    }
  } else {
    if (!settings.credits_to_coins_enabled) {
      return { valid: false, error: "التبديل من كريدت لكوينز مقفول حاليًا." };
    }
    if (amount < settings.min_credits) {
      return { valid: false, error: `أقل مبلغ للتبديل ${settings.min_credits} كريدت.` };
    }
  }
  return { valid: true, error: null };
}

/** نص رسالة الخطأ من الـ RPC — نعرض أول سطر بس (الرسائل القادمة من Postgres طويلة). */
export function exchangeErrorMessage(raw: string): string {
  const firstLine = (raw ?? "").split("\n")[0].trim();
  // رسائل السيرفر بتبدأ باسم الدالة — نشيلها للعرض
  return firstLine.replace(/^exchange_(coins_to_credits|credits_to_coins):\s*/, "");
}
