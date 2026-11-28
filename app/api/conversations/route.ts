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

    // تحديث نشاطي (آخر ظهور) — فتح صندوق الرسايل = نشاط
    const { error: touchError } = await serverClient.rpc("touch_last_active");
    if (touchError) console.error("[conversations] touch_last_active:", touchError.message);

    // List conversations with latest message and unread count
    const { data: conversations, error: fetchError } = await serverClient
      .from("conversations")
      .select(`
        id,
        title,
        status,
        created_at,
        updated_at,
        is_group,
        group_name,
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
    const convIds = conversations.map((c: any) => c.id);

    // أسماء المشاركين الآخرين (RLS: قراءة عضويات محادثاتي فقط)
    type MemberInfo = { display_name: string | null; avatar_url: string | null; last_active_at: string | null };
    let otherByConv = new Map<string, MemberInfo>();
    let memberListByConv = new Map<string, (MemberInfo & { user_id: string })[]>();
    let lastMsgByConv = new Map<string, string>();
    if (convIds.length > 0) {
      const [partsRes, msgsRes] = await Promise.all([
        serverClient
          .from("conversation_participants")
          .select("conversation_id, participant_id")
          .in("conversation_id", convIds),
        serverClient
          .from("messages")
          .select("conversation_id, body, created_at")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false })
          .limit(convIds.length * 20),
      ]);
      const parts = (partsRes.data ?? []) as { conversation_id: string; participant_id: string }[];
      const otherIds = [...new Set(parts.filter((p) => p.participant_id !== user.id).map((p) => p.participant_id))];
      const profIds = [...new Set(parts.map((p) => p.participant_id))];
      const profsRes = profIds.length > 0
        ? await serverClient
            .from("social_profiles")
            .select("user_id, display_name, avatar_url, last_active_at")
            .in("user_id", profIds)
        : { data: [] as any[] | null };
      const profs = ((profsRes.data ?? []) as { user_id: string; display_name: string | null; avatar_url: string | null; last_active_at: string | null }[]);
      const profById = new Map(profs.map((p) => [p.user_id, p]));
      const membersOf = (convId: string) =>
        parts
          .filter((p) => p.conversation_id === convId)
          .map((p) => {
            const prof = profById.get(p.participant_id);
            return {
              user_id: p.participant_id,
              display_name: prof?.display_name ?? null,
              avatar_url: prof?.avatar_url ?? null,
              last_active_at: prof?.last_active_at ?? null,
            };
          });
      for (const p of parts) {
        if (p.participant_id === user.id) continue;
        const prof = profById.get(p.participant_id);
        otherByConv.set(p.conversation_id, {
          display_name: prof?.display_name ?? null,
          avatar_url: prof?.avatar_url ?? null,
          last_active_at: prof?.last_active_at ?? null,
        });
      }
      for (const c of conversations as any[]) {
        if (c.is_group) memberListByConv.set(c.id, membersOf(c.id));
      }
      for (const m of (msgsRes.data ?? []) as { conversation_id: string; body: string }[]) {
        if (!lastMsgByConv.has(m.conversation_id)) lastMsgByConv.set(m.conversation_id, m.body);
      }
    }

    const result = (conversations as any[]).map((c) => {
      const other = otherByConv.get(c.id);
      const members = memberListByConv.get(c.id) ?? [];
      const msgCount = c.messages?.length || 0;
      return {
        id: c.id,
        title: c.is_group ? (c.group_name || c.title || "جروب") : (other?.display_name || c.title || "محادثة"),
        other_avatar: other?.avatar_url ?? null,
        status: c.status,
        is_group: c.is_group ?? false,
        group_name: c.group_name ?? null,
        members,
        participant_count: members.length,
        other_last_active_at: other?.last_active_at ?? null,
        unread_count: 0,
        last_message_at: c.updated_at,
        last_message_id: null,
        last_message_body: lastMsgByConv.get(c.id) ?? null,
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

    const { conversation_id } = body as { conversation_id?: string };

    if (!conversation_id) {
      return NextResponse.json(
        { success: false, error: "conversation_id is required." },
        { status: 400 }
      );
    }

    // Verify the user is a participant of this conversation
    // This is enforced by RLS, but we verify explicitly to give a clear error
    const { data: participant, error: partError } = await serverClient
      .from("conversation_participants")
      .select("participant_id")
      .eq("conversation_id", conversation_id)
      .eq("participant_id", user.id)
      .single();

    if (partError || !participant) {
      // Check if the user already has an existing conversation with this ID (different issue)
      // For now, return a clear error: not a participant
      return NextResponse.json(
        { success: false, error: "You are not a participant of this conversation. Send a message request first." },
        { status: 403 }
      );
    }

    // Conversation exists and user is a participant - open it
    return NextResponse.json({ success: true, conversation: participant }, { status: 200 });
  } catch (error) {
    console.error("[conversations] POST", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
