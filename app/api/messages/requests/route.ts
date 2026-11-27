// ===========================================================================
// MAGICLY — Message Requests API
// Phase 1: Messaging Foundation
// ===========================================================================

import { NextResponse } from "next/server";

/**
 * POST /api/messages/requests
 *
 * Send a message request to another user.
 * No conversation exists yet - this creates a pending request.
 *
 * Body:
 *   { receiver_profile_id: string, note?: string }
 *
 * Returns:
 *   201 { success: true, request: {...} }
 *   400 { success: false, error: "..." } (invalid, blocked, duplicate)
 *   403 { success: false, error: "..." } (permission denied)
 *   404 { success: false, error: "..." } (receiver not found)
 */
export async function POST(req: Request) {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const serverClient = await createClient();

    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
    }

    const { receiver_profile_id, note } = body as { receiver_profile_id?: string; note?: string };

    if (!receiver_profile_id) {
      return NextResponse.json({ success: false, error: "receiver_profile_id is required." }, { status: 400 });
    }

    // 1. Find the receiver's user ID by profile ID
    const { data: profile, error: profileError } = await serverClient
      .from("public_profiles")
      .select("user_id")
      .eq("profile_id", receiver_profile_id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ success: false, error: "Receiver not found." }, { status: 404 });
    }

    const receiverId = profile.user_id;

    // 2. Check if receiver exists (must be an active user)
    const { data: receiverUser, error: userError } = await serverClient
      .from("auth.users")
      .select("id")
      .eq("id", receiverId)
      .single();

    if (userError || !receiverUser) {
      return NextResponse.json({ success: false, error: "Receiver account not found." }, { status: 404 });
    }

    // 3. Check if users can message each other (no block, no duplicate request)
    const canMessage = await serverClient.rpc("public_can_message", {
      user_a: user.id,
      user_b: receiverId,
    });

    if (!canMessage || !canMessage.boolean || !canMessage.boolean) {
      return NextResponse.json({ success: false, error: "Cannot message this user (blocked or duplicate request)." }, { status: 403 });
    }

    // 4. Insert message request
    const { data, error } = await serverClient
      .from("message_requests")
      .insert({
        sender_id: user.id,
        receiver_id: receiverId,
        note: note || null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      })
      .select("*")
      .single();

    if (error) {
      console.error("[message_requests] POST error:", error);
      return NextResponse.json({ success: false, error: "Failed to create request." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      request: {
        id: data.id,
        sender_id: data.sender_id,
        receiver_id: data.receiver_id,
        status: data.status,
        created_at: data.created_at,
        note: data.note,
        expires_at: data.expires_at,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[message_requests] POST unexpected error:", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

/**
 * GET /api/messages/requests
 *
 * List incoming message requests for the authenticated user.
 */
export async function GET(req: Request) {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const serverClient = await createClient();

    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    // List incoming requests
    const { data, error } = await serverClient
      .from("message_requests")
      .select("id, sender_id, status, note, created_at, responded_at, responded_by")
      .eq("receiver_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[message_requests] GET error:", error);
      return NextResponse.json({ success: false, error: "Failed to load requests." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      requests: data || [],
    });
  } catch (error) {
    console.error("[message_requests] GET unexpected error:", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

