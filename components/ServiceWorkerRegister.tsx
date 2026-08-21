"use client";

import { useEffect } from "react";

/* بيسجّل السيرفس وركر (/sw.js) لكل المستخدمين عشان الأوفلاين يشتغل.
   قبل كده كان بيتسجّل بس لما حد يفعّل الإشعارات من الداشبورد، فالكاش
   ماكانش بيشتغل لمعظم الناس.

   بيتسجّل في الإنتاج بس: مع `next dev` السيرفس وركر بيتعارض مع الـ HMR
   وبيخزّن أصول قديمة، فبيبوّظ تجربة التطوير. عشان تجرّب الأوفلاين محلياً
   استخدم `npm run build && npm start`، أو الأسهل جرّب على نشر Vercel.

   بيرجّع null — مافيش أي حاجة في الشاشة. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      // updateViaCache: "none" → المتصفح مايستخدمش كاش HTTP وهو بيتأكد من
      // تحديثات ملف السيرفس وركر، فالنسخة الجديدة بتتلقّط بسرعة.
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((err) => {
          // مانوقعش الصفحة لو التسجيل فشل — بس نسجّل في الكونسول.
          console.error("Service worker registration failed:", err);
        });
    };

    // نسجّل بعد ما الصفحة تخلص تحميل عشان مانزاحمش أول رسم.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
