"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSharedWorshipData } from "@/components/worship/WorshipChrome";
import { useTodayPrayerTimes } from "@/hooks/usePrayerTimes";
import { todayUtc } from "@/lib/worship-data";
import {
  getNotificationPermission,
  markFiredKey,
  pruneFiredKeys,
  readFiredKeys,
  sendWorshipNotification,
} from "@/lib/islamic/notifications";

const PRAYER_AR: Record<string, string> = {
  fajr: "الفجر",
  dhuhr: "الظهر",
  asr: "العصر",
  maghrib: "المغرب",
  isha: "العشاء",
};

const PRAYER_IDS = Object.keys(PRAYER_AR);

/** فتحة السماح للتذكير المتأخر — لو الصفحة اتفتحت متأخر عن الموعد أكتر من كده بنسجّله صامت. */
const FIRE_GRACE_MS = 3 * 60 * 1000;

/**
 * مجدول تذكيرات مركز العبادات — بيتشغّل جوه WorshipChrome على كل الصفحات:
 * • تنبيه قبل كل صلاة (reminderMinutes) + إشعار أذان عند دخول الوقت
 * • تذكير أذكار الصباح (بعد الفجر) والمساء (بعد العصر) والنوم
 * • تذكير ورد القرآن لو لسه متصلّحش
 * بيتخزّن المفتاح المُطلق لكل يوم في localStorage فمفيش تكرار.
 */
export function WorshipReminders() {
  const shared = useSharedWorshipData();
  const settings = shared?.settings;
  const progress = shared?.progress;

  const { data: prayerTimes } = useTodayPrayerTimes(
    settings?.latitude,
    settings?.longitude,
    settings?.timezone,
    settings?.calculationMethod,
    settings?.madhab,
  );

  const settingsRef = useRef(settings);
  const progressRef = useRef(progress);
  const prayerTimesRef = useRef(prayerTimes);

  // مزامنة الـ refs بعد كل رندر (مش أثناءه) — الـ tick بيقرأها خارج الرندر.
  useEffect(() => {
    settingsRef.current = settings;
    progressRef.current = progress;
    prayerTimesRef.current = prayerTimes;
  });

  const tick = useCallback(() => {
    const currentSettings = settingsRef.current;
    if (!currentSettings) return;

    const wantsPrayerAlerts =
      currentSettings.prayerNotifications || currentSettings.adhanEnabled;
    const wantsAdhkarAlerts =
      currentSettings.morningAdhkarReminder ||
      currentSettings.eveningAdhkarReminder ||
      currentSettings.sleepAdhkarReminder;
    if (!wantsPrayerAlerts && !wantsAdhkarAlerts) return;
    if (getNotificationPermission() !== "granted") return;

    const day = todayUtc();
    const fired = readFiredKeys(day);
    const now = Date.now();

    const fire = (key: string, dueAt: number, title: string, body: string) => {
      if (fired.has(key) || now < dueAt) return;
      if (now - dueAt > FIRE_GRACE_MS) {
        markFiredKey(day, key);
        return;
      }
      sendWorshipNotification(title, body);
      markFiredKey(day, key);
    };

    const times = prayerTimesRef.current?.times;
    if (times && wantsPrayerAlerts) {
      for (const prayer of times) {
        const id = prayer.name.toLowerCase();
        if (!PRAYER_IDS.includes(id)) continue;
        const arabicName = PRAYER_AR[id];

        if (currentSettings.prayerNotifications) {
          const reminderAt = prayer.timestamp - currentSettings.reminderMinutes * 60_000;
          fire(
            `${id}-reminder`,
            reminderAt,
            `اقترب وقت صلاة ${arabicName} 🕐`,
            `باقي ${currentSettings.reminderMinutes} دقيقة — جهّز نفسك للصلاة.`,
          );
        }

        if (currentSettings.adhanEnabled) {
          fire(
            `${id}-adhan`,
            prayer.timestamp,
            `حان الآن أذان صلاة ${arabicName} 🕌`,
            "حيّ على الصلاة — حيّ على الفلاح.",
          );
        }
      }
    }

    const currentProgress = progressRef.current;
    const adhkarDone = (category: string) =>
      !!currentProgress?.adhkar[category]?.completed;

    const adhkarReminders: Array<{
      category: string;
      enabled: boolean;
      fallbackHour: number;
      fallbackMinute: number;
      title: string;
    }> = [
      {
        category: "morning",
        enabled: currentSettings.morningAdhkarReminder,
        fallbackHour: 7,
        fallbackMinute: 0,
        title: "حان وقت أذكار الصباح 🌅",
      },
      {
        category: "evening",
        enabled: currentSettings.eveningAdhkarReminder,
        fallbackHour: 16,
        fallbackMinute: 0,
        title: "حان وقت أذكار المساء 🌆",
      },
      {
        category: "sleep",
        enabled: currentSettings.sleepAdhkarReminder,
        fallbackHour: 21,
        fallbackMinute: 30,
        title: "حان وقت أذكار النوم 🌙",
      },
    ];

    for (const reminder of adhkarReminders) {
      if (!reminder.enabled || adhkarDone(reminder.category)) continue;
      const anchorPrayer =
        reminder.category === "morning"
          ? times?.find((p) => p.name.toLowerCase() === "fajr")
          : times?.find((p) => p.name.toLowerCase() === "asr");
      const dueAt = anchorPrayer
        ? anchorPrayer.timestamp + 45 * 60_000
        : dueAtWallClock(reminder.fallbackHour, reminder.fallbackMinute);
      fire(
        `adhkar-${reminder.category}`,
        dueAt,
        reminder.title,
        "افتح صفحة الأذكار وأتمّ ورد اليوم — لك +3 عملات عند الإكمال.",
      );
    }

    const quranTarget = currentSettings.quranDailyTarget ?? 0;
    const quranRead = currentProgress?.quran.dailyCount ?? 0;
    if (quranTarget > 0 && quranRead < quranTarget) {
      fire(
        "quran-wird",
        dueAtWallClock(20, 0),
        "ورد القرآن لسه مستنيك 📖",
        `قرأت ${quranRead} من ${quranTarget} آية اليوم — كمّل وردك (+5 عملات).`,
      );
    }

    pruneFiredKeys();
  }, []);

  useEffect(() => {
    const interval = setInterval(tick, 20_000);
    tick();
    return () => clearInterval(interval);
  }, [tick]);

  return null;
}

/** إيجاد timestamp لساعة/دقيقة محددة النهارده (بتوقيت الجهاز). */
function dueAtWallClock(hour: number, minute: number): number {
  const due = new Date();
  due.setHours(hour, minute, 0, 0);
  return due.getTime();
}
