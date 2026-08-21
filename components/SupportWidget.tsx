"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

// الرقم الافتراضي هو نفس واتساب التواصل الموجود في lib/site-links.ts.
// تقدر تغيّره في Vercel بمتغير NEXT_PUBLIC_SUPPORT_WHATSAPP كرابط wa.me كامل.
const SUPPORT_WHATSAPP =
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.trim() ||
  process.env.NEXT_PUBLIC_WHATSAPP_URL?.trim() ||
  "https://wa.me/201204556797";

function whatsappLink(details: string) {
  const message = [
    "أهلاً، أحتاج مساعدة في موقع ماجيكلي.",
    details.trim() ? `المشكلة: ${details.trim()}` : null,
    typeof window !== "undefined" ? `الصفحة: ${window.location.pathname}` : null,
  ].filter(Boolean).join("\n");

  const separator = SUPPORT_WHATSAPP.includes("?") ? "&" : "?";
  return `${SUPPORT_WHATSAPP}${separator}text=${encodeURIComponent(message)}`;
}

/** قناة دعم مباشرة على واتساب؛ لا تجمع بريدًا ولا ترسل بيانات إلى خادم الموقع. */
export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState("");
  const pathname = usePathname();

  // في الداشبورد الرئيسي (/dashboard) فيه زرار "اسأل ماجيكلي" (الشات بوت)
  // في نفس الركن تحت-شمال + ودجت الرأي على اليمين، فبنخفي دعم واتساب هنا
  // عشان مايتراكبش مع زرار الشات بوت. بيفضل ظاهر في كل باقي الصفحات
  // (اللاندينج، الدخول، الدروس، صفحات الداشبورد الفرعية، إلخ).
  if (pathname === "/dashboard") return null;

  return (
    <div className="fixed end-4 bottom-4 z-40 sm:end-6" dir="rtl">
      {open && (
        <section className="sheet-card card-lift mb-3 w-[min(22rem,calc(100vw-2rem))] p-4" aria-labelledby="support-title">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 id="support-title" className="text-sm font-bold text-ink">محتاج مساعدة؟</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">اكتب اللي حصل، ثم ابعته لنا مباشرة على واتساب.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="mono px-1 text-ink-soft hover:text-ink" aria-label="إغلاق الدعم">✕</button>
          </div>
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            className="field min-h-24 w-full resize-none text-xs"
            placeholder="مثال: بعد ما ضغطت على دخول ظهرت رسالة…"
            maxLength={1000}
          />
          <p className="my-3 text-[11px] leading-relaxed text-ink-soft">سنضيف مسار الصفحة للرسالة لتسهيل حل المشكلة، ولن نرسل كلمات السر أو المفاتيح.</p>
          <a href={whatsappLink(details)} target="_blank" rel="noreferrer" className="btn btn-marker block w-full py-2 text-center text-sm">
            <span aria-hidden>💬</span> تواصل على واتساب
          </a>
        </section>
      )}
      <button type="button" onClick={() => setOpen(true)} className="btn btn-quiet rounded-full px-4 py-2 text-sm shadow-lg" aria-expanded={open}>
        <span aria-hidden>🛟</span> مساعدة
      </button>
    </div>
  );
}
