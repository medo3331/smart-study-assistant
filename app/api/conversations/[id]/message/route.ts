// ===========================================================================
// MAGICLY — Messaging Core — Send message to a conversation
// ===========================================================================

import { NextResponse } from "next/server";
import { publishMessageNew, publishTypingIndicator } from "@/lib/messaging/realtime-publish";
import { enforceContentViolation } from "@/lib/community/content-enforcement";

export async function POST(
  req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
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

    const { body: messageBody, attachment_ids, typing_users } = body as {
      body: string;
      attachment_ids?: string[];
      typing_users?: { id: string; username: string }[];
    };

    if (!messageBody || typeof messageBody !== "string" || messageBody.trim().length < 1) {
      return NextResponse.json({ success: false, error: "Message body is required." }, { status: 400 });
    }

    // 1. Verify conversation exists and student is a participant
    const { data: participant, error: partError } = await serverClient
      .from("conversation_participants")
      .select("participant_id")
      .eq("conversation_id", params.id)
      .eq("participant_id", user.id)
      .single();

    if (partError || !participant) {
      return NextResponse.json({ success: false, error: "You are not a participant of this conversation." }, { status: 403 });
    }

    // 1.5 🛡️ C16: فحص المحتوى قبل الإرسال — كلمات ممنوعة ثم فحص AI
    const { data: hasBlockedWord, error: bwError } = await serverClient.rpc(
      "community_text_has_blocked_word",
      { p_text: messageBody },
    );
    if (!bwError && hasBlockedWord === true) {
      void enforceContentViolation(user.id, "message", messageBody, "blocked_word");
      return NextResponse.json({ success: false, error: "رسالتك تحتوي عبارة مخالفة لقواعد المجتمع فما ابعتتش." }, { status: 409 });
    }
    const { scanCommunityText } = await import("@/lib/community/moderation");
    const scan = await scanCommunityText(messageBody);
    if (scan.violation) {
      void enforceContentViolation(user.id, "message", messageBody, scan.category);
      return NextResponse.json({ success: false, error: "رسالتك تحتوي محتوى مخالف لقواعد المجتمع فما ابعتتش." }, { status: 409 });
    }

    // 2. Insert message
    const { data: message, error: msgError } = await serverClient
      .from("messages")
      .insert({
        conversation_id: params.id,
        sender_id: user.id,
        body: messageBody.trim(),
      })
      .select("*")
      .single();

    if (msgError) {
      console.error("[messages] POST", msgError);
      return NextResponse.json({ success: false, error: "Failed to send message." }, { status: 500 });
    }

    // 3. Publish the new message via Realtime
    await publishMessageNew(params.id, {
      id: message.id,
      conversation_id: params.id,
      sender_id: user.id,
      body: messageBody.trim(),
      is_deleted: false,
      created_at: new Date().toISOString(),
    });

    // 4. Mark as read for all other participants
    // ⚠️ .neq مش .eq("!=") — الصيغة القديمة كانت بترجع error بصمت
    // فإشعارات "رسالة جديدة" عمرها ما كانت بتتبعت
    const { data: others } = await serverClient
      .from("conversation_participants")
      .select("participant_id")
      .eq("conversation_id", params.id)
      .neq("participant_id", user.id);

    // إشعار المستلمين برسالة جديدة (service client داخليًا)
    const { socialNotify } = await import("@/lib/community/handlers");
    for (const p of others ?? []) {
      void socialNotify(
        serverClient,
        p.participant_id,
        "رسالة جديدة",
        messageBody.trim().slice(0, 120),
        `/inbox`,
      );
    }

    // 5. Update last_read on current participant (self)
    await serverClient.from("conversation_participants").update({
      last_read_msg_id: message.id,
      last_read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("conversation_id", params.id).eq("participant_id", user.id);

    // 6. Publish typing indicator stop for all typing users (if any)
    if (typing_users && typing_users.length > 0) {
      for (const tu of typing_users) {
        await publishTypingIndicator(
          params.id,
          tu.id,
          tu.id,
          tu.username,
          false,
        );
      }
    }

    return NextResponse.json({
      success: true,
      message,
      read: true,
    }, { status: 201 });
  } catch (error) {
    console.error("[messages] POST", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
