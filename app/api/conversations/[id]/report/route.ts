// ===========================================================================
// MAGICLY — Messaging Core — Report a message or conversation
// ===========================================================================

import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const serverClient = await (await import("@/lib/supabase/server")).createClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
    }

    const { reason, message_id } = body as { reason: string; message_id?: string };

    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      return NextResponse.json({ success: false, error: "Reason is required (min 3 chars)." }, { status: 400 });
    }

    // Verify conversation exists and user is a participant
    const { data: participant, error: partError } = await serverClient
      .from("conversation_participants")
      .select("participant_id")
      .eq("conversation_id", params.id)
      .eq("participant_id", user.id)
      .single();

    if (partError || !participant) {
      return NextResponse.json({ success: false, error: "You are not a participant of this conversation." }, { status: 403 });
    }

    // Insert report
    const { data: report, error: repError } = await serverClient
      .from("message_reports")
      .insert({
        reporter_id: user.id,
        conversation_id: params.id,
        message_id: message_id || null,
        reason: reason.trim(),
        status: "open",
      })
      .select("*")
      .single();

    if (repError) {
      console.error("[message_reports] POST", repError);
      return NextResponse.json({ success: false, error: "Failed to create report." }, { status: 500 });
    }

    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error("[message_reports] POST", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
