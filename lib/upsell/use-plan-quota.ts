"use client";

import { useCallback, useEffect, useState } from "react";

export type ServiceUsage = { id: string; label: string; limit: number; used: number; remaining: number };
export type PlanQuota = {
  tier: string;
  credits: number;
  messages: { used: number; limit: number };
  services: ServiceUsage[];
};

/**
 * اسم الحدث العام لتغيّر رصيد الكريدت.
 * يستخدمه مكوّن يستهلك كريدت (مثل الشات) ليخبر باقي العروض بالتحديث فورًا
 * بدل انتظار إعادة الجلب عند الرجوع للتاب.
 */
export const CREDITS_CHANGED_EVENT = "ai-credits-changed";

/** يبثّ حدث تغيّر الرصيد للعروض الأخرى (best-effort — للكلاينت فقط). */
export function notifyCreditsChanged(balance?: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<number | undefined>(CREDITS_CHANGED_EVENT, { detail: balance }));
}

/**
 * يقرأ الرصيد والباقة من `/api/me/plan-quota` ويعيد الجلب تلقائيًا:
 *   - عند رجوع التاب للواجهة أو فوكس النافذة (الرصيد اتخصم في مكان تاني)
 *   - عند حدث `ai-credits-changed` (استهلاك فوري من الشات أو غيره)
 *
 * فشل الجلب ما يكسرش الصفحة: `data` تبقى null و`error` يحمل السبب.
 * إعادة الجلب صامتة — `loading` للتحميل الأول فقط، والقيمة القديمة تبقى
 * ظاهرة حتى تصل القيمة الجديدة (بدون فليكر).
 * ⚠️ الجلب دائمًا بـ `cache: "no-store"` — الخادم نفسه بيبعت no-store،
 * فالرقم المعروض هو الرصيد الحقيقي من الـ ledger وقت الطلب.
 */
export function usePlanQuota() {
  const [data, setData] = useState<PlanQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/me/plan-quota", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as PlanQuota;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onCreditsChanged = () => refresh();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);
    window.addEventListener(CREDITS_CHANGED_EVENT, onCreditsChanged);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(CREDITS_CHANGED_EVENT, onCreditsChanged);
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}
