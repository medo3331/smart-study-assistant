"use client";

import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { PrayerTimesList } from "@/components/worship/PrayerTimesList";
import {
  WorshipChrome,
  useSharedWorshipData,
} from "@/components/worship/WorshipChrome";
import { usePrayerTimes } from "@/hooks/usePrayerTimes";
import { ArrowLeft, MapPin, Clock } from "lucide-react";

/**
 * Prayer Times Page — /worship/prayer-times
 *
 * مواقيت حقيقية من AlAdhan بموقع المستخدم وطريقة حسابه المحفوظة —
 * بدون أي بيانات وهمية. القاهرة fallback محلي بس لما مفيش إعدادات.
 */
export default function PrayerTimesPage() {
  return (
    <WorshipChrome>
      <PrayerTimesHome />
    </WorshipChrome>
  );
}

function PrayerTimesHome() {
  const shared = useSharedWorshipData();
  const settings = shared?.settings;

  const { data: prayerTimes, isLoading, error, refetch } = usePrayerTimes({
    latitude: settings?.latitude,
    longitude: settings?.longitude,
    timezone: settings?.timezone,
    calculationMethod: settings?.calculationMethod,
    madhab: settings?.madhab,
    enabled: !!settings,
  });

  if (!settings || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#7C5CFF]" />
        <span className="ml-3 text-[#9AA0C0]">جاري تحميل مواقيت الصلاة…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-[#FB923C]">⚠️ {error}</p>
        <button
          onClick={() => void refetch()}
          className="mt-4 rounded-lg bg-[#7C5CFF] px-4 py-2 text-white transition-colors hover:bg-[#6A4CE8]"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <Reveal index={0}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">مواقيت الصلاة</h1>
            <p className="mt-1 flex items-center gap-2 text-[#9AA0C0]">
              <MapPin size={14} aria-hidden />
              {prayerTimes?.location ?? settings.location?.city ?? "غير محدد"}
              <span className="text-[#9AA0C0]/60">•</span>
              <Clock size={14} aria-hidden />
              {settings.timezone}
            </p>
          </div>
          <Link
            href="/worship"
            className="flex items-center gap-1 text-sm text-[#B69CFF] transition-colors hover:text-[#7C5CFF]"
          >
            <ArrowLeft size={18} aria-hidden />
            <span>عباداتي</span>
          </Link>
        </div>
      </Reveal>

      {/* Prayer Times List */}
      <Reveal index={1}>
        {prayerTimes ? (
          <PrayerTimesList
            data={prayerTimes}
            onSettingsClick={() => {
              window.location.href = "/worship/settings";
            }}
          />
        ) : (
          <div className="py-12 text-center text-[#9AA0C0]">
            <p>جاري تحميل مواقيت الصلاة...</p>
          </div>
        )}
      </Reveal>

      {/* Info Card */}
      <Reveal index={2}>
        <GlassCard className="p-6">
          <h3 className="mb-4 text-lg font-bold text-white">حول مواقيت الصلاة</h3>
          <div className="space-y-3 leading-relaxed text-[#C7CBE6]">
            <p>
              تُحسب مواقيت الصلاة بناءً على موقعك الجغرافي وطريقة الحساب
              المعتمدة في إعداداتك
              {settings.calculationMethod === "egyptian"
                ? " (الحالية: الهيئة المصرية للمساحة)"
                : ""}
              . غيّر الموقع أو الطريقة من صفحة الإعدادات وستنعكس هنا فورًا.
            </p>
            <p>
              يُنصح بتفعيل الإشعارات لتلقي تنبيهات قبل كل صلاة.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#7C5CFF]/15 px-3 py-1 text-xs text-[#B69CFF]">
                تنبيهات الصلاة
              </span>
              <span className="rounded-full bg-[#2DD4BF]/15 px-3 py-1 text-xs text-[#2DD4BF]">
                صوت الأذان
              </span>
              <span className="rounded-full bg-[#FB923C]/15 px-3 py-1 text-xs text-[#FB923C]">
                تعديل يدوي
              </span>
              <span className="rounded-full bg-[#B69CFF]/15 px-3 py-1 text-xs text-[#B69CFF]">
                طريقة الحساب
              </span>
            </div>
          </div>
        </GlassCard>
      </Reveal>
    </>
  );
}
