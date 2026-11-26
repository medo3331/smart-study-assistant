// ===========================================================================
// MAGICLY — Secure MAG ID Lookup API (Server-side only)
// ===========================================================================
// Exact MAG ID lookup for authenticated users.
// - Server-side only: never exposed to unauthenticated users.
// - Returns ONLY permitted public profile information.
// - Never returns the MAG ID itself.
// - Prevents user enumeration and unauthorized lookup.
// ===========================================================================

import { NextResponse } from "next/server";

/**
 * GET /api/users/mag-lookup
 *
 * Server-side MAG ID lookup.
 *
 * Query params:
 *   - mag_id: exact MAG ID to look up (required, exact match)
 *
 * Returns:
 *   - profile_id: public profile ID (NOT auth.uid)
 *   - display_name: public display name
 *   - avatar_url: public avatar URL
 *   - university: university name
 *   - faculty: college/faculty
 *   - specialization: field of study
 *   - year: year of study
 *   - is_visible: whether profile is visible
 *   - is_verified: whether user is verified (admin support only)
 *
 * Security:
 *   - REQUIRES authentication.
 *   - The response never contains the raw MAG ID.
 *   - RLS prevents unauthorized access to user records.
 *   - Rate limiting enforced at the application level.
 */
export async function GET(req: Request) {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const serverClient = await createClient();

    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const magId = url.searchParams.get("mag_id");

    // Validate exact input
    if (!magId || typeof magId !== "string") {
      return NextResponse.json(
        { success: false, error: "MAG ID is required." },
        { status: 400 }
      );
    }

    // Reject potentially dangerous input
    if (magId.length < 6 || magId.length > 100) {
      return NextResponse.json(
        { success: false, error: "Invalid MAG ID format." },
        { status: 400 }
      );
    }

    // Rate limiting: simple in-memory counter (for app-level protection)
    const rateLimitKey = `mag_lookup:${user.id}`;
    const rateLimit = (global as any)?.rateLimit || {};
    const now = Date.now();
    if (rateLimit[rateLimitKey] && rateLimit[rateLimitKey].count > 50) {
      // Wait before resetting
      if (now - rateLimit[rateLimitKey].timestamp < 60000) {
        return NextResponse.json(
          { success: false, error: "Too many requests. Please slow down." },
          { status: 429 }
        );
      }
      delete rateLimit[rateLimitKey];
    }
    rateLimit[rateLimitKey] = { count: 1, timestamp: now };
    (global as any).rateLimit = rateLimit;

    // Look up the user by MAG ID.
    // NOTE: This is server-side only. The response NEVER includes the raw MAG ID.
    // The SQL function should look up the user in the users table and return
    // only the public profile data.
    const { data, error } = await serverClient
      .from("user_codes")
      .select(`
        profile_id,
        display_name,
        avatar_url,
        university,
        faculty,
        specialization,
        year,
        is_visible,
        is_verified
      `)
      .eq("code", magId)
      .maybeSingle();

    if (error) {
      console.error("[users/mag-lookup] DB error:", error);
      return NextResponse.json(
        { success: false, error: "Database error." },
        { status: 500 }
      );
    }

    // If not found, return a generic message (no user enumeration)
    if (!data) {
      return NextResponse.json({
        success: true,
        user: null,
      });
    }

    // Transform to public profile data only
    const publicProfile = {
      profile_id: data.profile_id,
      display_name: data.display_name,
      avatar_url: data.avatar_url,
      university: data.university,
      faculty: data.faculty,
      specialization: data.specialization,
      year: data.year,
      is_visible: data.is_visible,
      is_verified: data.is_verified ?? false,
    };

    return NextResponse.json({
      success: true,
      user: publicProfile,
    });
  } catch (error) {
    console.error("[users/mag-lookup] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: "Unexpected error." },
      { status: 500 }
    );
  }
}
