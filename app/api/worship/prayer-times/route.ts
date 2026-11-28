import { NextRequest, NextResponse } from "next/server";
import { getPrayerTimesForDate } from "@/lib/islamic/prayer-times/service";
import { dateInTimeZone } from "@/lib/islamic/prayer-times/timezone";
import { CALCULATION_METHODS, MADHABS } from "@/lib/islamic/prayer-times";
import type { CalculationMethodId, MadhabId } from "@/lib/islamic/prayer-times";

/**
 * GET /api/worship/prayer-times
 *
 * AlAdhan-backed prayer-times endpoint serving the Worship Center
 * (migrated from magicly). Lives on its own path so the pre-existing
 * `/api/islamic/prayer-times` route keeps its original contract untouched.
 *
 * Query parameters:
 * - date: ISO date string (YYYY-MM-DD), defaults to today
 * - latitude: number (required)
 * - longitude: number (required)
 * - timezone: IANA timezone string (required)
 * - calculationMethod: string (optional, defaults to "egyptian")
 * - madhab: string (optional, defaults to "shafi")
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const dateParam = searchParams.get("date");
    const latitude = searchParams.get("latitude");
    const longitude = searchParams.get("longitude");
    const timezone = searchParams.get("timezone");
    const requestedMethod = searchParams.get("calculationMethod") || "egyptian";
    const requestedMadhab = searchParams.get("madhab") || "shafi";
    const calculationMethod = requestedMethod as CalculationMethodId;
    const madhab = requestedMadhab as MadhabId;

    // Validate required parameters
    if (!latitude || !longitude || !timezone) {
      return NextResponse.json(
        { error: "Missing required parameters: latitude, longitude, timezone" },
        { status: 400 }
      );
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: "Invalid latitude or longitude" },
        { status: 400 }
      );
    }

    // Validate IANA timezone and allow-list calculation parameters.
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
    } catch {
      return NextResponse.json({ error: "Invalid IANA timezone" }, { status: 400 });
    }
    if (!CALCULATION_METHODS.some((method) => method.id === calculationMethod)) {
      return NextResponse.json({ error: "Invalid calculation method" }, { status: 400 });
    }
    if (!MADHABS.some((item) => item.id === madhab)) {
      return NextResponse.json({ error: "Invalid madhab" }, { status: 400 });
    }

    const requestedDate = dateParam || dateInTimeZone(new Date(), timezone);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
    }
    const [year, month, day] = requestedDate.split("-").map(Number);
    const validatedDate = new Date(Date.UTC(year, month - 1, day));
    if (validatedDate.toISOString().slice(0, 10) !== requestedDate) {
      return NextResponse.json({ error: "Invalid calendar date" }, { status: 400 });
    }

    // Use the requested local calendar date instead of the server's current UTC date.
    const prayerTimes = await getPrayerTimesForDate(requestedDate, lat, lng, timezone, calculationMethod, madhab);

    // Return as JSON
    return NextResponse.json({
      success: true,
      data: prayerTimes,
    });
  } catch (error) {
    console.error("Prayer times API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch prayer times"
      },
      { status: 500 }
    );
  }
}
