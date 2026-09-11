"use client";
/* eslint-disable react-hooks/set-state-in-effect -- مزامنة مقصودة مع أنظمة
   خارجية (PushManager/Notification/SW) لا يمكن قراءتها أثناء الـ SSR. */

import { useState, useEffect, useCallback } from "react";

/* Hook موحّد لاشتراكات الـ Web Push.
   بيستخدمه زرار "تفعيل تنبيهات حتى لو التطبيق مقفول" في الداشبورد،
   وأي شاشة تانية تحتاج نفس الوظيفة (الإعدادات، أونبوردنج...).

   ملاحظة مقصودة: التسجيل في الـ Service Worker بيحصل لحظة الاشتراك بس،
   مش عند mount — عشان `next dev` بيتعارض مع الـ SW (HMR). التسجيل العام
   للإنتاج بيتم من ServiceWorkerRegister في الـ layout. */

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration("/")) || null;
  } catch {
    return null;
  }
}

export type PushSubscribeStatus =
  | "subscribed"
  | "unsupported"
  | "no-vapid-key"
  | "permission-denied"
  | "save-failed"
  | "failed";

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission | "unsupported">("default");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setIsSupported(supported);
    if (!supported) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    // حالة الاشتراك الحالية من غير ما نسجّل SW جديد
    getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setIsSubscribed(!!sub))
      .catch(() => {});
  }, []);

  const subscribe = useCallback(async (): Promise<PushSubscribeStatus> => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      return "unsupported";
    }
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return "no-vapid-key";

    setLoading(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return "permission-denied";

      const registration =
        (await getRegistration()) ||
        (await navigator.serviceWorker.register("/sw.js"));

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        // ⚠️ لازم تحويل base64url → Uint8Array: تمرير المفتاح كنص خام
        // بيضرب "applicationServerKey is not valid" في Chrome.
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription,
          deviceInfo: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
          },
        }),
      });

      if (!res.ok) return "save-failed";
      setIsSubscribed(true);
      return "subscribed";
    } catch (err) {
      console.error("Web Push subscribe failed:", err);
      return "failed";
    } finally {
      setLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const registration = await getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) {
        setIsSubscribed(false);
        return true;
      }
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      // نعطّل الصف في السيرفر (best-effort — لو فشل، أول إرسال هيلاقي
      // 410 ويعطّله لوحده من محرك web-push).
      try {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      } catch {}
      setIsSubscribed(false);
      return true;
    } catch (err) {
      console.error("Web Push unsubscribe failed:", err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { isSupported, isSubscribed, permission, loading, subscribe, unsubscribe };
}
