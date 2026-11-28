// ===========================================================================
// MAGICLY — Message Request Actions (Accept, Reject, Cancel)
// Phase 1: Messaging Foundation
// ===========================================================================

import { NextResponse } from "next/server";

/**
 * POST /api/messages/requests/[id]/accept
 *
 * Accept an incoming message request.
 * This creates a conversation between the two users.
 *
 * Body: optional { note?: string }
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const serverClient = await createClient();

    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    // 1. Fetch the incoming request (verify receiver)
    const { data: request, error: reqError } = await serverClient
      .from("message_requests")
      .select("id, sender_id, receiver_id, status, created_at")
      .eq("id", params.id)
      .eq("receiver_id", user.id)
      .single();

    if (reqError || !request) {
      return NextResponse.json({ success: false, error: "Request not found." }, { status: 404 });
    }

    if (request.status !== "pending") {
      // Idempotency: request already accepted/rejected → return existing conversation
      const { data: existingConvo, error: convError } = await serverClient
        .from("conversations")
        .select("id, title, status")
        .eq("user_a_id", request.sender_id)
        .eq("user_b_id", user.id)
        .eq("status", "active")
        .single();

      if (convError || !existingConvo) {
        return NextResponse.json({ success: false, error: "Request is no longer pending." }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        request: { id: params.id, status: request.status },
        conversation: { id: existingConvo.id, title: existingConvo.title, status: existingConvo.status },
      }, { status: 200 });
    }

    // 2. Accept the request (atomic via RPC — returns jsonb {ok, status, conversation_id})
    const { data, error: rpcError } = await serverClient.rpc("public.accept_message_request", {
      p_request_id: params.id,
      p_user_id: user.id,
    });

    const result = (data ?? null) as { ok?: boolean; status?: string; conversation_id?: string; code?: string } | null;

    if (rpcError || !result || !result.ok || !result.conversation_id) {
      // Check if the request was already processed (idempotent)
      const { data: existingConvo, error: convError } = await serverClient
        .from("conversations")
        .select("id, title, status")
        .eq("user_a_id", request.sender_id)
        .eq("user_b_id", user.id)
        .eq("status", "active")
        .single();

      if (convError || !existingConvo) {
        console.error("[accept] RPC failed:", rpcError);
        return NextResponse.json({ success: false, error: "Failed to accept request." }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        request: { id: params.id, status: request.status },
        conversation: { id: existingConvo.id, title: existingConvo.title, status: existingConvo.status },
      }, { status: 200 });
    }

    // إشعار المُرسِل أن طلبه قُبل
    {
      const { socialNotify } = await import("@/lib/community/handlers");
      void socialNotify(
        serverClient,
        request.sender_id,
        "تم قبول طلب المراسلة",
        "يمكنكما الآن المحادثة.",
        `/inbox?category=conversations`,
      );
    }

    return NextResponse.json({
      success: true,
      request: { id: params.id, status: result.status || "accepted" },
      conversation: {
        id: result.conversation_id,
        status: "active",
      },
    }, { status: 200 });
  } catch (error) {
    console.error("[message_requests] Accept error:", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
