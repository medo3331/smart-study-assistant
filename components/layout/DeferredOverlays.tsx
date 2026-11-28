"use client";

/**
 * DeferredOverlays — الودجتس العائمة على مستوى الموقع، محمّلة بعد الترطيب.
 *
 * ⚡ الأداء: `app/layout.tsx` مكوّن سيرفر، والودجتس دي (دعم، جرس إشعارات،
 * توست الإعلانات، المساعد العائم) كانت بتدخل في **الحزمة الأساسية المشتركة**
 * لكل صفحة من صفحات الموقع (108 مسار) رغم إنها مش محتوى الصفحة ولا بتأثر
 * على الرسم الأول. بقت chunks منفصلة بتوصل بعد ما الصفحة تبقى تفاعلية.
 *
 * ملاحظة: `AudioProvider` و`QuranAudioProvider` **مش** هنا عن قصد — الصوت
 * لازم يفضل مركّب من أول لحظة عشان مايتقطعش مع التنقّل.
 */

import dynamic from "next/dynamic";

/* مفيش placeholders: كلهم position:fixed أو null UI، فمفيش layout shift. */
const noop = () => null;

const SupportWidget = dynamic(() => import("@/components/SupportWidget").then((m) => m.SupportWidget), {
  ssr: false,
  loading: noop,
});
const NotificationBell = dynamic(() => import("@/components/NotificationBell"), { ssr: false, loading: noop });
const AnnouncementToast = dynamic(() => import("@/components/AnnouncementToast"), { ssr: false, loading: noop });
const FloatingAssistant = dynamic(() => import("@/components/FloatingAssistant").then((m) => m.FloatingAssistant), {
  ssr: false,
  loading: noop,
});

export function DeferredOverlays() {
  return (
    <>
      <SupportWidget />
      <NotificationBell />
      <AnnouncementToast />
      <FloatingAssistant />
    </>
  );
}
