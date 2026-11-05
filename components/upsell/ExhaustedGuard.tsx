"use client";

import { useEffect, useState } from "react";

import { useCreditStatus } from "@/lib/upsell/use-credit-status";
import { ExhaustedModal } from "./ExhaustedModal";

const DISMISS_KEY = "upsell:exhausted_dismissed_until";
const DISMISS_TTL_MS = 60 * 60 * 1000; // ساعة

/**
 * يفتح نافذة «خلصت الكريدت» تلقائيًا عندما يكون الرصيد صفرًا.
 *
 * ⚠️ هذا حجب على مستوى الواجهة (overlay)، وليس منعًا على مستوى المعالج:
 * الصفحات المستهدفة (/dashboard, /lesson) مكوّنات ضخمة، وتعديل معالجاتها
 * لتمرير الحالة مخاطرة كبيرة مقابل فائدة صفر — والخادم يرفض أصلًا الطلب
 * بـ 402 عند نفاد الرصيد. «استنى» يسمح بالتنقل دون حبس المستخدم.
 */
export function ExhaustedGuard() {
  const { status } = useCreditStatus();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!status || status.status !== "exhausted") return;
    try {
      const until = Number(sessionStorage.getItem(DISMISS_KEY) ?? "0");
      if (Number.isFinite(until) && until > Date.now()) return;
    } catch {
      // بلا sessionStorage: نعرض النافذة مرة واحدة في هذه الجلسة.
    }
    setOpen(true);
  }, [status]);

  const close = () => {
    setOpen(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_TTL_MS));
    } catch {
      // لا شيء.
    }
  };

  return <ExhaustedModal open={open} onClose={close} status={status} />;
}
