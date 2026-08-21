"use client";

/* ==========================================================================
   توست — ردّ الإجراءات

   المشروع مافيهوش نظام توست، والصفحتين محتاجين يقولوا «تم الشرا» و«اتلبس»
   و«الرصيد مش كفاية». الإشعارات دي مش أخطاء صفحة فـ `DataNotice` مش
   مناسب (ده بينزل في وسط المحتوى وبيفضل).

   ⚠️ `role="status"` مش `alert`: النجاح مش مقاطعة. الفشل بيتقال بنفس
   العنصر لكن بـ `aria-live="assertive"` عشان قارئ الشاشة يقوله فوراً.
   ========================================================================== */

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, AlertCircle } from "lucide-react";

export type ToastMsg = { id: number; text: string; ok: boolean };

export function Toast({
  msg,
  onDone,
}: {
  msg: ToastMsg | null;
  onDone: () => void;
}) {
  /* بيختفي لوحده. الوقت أطول للفشل: رسالة الغلط محتاجة تتقرا، ورسالة
     النجاح المستخدم شايف نتيجتها في الشاشة أصلاً. */
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, msg.ok ? 2200 : 3600);
    return () => clearTimeout(t);
  }, [msg, onDone]);

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] pointer-events-none px-4 w-full max-w-sm"
      role="status"
      aria-live={msg && !msg.ok ? "assertive" : "polite"}
    >
      <AnimatePresence>
        {msg && (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="sheet-card card-lift px-4 py-2.5 flex items-center gap-2.5"
          >
            {msg.ok ? (
              <Check className="w-4 h-4 shrink-0 text-ink" aria-hidden />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-ink" aria-hidden />
            )}
            <span className="text-[13px] text-ink leading-snug">{msg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
