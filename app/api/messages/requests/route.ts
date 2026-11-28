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

    // رسالة واحدة عبر RPC: صداقة ⇒ محادثة فورية، وإلا طلب مراسلة
    // (يتحقق من الحظر والخصوصية والتكرار و rate limit داخليًا).
    const { data, error } = await serverClient.rpc("send_message_request", {
      p_receiver: receiver_profile_id,
      p_note: typeof note === "string" && note.trim() ? note.trim() : null,
    });

    if (error) {
      console.error("[message_requests] POST rpc error:", error);
      return NextResponse.json({ success: false, error: "Failed to create request." }, { status: 500 });
    }

    const result = (data ?? {}) as {
      ok?: boolean;
      status?: string;
      code?: string;
      request_id?: string;
      conversation_id?: string;
    };

    if (!result.ok) {
      const codeMessages: Record<string, string> = {
        self: "لا يمكنك مراسلة نفسك.",
        receiver_not_found: "المستخدم غير موجود.",
        blocked: "لا يمكن مراسلة هذا المستخدم.",
        privacy: "هذا المستخدم لا يقبل الرسائل.",
        duplicate: "لديك طلب مراسلة قائم مع هذا المستخدم بالفعل.",
        rate_limited: "أرسلت طلبات كثيرة — حاول لاحقًا.",
      };
      const msg = codeMessages[result.code ?? ""] ?? "Cannot message this user.";
      const statusCode = result.code === "rate_limited" ? 429 : result.code === "receiver_not_found" ? 404 : 403;
      return NextResponse.json({ success: false, error: msg, code: result.code }, { status: statusCode });
    }

    // إشعار المستلم بطلب المراسلة
    if (result.status === "pending" && result.request_id) {
      const { socialNotify } = await import("@/lib/community/handlers");
      void socialNotify(
        serverClient,
        receiver_profile_id,
        "وصلك طلب مراسلة",
        "لديك طلب مراسلة جديد — افتح صندوق الطلبات للرد.",
        `/inbox?category=requests`,
      );
    }

    return NextResponse.json({
      success: true,
      request: {
        id: result.request_id ?? null,
        sender_id: user.id,
        receiver_id: receiver_profile_id,
        status: result.status ?? "pending",
        conversation_id: result.conversation_id ?? null,
        created_at: new Date().toISOString(),
        note: note ?? null,
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

    // إثراء الطلبات باسم المُرسِل وصورته وhandle — بدل عرض "مرسل الطلب" المجهول
    const rows = (data ?? []) as { sender_id: string }[];
    let senderById = new Map<string, { display_name: string | null; handle: string | null; avatar_url: string | null }>();
    const senderIds = [...new Set(rows.map((r) => r.sender_id))];
    if (senderIds.length > 0) {
      const { data: senders } = await serverClient
        .from("social_profiles")
        .select("user_id, display_name, handle, avatar_url")
        .in("user_id", senderIds);
      senderById = new Map(
        ((senders ?? []) as { user_id: string; display_name: string | null; handle: string | null; avatar_url: string | null }[])
          .map((s) => [s.user_id, { display_name: s.display_name, handle: s.handle, avatar_url: s.avatar_url }]),
      );
    }

    return NextResponse.json({
      success: true,
      requests: rows.map((r) => ({
        ...r,
        sender_name: senderById.get(r.sender_id)?.display_name ?? null,
        sender_handle: senderById.get(r.sender_id)?.handle ?? null,
        sender_avatar: senderById.get(r.sender_id)?.avatar_url ?? null,
      })),
    });
  } catch (error) {
    console.error("[message_requests] GET unexpected error:", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

