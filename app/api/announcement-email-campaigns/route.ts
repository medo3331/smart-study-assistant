import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";
import { recordAuditLog } from "@/app/admin/actions/audit-log-record";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function adminAllowed(user: any, service: any) {
  return hasPermission(service, user.id, user.email ?? null, "announcements.manage");
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    const service = createServiceClient();
    if (!(await adminAllowed(user, service))) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });

    const { data, error } = await service
      .from("announcement_email_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ success: false, error: "Failed to load campaigns." }, { status: 500 });
    return NextResponse.json({ success: true, campaigns: data ?? [] });
  } catch (e) {
    console.error("[announcement-email-campaigns] GET", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    const service = createServiceClient();
    if (!(await adminAllowed(user, service))) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });

    const announcementId = typeof body.announcement_id === "string" ? body.announcement_id : "";
    if (!announcementId) return NextResponse.json({ success: false, error: "announcement_id required." }, { status: 400 });

    // validate announcement exists
    const { data: announcement, error: annErr } = await service.from("announcements").select("*").eq("id", announcementId).single();
    if (annErr || !announcement) return NextResponse.json({ success: false, error: "Announcement not found." }, { status: 404 });

    const internalIds: string[] = Array.isArray(body.internal_user_ids)
      ? body.internal_user_ids.filter((v: any) => typeof v === "string")
      : [];
    const externalEmails: string[] = Array.isArray(body.external_emails)
      ? body.external_emails.filter((v: any) => typeof v === "string")
      : [];

    // resolve internal recipients from trusted auth source
    const recipientMap = new Map<string, { user_id: string | null; email: string; source: "internal" | "external" }>();

    if (internalIds.length > 0) {
      const { data: usersData } = await service.auth.admin.listUsers({ perPage: 1000 });
      const users = usersData?.users ?? [];
      const idSet = new Set(internalIds);
      for (const u of users) {
        if (!idSet.has(u.id)) continue;
        const email = u.email?.trim();
        if (!email || !u.email_confirmed_at) continue;
        recipientMap.set(email.toLowerCase(), { user_id: u.id, email, source: "internal" });
      }
    }

    for (const raw of externalEmails) {
      const email = raw.trim();
      if (!EMAIL_RE.test(email)) continue;
      const key = email.toLowerCase();
      if (recipientMap.has(key)) continue; // prevent duplicate internal/external
      recipientMap.set(key, { user_id: null, email, source: "external" });
    }

    if (recipientMap.size === 0) {
      return NextResponse.json({ success: false, error: "No valid recipients selected." }, { status: 400 });
    }

    const subjectOverride = typeof body.subject === "string" ? body.subject.trim().slice(0, 200) : null;
    const senderOverride = typeof body.sender === "string" ? body.sender.trim().slice(0, 200) : null;
    if (senderOverride && !EMAIL_RE.test(senderOverride)) {
      return NextResponse.json({ success: false, error: "Invalid sender email." }, { status: 400 });
    }

    const { data: campaign, error: cErr } = await service
      .from("announcement_email_campaigns")
      .insert({
        announcement_id: announcementId,
        created_by: user.id,
        status: "draft",
        recipient_count: recipientMap.size,
        subject_override: subjectOverride || null,
       sender_override: senderOverride || null,
      })
      .select("*")
      .single();
    if (cErr || !campaign) {
      console.error("[announcement-email-campaigns] create", cErr?.message);
      return NextResponse.json({ success: false, error: "Failed to create campaign." }, { status: 500 });
    }

    const rows = Array.from(recipientMap.values()).map((r) => ({
      campaign_id: campaign.id,
      announcement_id: announcementId,
      user_id: r.user_id,
      email: r.email,
      source: r.source,
      status: "queued",
    }));

    const { error: rErr } = await service.from("announcement_email_recipients").insert(rows);
    if (rErr) {
      console.error("[announcement-email-campaigns] recipients insert", rErr.message);
      return NextResponse.json({ success: false, error: "Failed to store recipients." }, { status: 500 });
    }

    await recordAuditLog({
      actor: user.id,
      actor_email: user.email ?? null,
      action: "announcements.manage",
      resource_type: "announcement_email_campaign",
      resource_id: campaign.id,
      details: { operation: "create", announcement_id: announcementId, recipient_count: recipientMap.size },
      result: "PASS",
    });

    return NextResponse.json({ success: true, campaign }, { status: 201 });
  } catch (e) {
    console.error("[announcement-email-campaigns] POST", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
