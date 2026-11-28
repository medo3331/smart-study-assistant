import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";
import { recordAuditLog } from "@/lib/admin/audit-log-record";
import { loadCampaignRecipients, type RecipientAudience } from "@/lib/admin/announcement-email-recipients";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHUNK_SIZE = 500;

async function getAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return { error: NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 }) };
  const service = createServiceClient();
  if (!(await hasPermission(service, user.id, user.email ?? null, "announcements.manage"))) return { error: NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 }) };
  return { user, service };
}

export async function GET() {
  try {
    const auth = await getAdmin();
    if ("error" in auth) return auth.error;
    const { data, error } = await auth.service.from("announcement_email_campaigns").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) return NextResponse.json({ success: false, error: "Failed to load campaigns." }, { status: 500 });
    return NextResponse.json({ success: true, campaigns: data ?? [] });
  } catch (error) { console.error("[announcement-email-campaigns] GET", error); return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    const auth = await getAdmin();
    if ("error" in auth) return auth.error;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
    let announcementId = typeof body.announcement_id === "string" ? body.announcement_id : "";
    const customTitle = typeof body.title === "string" ? body.title.trim() : "";
    const customBody = typeof body.body === "string" ? body.body.trim() : "";
    if (!UUID_RE.test(announcementId)) {
      // رسالة بريدية مخصصة: تُحفظ كإعلان مسودة داخلي تلقائيًا ثم تُستخدم في الحملة
      if (!customTitle || customTitle.length > 200) return NextResponse.json({ success: false, error: "اكتب عنوانًا للرسالة (حتى 200 حرف) أو اختر إعلانًا محفوظًا." }, { status: 400 });
      if (!customBody || customBody.length > 10000) return NextResponse.json({ success: false, error: "اكتب نص الرسالة (حتى 10000 حرف)." }, { status: 400 });
      const { data: draft, error: draftError } = await auth.service.from("announcements").insert({
        title: customTitle, body: customBody, audience: "all", status: "draft", created_by: auth.user.id,
      }).select("id").single();
      if (draftError || !draft) {
        console.error("[announcement-email-campaigns] draft insert", draftError?.message);
        return NextResponse.json({ success: false, error: "Failed to save the custom message." }, { status: 500 });
      }
      announcementId = draft.id;
    } else {
      const { data: announcement, error: announcementError } = await auth.service.from("announcements").select("id, title, status").eq("id", announcementId).maybeSingle();
      if (announcementError || !announcement) return NextResponse.json({ success: false, error: "Announcement not found." }, { status: 404 });
    }

    const audience = (body.audience ?? "all") as RecipientAudience;
    if (!["all", "student", "graduate", "freelancer"].includes(audience)) return NextResponse.json({ success: false, error: "Invalid audience." }, { status: 400 });
    const rawIds = Array.isArray(body.internal_user_ids) ? body.internal_user_ids : [];
    if (rawIds.some((id: unknown) => typeof id !== "string" || !UUID_RE.test(id))) return NextResponse.json({ success: false, error: "Invalid selected user ID." }, { status: 400 });
    const ids = [...new Set(rawIds as string[])];
    const includeAll = body.include_all_internal === true;
    if (includeAll && ids.length) return NextResponse.json({ success: false, error: "Choose either selected users or a full audience." }, { status: 400 });
    const internal = await loadCampaignRecipients(auth.service, {
      audience: includeAll ? audience : "all",
      query: includeAll ? (typeof body.query === "string" ? body.query : "") : undefined,
      ids: includeAll ? undefined : new Set(ids),
    });
    const recipientMap = new Map<string, { user_id: string | null; email: string; source: "internal" | "external" }>();
    for (const recipient of internal) recipientMap.set(recipient.email.toLowerCase(), { user_id: recipient.id, email: recipient.email, source: "internal" });
    const external = Array.isArray(body.external_emails) ? body.external_emails : [];
    for (const raw of external) {
      if (typeof raw !== "string") continue;
      const email = raw.trim();
      if (!EMAIL_RE.test(email)) continue;
      const key = email.toLowerCase();
      if (!recipientMap.has(key)) recipientMap.set(key, { user_id: null, email, source: "external" });
    }
    if (!recipientMap.size) return NextResponse.json({ success: false, error: "No valid recipients selected." }, { status: 400 });
    const rawSubject = body.subject === undefined ? "" : typeof body.subject === "string" ? body.subject.trim() : null;
    const rawSender = body.sender === undefined ? "" : typeof body.sender === "string" ? body.sender.trim() : null;
    if (rawSubject === null || rawSubject.length > 200) return NextResponse.json({ success: false, error: "Invalid subject." }, { status: 400 });
    if (rawSender === null || rawSender.length > 200 || (rawSender && !EMAIL_RE.test(rawSender))) return NextResponse.json({ success: false, error: "Invalid sender email." }, { status: 400 });
    const subject = rawSubject;
    const sender = rawSender;

    const { data: campaign, error: campaignError } = await auth.service.from("announcement_email_campaigns").insert({
      announcement_id: announcementId, created_by: auth.user.id, status: "draft", recipient_count: recipientMap.size,
      subject_override: subject || null, sender_override: sender || null,
    }).select("*").single();
    if (campaignError || !campaign) return NextResponse.json({ success: false, error: "Failed to create campaign." }, { status: 500 });

    const rows = Array.from(recipientMap.values());
    for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
      const batch = rows.slice(start, start + CHUNK_SIZE).map((recipient) => ({ campaign_id: campaign.id, announcement_id: announcementId, user_id: recipient.user_id, email: recipient.email, source: recipient.source, status: "queued" }));
      const { error } = await auth.service.from("announcement_email_recipients").insert(batch);
      if (error) {
        await auth.service.from("announcement_email_campaigns").delete().eq("id", campaign.id);
        console.error("[announcement-email-campaigns] recipients insert", error.message);
        return NextResponse.json({ success: false, error: "Failed to store the complete recipient list; campaign was rolled back." }, { status: 500 });
      }
    }
    await recordAuditLog({ actor: auth.user.id, actor_email: auth.user.email ?? null, action: "announcements.manage", resource_type: "announcement_email_campaign", resource_id: campaign.id, details: { operation: "create", announcement_id: announcementId, recipient_count: recipientMap.size, audience: includeAll ? audience : "selected", custom_message: !UUID_RE.test(typeof body.announcement_id === "string" ? body.announcement_id : "") }, result: "PASS" });
    return NextResponse.json({ success: true, campaign, recipient_count: recipientMap.size }, { status: 201 });
  } catch (error) {
    console.error("[announcement-email-campaigns] POST", error);
    const message = error instanceof Error ? error.message : "Unexpected error.";
    const status = message.includes("safe scan limit") ? 503 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
