// ===========================================================================
// MAGICLY — Messaging Core — Block a user
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

    const { blocked_id } = body as { blocked_id: string };

    if (!blocked_id) {
      return NextResponse.json({ success: false, error: "blocked_id is required." }, { status: 400 });
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

    // Create block
    const { error: blockError } = await serverClient
      .from("user_blocks")
      .insert({
        blocker_id: user.id,
        blocked_id,
      });

    if (blockError) {
      console.error("[user_blocks] POST", blockError);
      return NextResponse.json({ success: false, error: "Failed to block user." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[user_blocks] POST", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
