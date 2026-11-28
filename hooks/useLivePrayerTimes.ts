"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PrayerTimesData } from "@/lib/islamic/types";
import { convertToLegacyFormat } from "@/lib/islamic/prayer-times";
import { dateInTimeZone } from "@/lib/islamic/prayer-times/timezone";
import {
  hasLocationChangedSignificantly,
  type GeoCoordinates,
} from "@/lib/islamic/prayer-times/live";

interface UseLivePrayerTimesOptions {
  latitude?: number;
  longitude?: number;
  /** منطقة المستخدم الزمنية — نفس مصدر الحقيقة في settings.timezone (worship_settings). */
  timezone?: string;
  calculationMethod?: string;
  madhab?: string;
  /** دورية إعادة الجلب بالمللي ثانية — افتراضيًا كل دقيقة. */
  refreshIntervalMs?: number;
  enabled?: boolean;
  /**
   * متابعة الموقع الفعلي بالجيو-لوكيشن وتحديث المواقيت فورًا لو المستخدم
   * اتحرك أكثر من العتبة (~0.01°). الرفض/الفشل بيتجاهل بهدوء ويفضل
   * آخر موقع محفوظ شغّال.
   */
  trackLocationChanges?: boolean;
}

interface UseLivePrayerTimesReturn {
  data: PrayerTimesData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** الإحداثيات الفعّالة المستخدمة في آخر حساب (قد تختلف عن المحفوظة أثناء الحركة). */
  liveCoordinates: GeoCoordinates | null;
}

/**
 * Hook موحّد لمواقيت الصلاة الحيّة:
 *
 * ① يعيد حساب مواقيت اليوم من الإحداثيات كل دقيقة (setInterval 60s) —
 *    والسيرفر بيعيد فقط تحديد «الصلاة القادمة» من الكاش بدون نداء AlAdhan جديد.
 * ② لو الموقع الفعلي اتغير عن المحفوظ بأكثر من العتبة — يحدّث المواقيت فورًا
 *    (watchPosition) لأن مفتاح الكاش بيتبني من الإحداثيات الجديدة.
 * ③ لما المستخدم يرجع للتبويب بعد غياب — يعيد الحساب فورًا من Date.now()
 *    (تعويض drift) بدل الانتظار لدورة المؤقت.
 * ④ التاريخ المحلي بيتحسب في كل جلب — يعني تجاوز منتصف الليل بيجيب يوم جديد.
 */
export function useLivePrayerTimes(
  options: UseLivePrayerTimesOptions = {},
): UseLivePrayerTimesReturn {
  const {
    latitude,
    longitude,
    timezone = "Africa/Cairo",
    calculationMethod = "egyptian",
    madhab = "shafi",
    refreshIntervalMs = 60_000,
    enabled = true,
    trackLocationChanges = false,
  } = options;

  const [data, setData] = useState<PrayerTimesData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** الإحداثيات الفعّالة — بتتبدل بس لما التغيير يعدي عتبة تغيّر الموقع. */
  const [activeCoordinates, setActiveCoordinates] = useState<GeoCoordinates | null>(
    latitude != null && longitude != null ? { latitude, longitude } : null,
  );

  // مزامنة الإحداثيات المحفوظة (settings) → الفعّالة، فقط عند تغيّر ملموس.
  // لو الفرق تحت العتبة بنحتفظ بالفعّالة عشان مفيش إعادة جلب بلا داعي،
  // وكمان عشان المتابعة الحيّة (watchPosition) ماتتعارضش مع الإعدادات.
  useEffect(() => {
    if (!enabled || latitude == null || longitude == null) {
      setActiveCoordinates(null);
      return;
    }
    const saved = { latitude, longitude };
    setActiveCoordinates((prev) =>
      !prev || hasLocationChangedSignificantly(prev, saved) ? saved : prev,
    );
  }, [latitude, longitude, enabled]);

  const fetchPrayerTimes = useCallback(async () => {
    if (!enabled || !activeCoordinates) return;

    setIsLoading(true);
    setError(null);

    try {
      // التاريخ المحلي يتحسب لحظة الجلب — عشان التجاوز لليوم الجديد يظبط نفسه.
      const localDate = dateInTimeZone(new Date(), timezone);
      const params = new URLSearchParams({
        latitude: activeCoordinates.latitude.toString(),
        longitude: activeCoordinates.longitude.toString(),
        timezone,
        calculationMethod,
        madhab,
        date: localDate,
      });

      // نفس مسار مركز العبادات الموجود — الـ route بيستخدم getPrayerTimesForDate
      // (AlAdhan + كاش سيرفر مفتاحه بيشمل الإحداثيات المقربة).
      const response = await fetch(`/api/worship/prayer-times?${params.toString()}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch prayer times");
      }

      setData(convertToLegacyFormat(result.data));
    } catch (err) {
      // عند الفشل بنحتفظ بآخر بيانات صحيحة معروضة — مفيش فراغ فجائي.
      setError(err instanceof Error ? err.message : "Failed to fetch prayer times");
    } finally {
      setIsLoading(false);
    }
  }, [activeCoordinates, timezone, calculationMethod, madhab, enabled]);

  // الجلب عند التركيب وعند أي تغيير في مدخلات الحساب.
  useEffect(() => {
    void fetchPrayerTimes();
  }, [fetchPrayerTimes]);

  // المؤقت الدوري (كل دقيقة) + تعويض drift عند الرجوع للتبويب.
  const fetchRef = useRef(fetchPrayerTimes);
  useEffect(() => {
    fetchRef.current = fetchPrayerTimes;
  }, [fetchPrayerTimes]);

  useEffect(() => {
    if (!enabled || !activeCoordinates) return;

    const interval = setInterval(() => void fetchRef.current(), refreshIntervalMs);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, activeCoordinates, refreshIntervalMs]);

  // متابعة الموقع الفعلي — تحديث فوري عند تجاوز عتبة التغيّر.
  useEffect(() => {
    if (!trackLocationChanges || !enabled || typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const actual = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setActiveCoordinates((prev) =>
          !prev || hasLocationChangedSignificantly(prev, actual) ? actual : prev,
        );
      },
      // الرفض/الفشل: بنفضل آخر موقع محفوظ شغّال بدون إزعاج.
      () => undefined,
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [trackLocationChanges, enabled]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchPrayerTimes,
    liveCoordinates: activeCoordinates,
  };
}
