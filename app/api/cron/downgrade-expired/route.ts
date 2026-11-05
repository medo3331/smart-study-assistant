import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Cron job: downgrade expired premium entitlements to free.
 * Trigger via Vercel Cron or manual GET with Authorization: Bearer $CRON_SECRET.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const privileged = createServiceClient();
  const now = new Date().toISOString();

  // Downgrade expired plan entitlements (premium/pro/ultra) to free
  const { data, error } = await privileged
    .from("entitlements")
    .update({ value: "free" })
    .eq("kind", "plan")
    .in("value", ["premium", "pro", "ultra"])
    .lt("expires_at", now)
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, downgraded: data?.length ?? 0, ranAt: now });
}
