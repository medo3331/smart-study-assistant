"use client";
/* eslint-disable react-hooks/set-state-in-effect -- المزامنة مع
   beforeinstallprompt وmatchMedia وlocalStorage مقصودة (client-only APIs). */

import { useState, useEffect } from "react";
import { Download, Share, X, Sparkles } from "lucide-react";

/* بانر تثبيت التطبيق (PWA) — بيظهر تلقائياً على الموبايل.
   - أندرويد/Chrome: بيلتقط حدث beforeinstallprompt وبيعرض زرار تثبيت فعلي.
   - iOS/Safari: مافيش beforeinstallprompt، فبيعرض تعليمات "مشاركة ← إضافة
     للشاشة الرئيسية" بدل الزرار.
   - لو التطبيق مثبّت أصلاً (display-mode: standalone) مابيظهرش خالص.
   - الرفض بيتحفظ في localStorage عشان مانزنّش على المستخدم كل زيارة.

   متركّب مرة واحدة في app/layout.tsx، وبيستخدم توكنز الثيم (sheet-card،
   text-ink...) عشان يليق على الفاتح والغامق والباليتات. */

const DISMISS_KEY = "pwa_install_dismissed_v1";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPromptBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // مثبّت بالفعل؟ (شامل iOS standalone عبر navigator)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // iOS مابيطلعش الحدث ده أبداً، فبنعرض التعليمات مباشرة
    if (isIosDevice) setIsVisible(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsVisible(false);
        localStorage.setItem(DISMISS_KEY, "installed");
      }
    } catch {
      /* المستخدم قفل الديالوج — نسيب البانر ظاهراً */
    }
    setDeferredPrompt(null);
  };

  const dismissBanner = () => {
    setIsVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "dismissed");
    } catch {}
  };

  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-x-4 bottom-4 z-50 md:inset-x-auto md:end-8 md:bottom-8 md:w-full md:max-w-md"
      dir="rtl"
      role="dialog"
      aria-label="تثبيت تطبيق ماجيكلي"
    >
      <div className="sheet-card card-lift flex items-start justify-between gap-3 p-4 text-start">
        <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-[var(--accent)] text-white shadow-lg">
          <Sparkles className="h-6 w-6" aria-hidden />
        </div>

        <div className="flex-1">
          <h4 className="mb-1 text-sm font-bold text-ink">ثبّت تطبيق ماجيكلي 📲</h4>
          <p className="text-xs leading-relaxed text-ink-soft">
            {isIOS
              ? "اضغط زر المشاركة ثم اختر «إضافة إلى الشاشة الرئيسية» للوصول السريع والمذاكرة بدون إنترنت."
              : "ثبّت التطبيق على هاتفك لتجربة مذاكرة أسرع وتنبيهات فورية بمواعيد دروسك!"}
          </p>

          <div className="mt-3 flex items-center gap-2">
            {!isIOS ? (
              <button
                type="button"
                onClick={handleInstallClick}
                disabled={!deferredPrompt}
                className="btn btn-marker px-4 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Download className="h-3.5 w-3.5" aria-hidden /> تثبيت الآن
                </span>
              </button>
            ) : (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-rule bg-[var(--card-secondary)] px-2.5 py-1.5 text-[11px] font-semibold text-ink">
                <Share className="h-3.5 w-3.5" aria-hidden />
                زر المشاركة ← إضافة للشاشة الرئيسية
              </div>
            )}
            <button
              type="button"
              onClick={dismissBanner}
              className="px-3 py-2 text-xs text-ink-soft transition-colors hover:text-ink"
            >
              لاحقاً
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={dismissBanner}
          className="p-1 text-ink-soft transition-colors hover:text-ink"
          aria-label="إغلاق بانر التثبيت"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
