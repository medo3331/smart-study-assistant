"use client";

import { useCallback, useEffect, useState } from "react";

import type { CreditStatusPayload } from "@/lib/upsell/credit-status";

export type CreditStatus = CreditStatusPayload;

/**
 * يقرأ حالة الكريدت من `/api/me/credit-status`.
 *
 * ⚠️ فشل الجلب لا يكسر الصفحة: `status` تبقى null و`error` يحمل السبب،
 * وكل مكوّنات الـ upsell تُخفي نفسها عند `status == null`.
 */
export function useCreditStatus() {
  const [status, setStatus] = useState<CreditStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/me/credit-status", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setStatus(data as CreditStatus);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setStatus(null);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return { status, loading, error, reload };
}
