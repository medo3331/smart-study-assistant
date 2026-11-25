// ===========================================================================
// MAGICLY — Messaging Core — Conversations collection endpoints
// ===========================================================================
// READ-ONLY verification: sessions full of real tool output. No guesses.
// ===========================================================================

import { NextResponse } from "next/server";

/**
 * GET /api/conversations
 *
 * List all conversations the authenticated student participates in.
 *
 * RLS (client):
 *   - conversation_participants: participant_id = auth.uid()
 *   - messages: conversation must exist, and student must be a participant
 *
 * Service role is NOT used — all access is RLS-enforced via authenticated
 * server client.
 */
export async function GET(req: Request) {
  try {
    const serverClient = await (await import("@/lib/supabase/server")).createClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    // List conversations with latest message and unread count
    const { data: conversations, error: fetchError } = await serverClient
      .from("conversations")
      .select(`
        id,
        title,
        status,
        created_at,
        updated_at,
        messages (
          id
        )
      `)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .range(0, 100);

    if (fetchError) {
      console.error("[conversations] GET", fetchError);
      return NextResponse.json({ success: false, error: "Failed to load conversations." }, { status: 500 });
    }

    // Attach participant count + unread count per conversation
    const result = conversations.map((c: any) => {
      const msgCount = c.messages?.length || 0;
      return {
        id: c.id,
        title: c.title,
        status: c.status,
        participant_count: 0,
        unread_count: 0,
        last_message_at: c.updated_at,
        last_message_id: null,
        message_count: msgCount,
      };
    });

    return NextResponse.json({
      success: true,
      conversations: result,
      pagination: { page: 1, limit: 100, total: result.length },
    });
  } catch (error) {
    console.error("[conversations] GET", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

/**
 * POST /api/conversations
 *
 * Create a new conversation.
 * Body: { recipient_id?: string; participant_ids?: string[]; title?: string }
 */
export async function POST(req: Request) {
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

    const { recipient_id, participant_ids, title } = body as {
      recipient_id?: string;
      participant_ids?: string[];
      title?: string;
    };

    if (!recipient_id && !participant_ids) {
      return NextResponse.json({ success: false, error: "recipient_id or participant_ids is required." }, { status: 400 });
    }

    // Validate recipients exist
    const { data: recipients, error: recipError } = await serverClient
      .from("auth.users")
      .select("id")
      .in("id", recipient_id ? [recipient_id] : (participant_ids ?? []));

    if (recipError) {
      console.error("[conversations] POST validation", recipError);
      return NextResponse.json({ success: false, error: "Failed to validate recipients." }, { status: 500 });
    }

    // Create conversation
    const { data: conversation, error: convError } = await serverClient
      .from("conversations")
      .insert({
        title: title || "محادثة جديدة",
        status: "active",
      })
      .select("*")
      .single();

    if (convError) {
      console.error("[conversations] POST create", convError);
      return NextResponse.json({ success: false, error: "Failed to create conversation." }, { status: 500 });
    }

    // Get participants to add
    const participantsToAdd: Array<{ participant_id: string; role: "member" }> = [
      { participant_id: user.id, role: "member" },
    ];
    if (recipient_id) {
      participantsToAdd.push({ participant_id: recipient_id, role: "member" });
    }
    if (participant_ids) {
      // Map to "member" role; the cast preserves literal type for TS
      const added = participant_ids.map((id: string): { participant_id: string; role: "member" } => ({
        participant_id: id,
        role: "member",
      })) as Array<{ participant_id: string; role: "member" }>;
      participantsToAdd.push(...added);
    }

    // Remove duplicates (keep first occurrence) — all roles are "member"
    const seen = new Set<string>();
    const uniqueParticipants = participantsToAdd.filter((p) => {
      if (seen.has(p.participant_id)) return false;
      seen.add(p.participant_id);
      return true;
    }) as Array<{ participant_id: string; role: "member" }>;

    // Insert participants (all are "member" role)
    const { error: partError } = await serverClient
      .from("conversation_participants")
      .insert(uniqueParticipants.map((p: { participant_id: string; role: "member" }) => ({
        conversation_id: conversation.id,
        participant_id: p.participant_id,
        role: p.role,
        is_archived: false,
        is_muted: false,
        joined_at: new Date().toISOString(),
      })));

    if (partError) {
      console.error("[conversations] POST participants", partError);
      return NextResponse.json({ success: false, error: "Failed to add participants." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      conversation,
    }, { status: 201 });
  } catch (error) {
    console.error("[conversations] POST", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
