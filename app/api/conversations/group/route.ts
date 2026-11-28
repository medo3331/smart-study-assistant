// ===========================================================================
// MAGICLY — Group Conversations API
// Phase 1: Messaging Foundation
// ===========================================================================

import { NextResponse } from "next/server";

/**
 * POST /api/conversations/group
 *
 * Create a new group conversation.
 *
 * Body:
 *   {
 *     name: string,
 *     participant_ids: string[], // user IDs to add
 *     owner_id?: string        // defaults to current user
 *   }
 *
 * Returns:
 *   201 { success: true, conversation: {...} }
 *   400 { success: false, error: "..." }
 *   403 { success: false, error: "..." }
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

    const { name, participant_ids, owner_id } = body as {
      name: string;
      participant_ids: string[];
      owner_id?: string;
    };

    if (!name || typeof name !== "string" || name.trim().length < 1) {
      return NextResponse.json({ success: false, error: "Conversation name is required." }, { status: 400 });
    }

    if (!participant_ids || !Array.isArray(participant_ids)) {
      return NextResponse.json({ success: false, error: "participant_ids is required." }, { status: 400 });
    }

    // Owner must be a valid participant — المالك هو المستخدم الحالي دايمًا
    const owner = user.id;
    const requested = [...new Set((participant_ids as string[]).filter((pid) => typeof pid === "string" && pid))];
    if (!requested.includes(owner)) requested.push(owner);

    // Validate participants exist (service client — auth.users مش متاح عبر PostgREST)
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const service = createServiceClient();

    const { data: existing, error: profError } = await service
      .from("profiles")
      .select("id")
      .in("id", requested);
    if (profError) {
      console.error("[conversations/group] Profile lookup:", profError);
      return NextResponse.json({ success: false, error: "Failed to validate participants." }, { status: 500 });
    }
    const found = new Set((existing ?? []).map((p: { id: string }) => p.id));
    const missing = requested.filter((pid) => !found.has(pid));
    if (missing.length > 0) {
      return NextResponse.json({ success: false, error: "بعض الأعضاء المختارين مش موجودين." }, { status: 400 });
    }

    // Create conversation (service — insert باسم المنشئ + أعمدة الجروب)
    const { data: conversation, error: convError } = await service
      .from("conversations")
      .insert({
        title: name.trim().slice(0, 60),
        status: "active",
        is_group: true,
        group_name: name.trim().slice(0, 60),
        created_by: owner,
      })
      .select("*")
      .single();

    if (convError) {
      console.error("[conversations/group] Create error:", convError);
      return NextResponse.json({ success: false, error: "Failed to create conversation." }, { status: 500 });
    }

    // Add all participants (service — RLS بيمنع إضافة غيرك بعميل مصادق)
    const participants = requested.map((pid) => ({
      conversation_id: conversation.id,
      participant_id: pid,
      role: pid === owner ? "owner" : "member",
    }));

    const { error: partError } = await service
      .from("conversation_participants")
      .insert(participants);

    if (partError) {
      console.error("[conversations/group] Participant insert error:", partError);
      return NextResponse.json({ success: false, error: "Failed to add participants." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      conversation: {
        id: conversation.id,
        title: conversation.title,
        status: conversation.status,
        is_group: true,
        owner_id: owner,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[conversations/group] POST unexpected error:", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
