import { NextRequest, NextResponse } from "next/server";
import { getTodayPrayerTimes } from "@/lib/islamic/prayer-times/service";
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
    const calculationMethod = searchParams.get("calculationMethod") as CalculationMethodId || "egyptian";
    const madhab = searchParams.get("madhab") as MadhabId || "shafi";

    // Validate required parameters
    if (!latitude || !longitude || !timezone) {
      return NextResponse.json(
        { error: "Missing required parameters: latitude, longitude, timezone" },
        { status: 400 }
      );
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: "Invalid latitude or longitude" },
        { status: 400 }
      );
    }

    const date = dateParam ? new Date(dateParam) : new Date();

    // Validate date
    if (isNaN(date.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format. Use YYYY-MM-DD" },
        { status: 400 }
      );
    }

    // Fetch prayer times
    const prayerTimes = await getTodayPrayerTimes(lat, lng, timezone, calculationMethod, madhab);

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
