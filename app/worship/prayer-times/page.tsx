"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { PrayerTimesList } from "@/components/worship/PrayerTimesList";
import {
  WorshipChrome,
  useSharedWorshipData,
} from "@/components/worship/WorshipChrome";
import { useLivePrayerTimes } from "@/hooks/useLivePrayerTimes";
import { hasLocationChangedSignificantly } from "@/lib/islamic/prayer-times/live";
import { ArrowLeft, MapPin, Clock, Navigation } from "lucide-react";

/**
 * Prayer Times Page — /worship/prayer-times
 *
 * مواقيت حقيقية من AlAdhan بموقع المستخدم وطريقة حسابه المحفوظة —
 * بدون أي بيانات وهمية. القاهرة fallback محلي بس لما مفيش إعدادات.
 * التحديث حيّ كل دقيقة (useLivePrayerTimes) + تحديث فوري لو الموقع الفعلي اتغير.
 */
export default function PrayerTimesPage() {
  return (
    <WorshipChrome>
      <PrayerTimesHome />
    </WorshipChrome>
  );
}

type LocationRequestState =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "success"; latitude: number; longitude: number }
  | { kind: "denied" }
  | { kind: "unsupported" };

function PrayerTimesHome() {
  const shared = useSharedWorshipData();
  const settings = shared?.settings;
  // تنقّل client-side — window.location.href كان بيعمل full page reload
  // وبيقطع التلاوة الشغّالة (المشغّل معاه في الذاكرة بيفضى).
  const router = useRouter();
  const [locationRequest, setLocationRequest] = useState<LocationRequestState>({ kind: "idle" });

  // التحديث الحيّ: كل دقيقة + متابعة الموقع الفعلي (تحديث فوري عند تجاوز العتبة).
  // المنطقة الزمنية من settings.timezone — نفس مصدر الحقيقة في worship_settings.
  const { data: prayerTimes, isLoading, error, refetch } = useLivePrayerTimes({
    latitude: settings?.latitude,
    longitude: settings?.longitude,
    timezone: settings?.timezone,
    calculationMethod: settings?.calculationMethod,
    madhab: settings?.madhab,
    enabled: !!settings,
    trackLocationChanges: true,
  });

  if (!settings || (isLoading && !prayerTimes)) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#10B981]" />
        <span className="ml-3 text-[#9AA0C0]">جاري تحميل مواقيت الصلاة…</span>
      </div>
    );
  }

  if (error && !prayerTimes) {
    return (
      <div className="py-12 text-center">
        <p className="text-[#FB923C]">⚠️ {error}</p>
        <button
          onClick={() => void refetch()}
          className="mt-4 rounded-lg bg-[#10B981] px-4 py-2 text-white transition-colors hover:bg-[#059669]"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  /** زرار «استخدم موقعي» — الرفض يرجع لآخر موقع محفوظ (أو القاهرة) بهدوء. */
  const requestCurrentLocation = () => {
    if (!shared || !navigator.geolocation) {
      setLocationRequest({ kind: "unsupported" });
      return;
    }
    setLocationRequest({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const current = { latitude: settings.latitude, longitude: settings.longitude };
        const next = { latitude, longitude };
        // لو الموقع الجديد قريب من المحفوظ (تحت العتبة) مش محتاجين نغيّر حاجة.
        if (!hasLocationChangedSignificantly(current, next)) {
          setLocationRequest({ kind: "success", latitude, longitude });
          return;
        }
        const timezone = settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const nextLocation = {
          ...settings.location,
          city: "",
          country: "",
          latitude,
          longitude,
          timezone,
        };
        shared.updateSettingsLocal({
          location: nextLocation,
          latitude,
          longitude,
          timezone,
          locationMode: "automatic",
        });
        setLocationRequest({ kind: "success", latitude, longitude });
      },
      // الرفض/الفشل: بنرجع لآخر موقع محفوظ (أو القاهرة افتراضيًا) برسالة لطيفة.
      () => setLocationRequest({ kind: "denied" }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const locationLabel =
    prayerTimes?.location ?? settings.location?.city ?? "غير محدد";

  return (
    <>
      {/* Header */}
      <Reveal index={0}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">مواقيت الصلاة</h1>
            <p className="mt-1 flex items-center gap-2 text-[#9AA0C0]">
              <MapPin size={14} aria-hidden />
              {locationLabel}
              <span className="text-[#9AA0C0]/60">•</span>
              <Clock size={14} aria-hidden />
              {settings.timezone}
            </p>
          </div>
          <Link
            href="/worship"
            className="flex items-center gap-1 text-sm text-[#6EE7B7] transition-colors hover:text-[#10B981]"
          >
            <ArrowLeft size={18} aria-hidden />
            <span>عباداتي</span>
          </Link>
        </div>
      </Reveal>

      {/* Location row — زرار الموقع + رسائل الحالة */}
      <Reveal index={1}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={requestCurrentLocation}
            disabled={locationRequest.kind === "locating"}
            className="flex items-center gap-2 rounded-xl border border-[#10B981]/30 px-4 py-2 text-sm text-[#6EE7B7] transition-colors hover:bg-[#10B981]/10 disabled:opacity-60"
          >
            <Navigation size={16} aria-hidden />
            {locationRequest.kind === "locating" ? "جاري تحديد موقعك…" : "استخدم موقعي"}
          </button>
          <p aria-live="polite" className="text-xs text-[#9AA0C0]">
            {locationRequest.kind === "success" &&
              `تم تحديث موقعك: ${locationRequest.latitude.toFixed(4)}, ${locationRequest.longitude.toFixed(4)}`}
            {locationRequest.kind === "denied" &&
              "تم رفض إذن الموقع — بنكمل بآخر موقع محفوظ (أو القاهرة افتراضيًا)."}
            {locationRequest.kind === "unsupported" &&
              "المتصفح مش بيدعم تحديد الموقع — عدّل الإحداثيات يدويًا من الإعدادات."}
          </p>
        </div>
      </Reveal>

      {/* Prayer Times List */}
      <Reveal index={2}>
        {prayerTimes ? (
          <PrayerTimesList
            data={prayerTimes}
            onSettingsClick={() => {
              router.push("/worship/settings");
            }}
          />
        ) : (
          <div className="py-12 text-center text-[#9AA0C0]">
            <p>جاري تحميل مواقيت الصلاة...</p>
          </div>
        )}
      </Reveal>

      {/* Info Card */}
      <Reveal index={3}>
        <GlassCard className="p-6">
          <h3 className="mb-4 text-lg font-bold text-white">حول مواقيت الصلاة</h3>
          <div className="space-y-3 leading-relaxed text-[#C7CBE6]">
            <p>
              تُحسب مواقيت الصلاة بناءً على موقعك الجغرافي وطريقة الحساب
              المعتمدة في إعداداتك
              {settings.calculationMethod === "egyptian"
                ? " (الحالية: الهيئة المصرية للمساحة)"
                : ""}
              . المواقيت بتتحدث تلقائيًا كل دقيقة، ولو انتقلت لمكان جديد
              بعيد (~أكثر من كيلومتر) بتتحدث فورًا.
            </p>
            <p>
              يُنصح بتفعيل الإشعارات لتلقي تنبيهات قبل كل صلاة.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#10B981]/15 px-3 py-1 text-xs text-[#6EE7B7]">
                تنبيهات الصلاة
              </span>
              <span className="rounded-full bg-[#34D399]/15 px-3 py-1 text-xs text-[#34D399]">
                صوت الأذان
              </span>
              <span className="rounded-full bg-[#FB923C]/15 px-3 py-1 text-xs text-[#FB923C]">
                تحديث كل دقيقة
              </span>
              <span className="rounded-full bg-[#6EE7B7]/15 px-3 py-1 text-xs text-[#6EE7B7]">
                طريقة الحساب
              </span>
            </div>
          </div>
        </GlassCard>
      </Reveal>
    </>
  );
}
