import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";
import { recordAuditLog } from "@/app/admin/actions/audit-log-record";
import { sendResendEmail } from "@/lib/email/resend";
import { buildAnnouncementEmail } from "@/lib/email/announcement-template";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ success: false, error: "Invalid id." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

    const service = createServiceClient();
    if (!(await hasPermission(service, user.id, user.email ?? null, "announcements.manage"))) {
      return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || body.confirm !== true) {
      return NextResponse.json({ success: false, error: "Final confirmation required." }, { status: 400 });
    }
    const retryFailed = body.retry_failed === true;

    const { data: campaign, error: cErr } = await service
      .from("announcement_email_campaigns")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (cErr || !campaign) return NextResponse.json({ success: false, error: "Campaign not found." }, { status: 404 });

    if (campaign.status === "sending") {
      return NextResponse.json({ success: false, error: "Campaign is already sending." }, { status: 409 });
    }
    if (campaign.status === "completed" && !retryFailed) {
      return NextResponse.json({ success: false, error: "Campaign already completed. Use retry_failed for failed recipients only." }, { status: 409 });
    }

    const { data: announcement } = await service.from("announcements").select("*").eq("id", campaign.announcement_id).maybeSingle();
    if (!announcement) return NextResponse.json({ success: false, error: "Announcement not found." }, { status: 404 });

    // claim recipients
    let statusFilter = retryFailed ? ["failed"] : ["queued"];
    const { data: toSend, error: rErr } = await service
      .from("announcement_email_recipients")
      .select("*")
      .eq("campaign_id", id)
      .in("status", statusFilter);
    if (rErr) return NextResponse.json({ success: false, error: "Failed to load recipients." }, { status: 500 });
    if (!toSend || toSend.length === 0) {
      return NextResponse.json({ success: false, error: "No recipients to send." }, { status: 400 });
    }

    // mark campaign sending
    await service.from("announcement_email_campaigns").update({
      status: "sending",
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", id);

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://magicly.app").replace(/\/$/, "");
    const email = buildAnnouncementEmail({
      title: announcement.title,
      body: announcement.body,
      publishedAt: announcement.publish_at,
      magiclyUrl: `${siteUrl}/dashboard`,
    });
    const subject = campaign.subject_override || email.subject;

    let accepted = 0;
    let failed = 0;

    for (const recipient of toSend) {
      // claim row
      await service.from("announcement_email_recipients").update({
        status: "sending",
        attempt_count: (recipient.attempt_count || 0) + 1,
        last_attempt_at: new Date().toISOString(),
      }).eq("id", recipient.id);

      const result = await sendResendEmail({
        to: recipient.email,
        subject,
        html: email.html,
        text: email.text,
      });

      if (result.ok) {
        accepted += 1;
        await service.from("announcement_email_recipients").update({
          status: "accepted",
          resend_id: result.id,
          error: null,
        }).eq("id", recipient.id);
      } else {
        failed += 1;
        await service.from("announcement_email_recipients").update({
          status: "failed",
          error: result.error,
        }).eq("id", recipient.id);
      }

      // gentle pacing for Resend rate limits
      await sleep(120);
    }

    const finalStatus = failed > 0 && accepted > 0 ? "partial_failed" : failed > 0 ? "partial_failed" : "completed";
    // if all failed, still partial_failed (not completed) to allow retry
    await service.from("announcement_email_campaigns").update({
      status: finalStatus,
      accepted_count: (campaign.accepted_count || 0) + accepted,
      failed_count: failed,
      completed_at: new Date().toISOString(),
      last_error: failed > 0 ? "Some recipients failed; retry failed only." : null,
    }).eq("id", id);

    await recordAuditLog({
      actor: user.id,
      actor_email: user.email ?? null,
      action: "announcements.manage",
      resource_type: "announcement_email_campaign",
      resource_id: id,
      details: { operation: retryFailed ? "retry_failed" : "send", accepted, failed },
      result: failed > 0 ? "FAIL" : "PASS",
    });

    return NextResponse.json({
      success: true,
      accepted,
      failed,
      status: finalStatus,
    });
  } catch (e) {
    console.error("[announcement-email-campaigns send]", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
