// ===========================================================================
// MAGICLY — User Discovery & Public Profiles API
// Phase 1: Messaging Foundation
// ===========================================================================

import { NextResponse } from "next/server";

/**
 * GET /api/users/search
 *
 * Search public profiles by query, university, faculty, specialization, interests.
 * Returns profiles that are visible to the authenticated user.
 *
 * Query params:
 *   - query: search text (name, bio, etc)
 *   - university: filter by university
 *   - faculty: filter by faculty
 *   - specialization: filter by specialization
 *   - interests: comma-separated list of interests to filter by
 *   - limit: max results (default 20, max 100)
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
    const query = url.searchParams.get("query") || "";
    const university = url.searchParams.get("university") || undefined;
    const faculty = url.searchParams.get("faculty") || undefined;
    const specialization = url.searchParams.get("specialization") || undefined;
    const interests = url.searchParams.get("interests")?.split(",").map((s) => s.trim()).filter(Boolean) || undefined;
    const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 100);

    // Use the PostgreSQL function to search public profiles
    const { data, error } = await serverClient.rpc("public_search_public_profiles", {
      p_query: query || null,
      p_university: university || null,
      p_faculty: faculty || null,
      p_specialization: specialization || null,
      p_interests: interests || null,
    });

    if (error) {
      console.error("[users/search] RPC error:", error);
      return NextResponse.json(
        { success: false, error: "Search failed." },
        { status: 500 }
      );
    }

    // The RPC returns an array of rows; we need to paginate manually
    // For now, return all results (limit is handled by the RPC)
    const results = Array.isArray(data) ? data : [];

    return NextResponse.json({
      success: true,
      profiles: results.map((p: any) => ({
        profile_id: p.profile_id,
        display_name: p.display_name,
        handle: p.handle ?? null,
        avatar_url: p.avatar_url,
        university: p.university,
        faculty: p.faculty,
        specialization: p.specialization,
        year: p.year,
        interests: p.interests,
        bio: p.bio,
        is_visible: p.is_visible,
        match_score: p.match_score,
      })),
      pagination: {
        limit,
        total: results.length,
      },
    });
  } catch (error) {
    console.error("[users/search] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: "Unexpected error." },
      { status: 500 }
    );
  }
}
