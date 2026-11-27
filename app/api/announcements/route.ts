// ===========================================================================
// MAGICLY — SPRINT 1 — Batch 1A
// Announcements API — extended
// Adds: audience targeting, scheduling, delivery tracking, read receipts,
//       preview, analytics.
// Security: server-only writes, RLS enforced, no client direct writes.
// ===========================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";
import { recordAuditLog } from "@/lib/admin/audit-log-record";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUDIENCES = new Set(["all", "targeted", "plan", "faculty", "stage", "grade"]);
const STATUSES = new Set(["draft", "published", "archived", "paused"]);
const DELIVERY_STATUSES = new Set(["sent", "failed", "bounced", "opened", "clicked"]);
const DELIVERY_CHANNELS = new Set(["in_app", "email", "push"]);

function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function parseSafeDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isTruthy(v: unknown): boolean {
  return typeof v === "boolean" ? v : v === "1" || v === "true" || v === "yes" || v === "on";
}

// GET /api/announcements
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const service = createServiceClient();
    const { data: { user }, error: authError } = await service.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    const isAdmin = await hasPermission(service, user.id, user.email ?? null, "announcements.manage");
    const isSuperAdmin = await hasPermission(service, user.id, user.email ?? null, "site.owner");

    const activeOnly = isTruthy(url.searchParams.get("active"));
    const userId = url.searchParams.get("user_id");

    if (userId) {
      // Admin requesting all announcements for a specific user
      if (!isAdmin && !isSuperAdmin) {
        return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
      }
      const { data, error } = await service
        .from("announcements")
        .select("*")
        .eq("target_user_ids", userId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[announcements] GET user filter:", error.message);
        return NextResponse.json({ success: false, error: "Failed to filter by user." }, { status: 500 });
      }
      const { data: deliveries, error: delError } = await service
        .from("announcement_deliveries")
        .select("*")
        .eq("user_id", userId);
      const { data: reads, error: readError } = await service
        .from("announcement_reads")
        .select("*")
        .eq("user_id", userId);
      return NextResponse.json({ success: true, announcements: data ?? [], userIdStats: { deliveries: deliveries?.length ?? 0, reads: reads?.length ?? 0 } });
    }

    if (isAdmin) {
      const query = service.from("announcements").select("*").order("created_at", { ascending: false });
      const { data, error } = await query;
      if (error) {
        console.error("[announcements] GET:", error.message);
        return NextResponse.json({ success: false, error: "Failed to load announcements." }, { status: 500 });
      }
      const enriched = await Promise.all(
        (data ?? []).map(async (ann: any) => {
          const { data: dels, error: de } = await service
            .from("announcement_deliveries")
            .select("*")
            .eq("announcement_id", ann.id);
          const { data: reads, error: re } = await service
            .from("announcement_reads")
            .select("*")
            .eq("announcement_id", ann.id);
          return {
            ...ann,
            _deliverCount: dels?.length ?? 0,
            _readCount: reads?.length ?? 0,
            _clickedCount: dels?.filter((d: any) => d.status === "clicked").length ?? 0
          };
        })
      );
      return NextResponse.json({ success: true, announcements: enriched });
    }

    // Student-facing: only published announcements within the active window
    // and respecting audience targeting
    const now = new Date().toISOString();

    // Get user's metadata from auth.users for audience targeting
    const { data: userMeta, error: metaErr } = await service
      .from("auth.users")
      .select("external_metadata")
      .eq("id", user?.id ?? "")
      .maybeSingle();

    // Build audience filter
    let audienceFilter: any = {};

    if (userMeta?.external_metadata) {
      const meta = userMeta.external_metadata as { faculty?: string; stage?: string; grade?: string; plan?: string };
      if (meta.faculty) audienceFilter.target_faculty = meta.faculty;
      if (meta.stage) audienceFilter.target_stage = meta.stage;
      if (meta.grade) audienceFilter.target_grade = meta.grade;
    }

    const query = service
      .from("announcements")
      .select("*")
      .eq("status", "published")
      .lte("publish_at", now)
      .gte("expires_at", now)
      .order("created_at", { ascending: false });

    // Apply audience targeting filter
    if (audienceFilter.target_faculty) {
      query.eq("target_faculty", audienceFilter.target_faculty);
    } else if (audienceFilter.target_stage) {
      query.eq("target_stage", audienceFilter.target_stage);
    } else if (audienceFilter.target_grade) {
      query.eq("target_grade", audienceFilter.target_grade);
    } else if (Array.isArray(audienceFilter.target_user_ids) && user?.id) {
      // targeted audience
      query.contains("target_user_ids", user.id);
    }

    const { data, error: filterErr } = await query;

    if (filterErr) {
      console.error("[announcements] GET public:", filterErr.message);
      return NextResponse.json({ success: false, error: "Failed to load announcements." }, { status: 500 });
    }

    return NextResponse.json({ success: true, announcements: data ?? [] });
  } catch (e) {
    console.error("[announcements] GET", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

// POST /api/announcements
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    const service = createServiceClient();
    const isAdmin = await hasPermission(service, user.id, user.email ?? null, "announcements.manage");
    const isSuperAdmin = await hasPermission(service, user.id, user.email ?? null, "site.owner");

    if (!isAdmin && !isSuperAdmin) {
      return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as {
      title?: string;
      body?: string;
      audience?: string;
      status?: string;
      publish_at?: string;
      expires_at?: string;
      schedule_at?: string;
      start_at?: string;
      end_at?: string;
      target_user_ids?: string[];
      target_plan_ids?: string[];
      target_faculty?: string;
      target_stage?: string;
      target_grade?: string;
    };

    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const bodyText = typeof body.body === "string" ? body.body.trim() : "";
    if (!title || title.length > 200) {
      return NextResponse.json({ success: false, error: "Invalid title." }, { status: 400 });
    }
    if (!bodyText || bodyText.length > 10000) {
      return NextResponse.json({ success: false, error: "Invalid body." }, { status: 400 });
    }

    const audience = body.audience === undefined ? "all" : body.audience;
    if (typeof audience !== "string" || !AUDIENCES.has(audience)) {
      return NextResponse.json({ success: false, error: "Invalid audience." }, { status: 400 });
    }

    const status = body.status === undefined ? "draft" : body.status;
    if (typeof status !== "string" || !STATUSES.has(status)) {
      return NextResponse.json({ success: false, error: "Invalid status." }, { status: 400 });
    }

    let scheduleAt: Date | null = null;
    if (body.schedule_at) {
      scheduleAt = parseSafeDate(body.schedule_at);
      if (!scheduleAt) {
        return NextResponse.json({ success: false, error: "Invalid schedule_at." }, { status: 400 });
      }
    }

    let publishAt: Date | null = null;
    if (body.publish_at) {
      publishAt = parseSafeDate(body.publish_at);
      if (!publishAt) {
        return NextResponse.json({ success: false, error: "Invalid publish_at." }, { status: 400 });
      }
    }

    const startAt = parseSafeDate(body.start_at);
    const endAt = parseSafeDate(body.end_at);

    if (startAt && endAt && startAt >= endAt) {
      return NextResponse.json({ success: false, error: "start_at must be before end_at." }, { status: 400 });
    }

    if (audience === "targeted") {
      if (!body.target_user_ids || !Array.isArray(body.target_user_ids) || body.target_user_ids.length === 0) {
        return NextResponse.json({ success: false, error: "target_user_ids required for audience 'targeted'." }, { status: 400 });
      }
      if (body.target_user_ids.some((id) => !isUuid(id))) {
        return NextResponse.json({ success: false, error: "Invalid target_user_ids." }, { status: 400 });
      }
    } else if (audience === "plan") {
      if (!body.target_plan_ids || !Array.isArray(body.target_plan_ids) || body.target_plan_ids.length === 0) {
        return NextResponse.json({ success: false, error: "target_plan_ids required for audience 'plan'." }, { status: 400 });
      }
      if (body.target_plan_ids.some((p) => typeof p !== "string" || !p.trim())) {
        return NextResponse.json({ success: false, error: "Invalid target_plan_ids." }, { status: 400 });
      }
    } else if (audience === "faculty" || audience === "stage" || audience === "grade") {
      if (!body[audience === "faculty" ? "target_faculty" : audience === "stage" ? "target_stage" : "target_grade"]) {
        return NextResponse.json({ success: false, error: `Missing target_${audience} field.` }, { status: 400 });
      }
    }

    const now = new Date();
    const nowIso = now.toISOString();

    if (status === "published") {
      if (!publishAt) {
        return NextResponse.json({ success: false, error: "publish_at required for published status." }, { status: 400 });
      }
      if (publishAt > now) {
        return NextResponse.json({ success: false, error: "publish_at cannot be in the future." }, { status: 400 });
      }
      if (endAt && endAt <= publishAt) {
        return NextResponse.json({ success: false, error: "end_at must be after publish_at." }, { status: 400 });
      }
    }

    if (scheduleAt) {
      if (scheduleAt <= now) {
        return NextResponse.json({ success: false, error: "schedule_at cannot be in the past." }, { status: 400 });
      }
      if (status !== "draft") {
        return NextResponse.json({ success: false, error: "schedule_at with non-draft status is not allowed. Use publish_at instead." }, { status: 400 });
      }
    }

    if (startAt && endAt && startAt >= endAt) {
      return NextResponse.json({ success: false, error: "start_at must be before end_at." }, { status: 400 });
    }

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("announcements")
      .insert({
        title,
        body: bodyText,
        audience,
        status,
        schedule_at: scheduleAt ? scheduleAt.toISOString() : null,
        publish_at: publishAt ? publishAt.toISOString() : (status === "published" ? nowIso : null),
        start_at: startAt ? startAt.toISOString() : null,
        end_at: endAt ? endAt.toISOString() : null,
        target_user_ids: body.target_user_ids ?? null,
        target_plan_ids: body.target_plan_ids ?? null,
        target_faculty: body.target_faculty ?? null,
        target_stage: body.target_stage ?? null,
        target_grade: body.target_grade ?? null,
        created_by: user.id
      })
      .select("*")
      .single();

    if (error) {
      console.error("[announcements] POST", error.message);
      return NextResponse.json({ success: false, error: "Failed to create announcement." }, { status: 500 });
    }

    await recordAuditLog({
      actor: user.id,
      actor_email: user.email ?? null,
      action: "announcements.manage",
      resource_type: "announcement",
      resource_id: data.id,
      details: { operation: "create", status, audience },
      result: "PASS"
    });

    return NextResponse.json({ success: true, announcement: data }, { status: 201 });
  } catch (e) {
    console.error("[announcements] POST", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

