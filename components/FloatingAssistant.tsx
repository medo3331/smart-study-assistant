"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, MessageCircle, X } from "lucide-react";
import { useState } from "react";

const pageHint = (pathname: string) => {
  if ((pathname?.startsWith("/lesson/") ?? false)) return "في نقطة مش واضحة في الدرس؟";
  if ((pathname?.startsWith("/dashboard") ?? false)) return "نراجع خطتك النهارده؟";
  if ((pathname?.startsWith("/assessment") ?? false)) return "محتاج مساعدة في بناء الخطة؟";
  return "محتاج مساعدة في مذاكرتك؟";
};

export function FloatingAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname === "/chat") return null;
  // 🎴 على صفحات الدروس: نفس الزر بنسخة بنفسجية موحّدة مع نظام الداشبورد/الدرس الجديد
  const onLesson = pathname?.startsWith("/lesson/") ?? false;
  const fabCls = onLesson
    ? "grid h-12 w-12 place-items-center rounded-full bg-[#7C5CFF] text-white shadow-[0_8px_26px_rgba(124,92,255,0.5)] transition hover:scale-105 hover:bg-[#8E72FF]"
    : "grid h-12 w-12 place-items-center rounded-full bg-ink text-paper-2 shadow-lg transition hover:scale-105 motion-safe:animate-[pulse_4s_ease-in-out_infinite]";

  return <div className="fixed start-4 bottom-4 z-40 sm:start-6" dir="rtl">
    {open && <section className="sheet-card card-lift mb-3 w-64 p-4" aria-labelledby="floating-assistant-title"><button type="button" onClick={() => setOpen(false)} className="absolute start-3 top-3 text-ink-soft hover:text-ink" aria-label="إغلاق"><X size={15} /></button><Bot className="mb-3 text-marker" size={25} aria-hidden /><h2 id="floating-assistant-title" className="text-sm font-bold">{pageHint(pathname ?? "")}</h2><p className="mt-1 text-xs leading-relaxed text-ink-soft">ماجيكلي يقدر يشرح، يراجع، أو يختبرك من نفس خطتك.</p><Link href="/chat" className="btn btn-marker mt-4 w-full text-sm"><MessageCircle size={16} /> افتح المساعد</Link></section>}
    <button type="button" onClick={() => setOpen((value) => !value)} className={fabCls} aria-label="افتح مساعد ماجيكلي" aria-expanded={open}><Bot size={22} /></button>
  </div>;
}
