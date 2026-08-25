import { get } from "http";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const UPSTREAM = "https://mp3quran.net/api/v1/timingsByCity";
const UPSTREAM_TIMEOUT_MS = 8000;
const CACHE_SECONDS = 86400;

const DEFAULT_CITY = "Cairo";
const DEFAULT_COUNTRY = "Egypt";

export const GET = async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const city = searchParams.get("city") || DEFAULT_CITY;
  const country = searchParams.get("country") || DEFAULT_COUNTRY;
  const latitude = searchParams.get("latitude")
    ? parseFloat(searchParams.get("latitude")!)
    : undefined;
  const longitude = searchParams.get("longitude")
    ? parseFloat(searchParams.get("longitude")!)
    : undefined;
  const timezone = searchParams.get("timezone") || "Africa/Cairo";

  try {
    let upstreamUrl: string;
    if (latitude && longitude) {
      upstreamUrl = `${UPSTREAM}?city=${encodeURIComponent(`${latitude},${longitude}`)}&country=${encodeURIComponent(country)}`;
    } else {
      upstreamUrl = `${UPSTREAM}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}`;
    }

    const res = await fetch(upstreamUrl, {
      next: { revalidate: CACHE_SECONDS },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`upstream returned ${res.status}`);

    const data = await res.json();

    const times: Record<string, string> = {
      fajr: data?.timings?.fajr || "05:00",
      shuruq: data?.timings?.sunrise || "06:00",
      dhuhur: data?.timings?.dhuhr || "12:00",
      asr: data?.timings?.asr || "15:00",
      maghrib: data?.timings?.maghrib || "17:30",
      isha: data?.timings?.isha || "18:30",
    };

    const hijriDate = data?.date?.hijri?.format || data?.date?.hijri?.date || "1448-01-01";

    return NextResponse.json(
      {
        success: true,
        times,
        hijriDate,
        city: city || DEFAULT_CITY,
        timezone,
      },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400`,
        },
      }
    );
  } catch (error: any) {
    const formatTime = (minutes: number): string => {
      return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
        minutes % 60
      ).padStart(2, "0")}`;
    };

    const localTimes: Record<string, number> = {
      fajr: 540,
      sunrise: 600,
      dhuhr: 660,
      asr: 720,
      maghrib: 840,
      isha: 900,
    };

    const times: Record<string, string> = {
      fajr: formatTime(localTimes.fajr),
      shuruq: formatTime(localTimes.sunrise),
      dhuhur: formatTime(localTimes.dhuhr),
      asr: formatTime(localTimes.asr),
      maghrib: formatTime(localTimes.maghrib),
      isha: formatTime(localTimes.isha),
    };

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    let nextPrayer: { name: string; time: string; timestamp: number } | null = null;
    let nextTimestamp = Infinity;

    const prayerOrder = ["fajr", "shuruq", "dhuhur", "asr", "maghrib", "isha"] as const;

    for (const key of prayerOrder) {
      const minFromMidnight = localTimes[key as keyof typeof localTimes];
      if (typeof minFromMidnight === "number") {
        const prayerMinutes = minFromMidnight;
        const todayMidnight = new Date().setHours(0, 0, 0, 0);
        const prayerTime = new Date(todayMidnight + prayerMinutes * 60000);
        const diff = prayerTime.getTime() - now.getTime();

        if (diff > 0 && diff < nextTimestamp) {
          nextTimestamp = diff;
          nextPrayer = {
            name: key,
            time: formatTime(prayerMinutes),
            timestamp: prayerTime.getTime(),
          };
        }
      }
    }

    return NextResponse.json(
      {
        success: false,
        fallback: true,
        times,
        hijriDate: "1448-01-01",
        city: city || DEFAULT_CITY,
        timezone: timezone || "Africa/Cairo",
        nextPrayer,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Retry-After": "30",
        },
      }
    );
  }
};