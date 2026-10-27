import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const { data: campaign } = await service.from("announcement_email_campaigns").select("*").eq("id", id).maybeSingle();
    if (!campaign) return NextResponse.json({ success: false, error: "Campaign not found." }, { status: 404 });
    const { data: recipients } = await service.from("announcement_email_recipients").select("*").eq("campaign_id", id).order("created_at", { ascending: true });
    return NextResponse.json({ success: true, campaign, recipients: recipients ?? [] });
  } catch (e) {
    console.error("[announcement-email-campaigns detail]", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
