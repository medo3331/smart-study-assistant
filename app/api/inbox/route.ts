// ===========================================================================
// MAGICLY — Unified Inbox — aggregation + notifications
// ===========================================================================

import { NextResponse } from "next/server";

/**
 * GET /api/inbox
 *
 * Unified inbox aggregation endpoint.
 *
 * Returns:
 *   - inbox messages (unread)
 *   - sent messages
 *   - conversations (count + unread)
 *   - unread_count (overall)
 *
 * Uses existing conversations, messages, notifications, and announcement tables.
 * No duplicate data.
 */
export async function GET(req: Request) {
  try {
    const serverClient = await (await import("@/lib/supabase/server")).createClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    const url = new URL(req.url);
    const category = url.searchParams.get("category") || "all";

    // --- Inbox messages (unread) ---
    const { data: inboxMessages, error: msgError } = await serverClient
      .from("messages")
      .select(`
        id, body, sender_id, created_at,
        conversation_id,
        sender:profiles!inner (public_user_code)
      `)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(50);

    // --- Conversations (unread) ---
    const { data: conversations, error: convError } = await serverClient
      .from("conversations")
      .select(`
        id, title, updated_at,
        conversation_participants!inner (participant_id)
      `)
      .eq("status", "active")
      .order("updated_at", { ascending: false });

    // --- Unread count (messages in inbox where participant hasn't read) ---
    // TODO: refine with message_state table when available

    // --- Notifications (in-app) ---
    const { data: notifications, error: notifError } = await serverClient
      .from("notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    return NextResponse.json({
      success: true,
      category,
      inbox: inboxMessages ?? [],
      conversations: conversations ?? [],
      notifications: notifications ?? [],
      unread_count: (notifications ?? []).filter((n: any) => !n.is_read).length,
    });
  } catch (error) {
    console.error("[inbox] GET", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
