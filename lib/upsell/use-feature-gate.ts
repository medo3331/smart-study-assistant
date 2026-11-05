"use client";

import { useCallback, useMemo, useState } from "react";

import { checkoutUrlFor, type NextPlan } from "@/lib/upsell/credit-status";

export type FeatureGate = {
  feature: string;
  requiredPlan: Exclude<NextPlan, null>;
};

/**
 * حالة توست «الميزة متاحة في باقة أعلى».
 *
 * الاستخدام:
 *   const gate = useFeatureGate();
 *   if (!allowed) gate.open("تصدير PDF", "pro");
 *   <FeatureGateToast open={gate.isOpen} onClose={gate.close}
 *                     feature={gate.gate?.feature ?? ""} requiredPlan={gate.gate?.requiredPlan ?? "pro"}
 *                     checkoutUrl={gate.checkoutUrl} />
 */
export function useFeatureGate() {
  const [gate, setGate] = useState<FeatureGate | null>(null);

  const open = useCallback((feature: string, requiredPlan: FeatureGate["requiredPlan"]) => {
    setGate({ feature, requiredPlan });
  }, []);

  const close = useCallback(() => setGate(null), []);

  const checkoutUrl = useMemo(
    () => checkoutUrlFor(gate?.requiredPlan ?? null),
    [gate]
  );

  return {
    gate,
    isOpen: gate !== null,
    open,
    close,
    checkoutUrl,
  };
}
