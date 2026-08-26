/* ==========================================================================
   مكافآت العبادة عبر الاقتصاد الموجود — طبقة رقيقة جدًا فوق
   `awardCoins()` في lib/shop/shop-data.ts اللي بتنده لـ public.award_coins().
   مفيش محفظة جديدة، مفيش رصيد جديد، ومفيش حساب مبالغ هنا — الداتابيز هي
   اللي بتقرا المبلغ والسقف من coin_source_rules وبتمنع التكرار بالفهرس
   الفريد على coin_ledger(user_id, source, ref_id).

   المراجع حتمية (يوم UTC + اسم الحدث) عشان إعادة النقر أو التحديث ترجع
   awarded=0 بهدوء من قاعدة البيانات نفسها.
   ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import { awardCoins } from "@/lib/shop/shop-data";

/** مصادر العبادة الثلاثة المعتمدة في coin_source_rules. */
export type WorshipSource = "worship_prayer" | "worship_quran" | "worship_adhkar";

/** قيم العرض فقط — مصدر الحقيقة هو السيرفر. */
export const WORSHIP_REWARD_LABELS: Record<WorshipSource, number> = {
  worship_prayer: 3,
  worship_quran: 5,
  worship_adhkar: 3,
};

/** نتيجة محاولة المكافأة بعد قرار السيرفر. */
export interface WorshipAwardResult {
  /** 0 = اتصرفت قبل كده أو السقف خلص — حالة طبيعية بلا توست ولا خطأ */
  coins: number;
  balance: number;
  capped: boolean;
}

/**
 * استدعاء مكافأة عبادة عبر award_coins الموجود.
 * الفشل مش بيكسر حاجة: العبادة نفسها اتحفظت قبل النداء ده، وبنرجّع
 * coins=0 ونسيب اللوج بس.
 */
export async function awardWorshipActivity(
  supabase: SupabaseClient,
  source: WorshipSource,
  refId: string,
  metadata: Record<string, unknown>,
): Promise<WorshipAwardResult> {
  try {
    const res = await awardCoins(supabase, source, refId, metadata);
    if (res.error) {
      // «مصدر مش معروف» غالبًا معناها db/worship.sql لسه ما اتشغّلش —
      // وضع متوقع، مش عطل يستاهل رسالة للمستخدم.
      console.warn(`awardWorshipActivity(${source}):`, res.error.message);
      return { coins: 0, balance: 0, capped: false };
    }
    return {
      coins: res.data.awarded,
      balance: res.data.balance,
      capped: res.data.capped,
    };
  } catch (err) {
    console.warn(`awardWorshipActivity(${source}) failed:`, err);
    return { coins: 0, balance: 0, capped: false };
  }
}
