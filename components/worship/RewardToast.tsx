"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/* ==========================================================================
   توست المكافأة — يظهر **فقط بعد تأكيد السيرفر** (claimWorshipReward رجّعت
   coins > 0). مفيش أنيميشن وهمي قبل الرد.

   • RTL: النص عربي والرقم LTR داخله.
   • prefers-reduced-motion: بيبان ويختفي بدون حركة.
   • موبايل: أعلى الشاشة مش فوق شريط التنقّل السفلي.
   ========================================================================== */

export interface RewardToastState {
  id: number;
  coins: number;
  label?: string;
}

export function RewardToast({
  reward,
  onDone,
}: {
  reward: RewardToastState | null;
  onDone?: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;

  // اختفاء تلقائي — المؤقّت على الحالة نفسها فمافيش تكرار.
  useEffect(() => {
    if (!reward) return;
    const t = setTimeout(() => onDone?.(), 2600);
    return () => clearTimeout(t);
  }, [reward, onDone]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex justify-center px-4"
    >
      <AnimatePresence>
        {reward && (
          <motion.div
            key={reward.id}
            initial={reduceMotion ? undefined : { opacity: 0, y: -24, scale: 0.92 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -16, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="flex items-center gap-3 rounded-2xl border border-[#FFD54D]/30 bg-[#141834]/95 px-5 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          >
            <span className="text-2xl" aria-hidden>
              🪙
            </span>
            <div className="text-right">
              <p className="text-sm font-bold text-white">🎉 أحسنت!</p>
              <p className="font-mono text-sm font-bold text-[#FFD54D]">
                +<bdi>{reward.coins}</bdi> Coins
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * خطاف صغير لإدارة طابور التوست. `show` بترفض القيم الصفرية —
 * ده الضمان الأخير إن مافيش توست بدون مكافأة مؤكدة من السيرفر.
 */
export function useRewardToast() {
  const [reward, setReward] = useState<RewardToastState | null>(null);

  const show = useCallback((coins: number, label?: string) => {
    if (coins <= 0) return; // لا توست بدون صرف فعلي من السيرفر
    setReward({ id: Date.now(), coins, label });
  }, []);

  const clear = useCallback(() => setReward(null), []);

  return { reward, show, clear };
}
