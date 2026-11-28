// ===========================================================================
// MAGICLY — Community C3: Groups API
// ===========================================================================
// GET  /api/community/groups?kind=&q=&scope=mine|discover — استعراض/بحث
// POST /api/community/groups — إنشاء مجموعة { name, description, kind,
//                               privacy, university, faculty, major, year }
// ===========================================================================

import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/community/handlers";

export const dynamic = "force-dynamic";

const GROUP_KINDS = ["general", "university", "faculty", "major", "batch", "study"] as const;

export async function GET(req: Request) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");
    const q = url.searchParams.get("q");
    const scope = url.searchParams.get("scope") === "mine" ? "mine" : "discover";

    if (scope === "mine") {
      const { data, error } = await auth.client.rpc("get_my_community_groups");
      if (error) {
        console.error("[community/groups] mine RPC error:", error);
        return NextResponse.json({ success: false, error: "Failed to load groups." }, { status: 500 });
      }
      return NextResponse.json({ success: true, groups: data ?? [] });
    }

    const { data, error } = await auth.client.rpc("get_community_groups", {
      p_kind: kind && (GROUP_KINDS as readonly string[]).includes(kind) ? kind : null,
      p_query: q && q.trim() ? q.trim().slice(0, 80) : null,
      p_limit: 30,
    });
    if (error) {
      console.error("[community/groups] RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to load groups." }, { status: 500 });
    }
    return NextResponse.json({ success: true, groups: data ?? [] });
  } catch (e) {
    console.error("[community/groups] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
    }
    const str = (v: unknown, max: number) =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

    const { data, error } = await auth.client.rpc("create_community_group", {
      p_name: str(body.name, 80),
      p_description: str(body.description, 500),
      p_kind: typeof body.kind === "string" && (GROUP_KINDS as readonly string[]).includes(body.kind) ? body.kind : "general",
      p_privacy: body.privacy === "private" ? "private" : "public",
      p_university: str(body.university, 120),
      p_faculty: str(body.faculty, 120),
      p_major: str(body.major, 120),
      p_year: str(body.year, 40),
    });
    if (error) {
      console.error("[community/groups] create RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to create group." }, { status: 500 });
    }
    const result = data as { ok: boolean; code?: string; group_id?: string; slug?: string };
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.code, error: "Rejected." }, { status: 409 });
    }
    return NextResponse.json({ success: true, groupId: result.group_id, slug: result.slug });
  } catch (e) {
    console.error("[community/groups] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
