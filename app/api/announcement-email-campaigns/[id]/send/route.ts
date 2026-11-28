import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";
import { recordAuditLog } from "@/lib/admin/audit-log-record";
import { sendResendEmail } from "@/lib/email/resend";
import { buildAnnouncementEmail } from "@/lib/email/announcement-template";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEND_BATCH_SIZE = 20;

export const maxDuration = 60;

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
    if (retryFailed && campaign.status !== "partial_failed") return NextResponse.json({ success: false, error: "Failed-recipient retry is available only for partial_failed campaigns." }, { status: 409 });
    if (!retryFailed && !["draft", "queued"].includes(campaign.status)) return NextResponse.json({ success: false, error: "Campaign is not ready for sending." }, { status: 409 });

    const { data: announcement } = await service.from("announcements").select("*").eq("id", campaign.announcement_id).maybeSingle();
    if (!announcement) return NextResponse.json({ success: false, error: "Announcement not found." }, { status: 404 });

    // claim recipients
    let statusFilter = retryFailed ? ["failed"] : ["queued"];
    const { data: toSend, error: rErr } = await service
      .from("announcement_email_recipients")
      .select("*")
      .eq("campaign_id", id)
      .in("status", statusFilter)
      .order("created_at", { ascending: true })
      .limit(SEND_BATCH_SIZE);
    if (rErr) return NextResponse.json({ success: false, error: "Failed to load recipients." }, { status: 500 });
    if (!toSend || toSend.length === 0) {
      return NextResponse.json({ success: false, error: "No recipients to send." }, { status: 400 });
    }


    // Claim once with a compare-and-swap so concurrent sends cannot double-send.
    const { data: claimed, error: claimError } = await service.from("announcement_email_campaigns").update({
      status: "sending",
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", id).eq("status", campaign.status).select("id").maybeSingle();
    if (claimError || !claimed) return NextResponse.json({ success: false, error: "Campaign is already being processed." }, { status: 409 });

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://magicly.app").replace(/\/$/, "");
    const email = buildAnnouncementEmail({
      title: announcement.title,
      body: announcement.body,
      publishedAt: announcement.publish_at,
      magiclyUrl: `${siteUrl}/dashboard`,
    });
    const subject = campaign.subject_override || email.subject;

    // المُرسل: override الحملة ← متغير البيئة ← app_settings.email_sender_address
    let settingsSender: string | null = null;
    if (!campaign.sender_override) {
      try {
        const { data: setting } = await service
          .from("app_settings")
          .select("value")
          .eq("key", "email_sender_address")
          .maybeSingle();
        const value = (setting as { value?: string } | null)?.value;
        settingsSender = typeof value === "string" && EMAIL_RE.test(value.trim()) ? value.trim() : null;
      } catch {
        settingsSender = null;
      }
    }
    const fromSender = campaign.sender_override || settingsSender;

    let accepted = 0;
    let failed = 0;
    let firstError: string | null = null;

    for (const recipient of toSend) {
      // claim row
      const { data: claimedRecipient, error: recipientClaimError } = await service.from("announcement_email_recipients").update({
        status: "sending",
        attempt_count: (recipient.attempt_count || 0) + 1,
        last_attempt_at: new Date().toISOString(),
      }).eq("id", recipient.id).eq("status", retryFailed ? "failed" : "queued").select("id").maybeSingle();
      if (recipientClaimError || !claimedRecipient) continue;

      const result = await sendResendEmail({
        to: recipient.email,
        subject,
        html: email.html,
        text: email.text,
        from: fromSender,
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
        const rawError = result.error ?? "Unknown send error.";
        if (!firstError) firstError = rawError;
        // رسالة واضحة للإدارة عند نقص الإعدادات — بدل خطأ غامض
        const friendly = rawError.includes("RESEND_API_KEY")
          ? "إعدادات البريد ناقصة: أضف RESEND_API_KEY في متغيرات البيئة، وحدد بريد المُرسل (RESEND_FROM_EMAIL أو حقل المُرسل في الحملة أو app_settings.email_sender_address) ثم أعد محاولة الفاشل."
          : rawError;
        await service.from("announcement_email_recipients").update({
          status: "failed",
          error: friendly,
        }).eq("id", recipient.id);
      }

      // gentle pacing for Resend rate limits
      await sleep(120);
    }

    const finalStatus = failed > 0 ? "partial_failed" : "completed";
    // Send in bounded batches so a large campaign can continue across admin requests.
    const [{ count: acceptedTotal }, { count: failedTotal }, { count: queuedTotal }, { count: failedPending }] = await Promise.all([
      service.from("announcement_email_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "accepted"),
      service.from("announcement_email_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "failed"),
      service.from("announcement_email_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "queued"),
      service.from("announcement_email_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "failed"),
    ]);
    const totalsError = [acceptedTotal, failedTotal, queuedTotal, failedPending].some((result) => result === null);
    if (totalsError) {
      await service.from("announcement_email_campaigns").update({ status: retryFailed ? "partial_failed" : failed > 0 ? "partial_failed" : "queued", last_error: "Unable to verify campaign totals; recipient statuses were saved." }).eq("id", id);
      return NextResponse.json({ success: false, error: "Batch processed, but campaign totals could not be verified. Reload the campaign before continuing." }, { status: 503 });
    }
    const hasMore = retryFailed ? (failedPending ?? 0) > 0 : (queuedTotal ?? 0) > 0;
    const hasFailures = (failedTotal ?? 0) > 0;
    const nextStatus = hasMore ? (retryFailed ? "partial_failed" : "queued") : hasFailures ? "partial_failed" : "completed";
    await service.from("announcement_email_campaigns").update({
      status: nextStatus,
      accepted_count: acceptedTotal ?? ((campaign.accepted_count || 0) + accepted),
      failed_count: failedTotal ?? failed,
      completed_at: new Date().toISOString(),
      // السبب الحقيقي لأول فشل — يظهر للإدارة في اللوحة
      last_error: failed > 0 ? (firstError ?? "Some recipients failed; retry failed only.") : null,
    }).eq("id", id);

    await recordAuditLog({
      actor: user.id,
      actor_email: user.email ?? null,
      action: "announcements.manage",
      resource_type: "announcement_email_campaign",
      resource_id: id,
      details: { operation: retryFailed ? "retry_failed" : "send", accepted, failed, remaining: retryFailed ? failedPending ?? 0 : queuedTotal ?? 0, batch_size: toSend.length },
      result: failed > 0 ? "FAIL" : "PASS",
    });

    return NextResponse.json({
      success: true,
      accepted,
      failed,
      first_error: firstError,
      accepted_total: acceptedTotal ?? 0,
      failed_total: failedTotal ?? 0,
      status: nextStatus,
      remaining: retryFailed ? failedPending ?? 0 : queuedTotal ?? 0,
      batch_size: toSend.length,
    });
  } catch (e) {
    console.error("[announcement-email-campaigns send]", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
