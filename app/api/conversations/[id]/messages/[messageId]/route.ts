// ===========================================================================
// MAGICLY — Messaging C17 — تعديل وحذف رسالة
// ---------------------------------------------------------------------------
// PATCH  /api/conversations/[id]/messages/[messageId] — تعديل نص رسالتي
// DELETE /api/conversations/[id]/messages/[messageId] — حذف ناعم (مخفي للكل)
// RLS: sender_id = auth.uid() فقط — والحذف الناعم بيخفي الرسالة من الجميع.
// ===========================================================================

import { NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteParams = { params: Promise<{ id: string; messageId: string }> };

async function resolveMessage(params: { id: string; messageId: string }) {
  const serverClient = await (await import("@/lib/supabase/server")).createClient();
  const { data: { user }, error: authError } = await serverClient.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 }) } as const;
  }
  if (!UUID_RE.test(params.id) || !UUID_RE.test(params.messageId)) {
    return { error: NextResponse.json({ success: false, error: "Invalid ids." }, { status: 400 }) } as const;
  }
  // عضوية المحادثة (RLS بتفلتر لو مش مشارك)
  const { data: participant } = await serverClient
    .from("conversation_participants")
    .select("participant_id")
    .eq("conversation_id", params.id)
    .eq("participant_id", user.id)
    .maybeSingle();
  if (!participant) {
    return { error: NextResponse.json({ success: false, error: "You are not a participant of this conversation." }, { status: 403 }) } as const;
  }
  const { data: msg, error: msgError } = await serverClient
    .from("messages")
    .select("id, conversation_id, sender_id, body, message_type, media_url, is_deleted")
    .eq("id", params.messageId)
    .eq("conversation_id", params.id)
    .maybeSingle();
  if (msgError || !msg) {
    return { error: NextResponse.json({ success: false, error: "Message not found." }, { status: 404 }) } as const;
  }
  return { serverClient, user, msg } as const;
}

/** PATCH — تعديل رسالة نصية بتاعتك (الوسائط مش بتتعدل) */
export async function PATCH(req: Request, { params: paramsPromise }: RouteParams) {
  const params = await paramsPromise;
  try {
    const r = await resolveMessage(params);
    if ("error" in r) return r.error;
    const { serverClient, user, msg } = r;

    if (msg.sender_id !== user.id) {
      return NextResponse.json({ success: false, error: "تقدر تعدّل رسايلك بس." }, { status: 403 });
    }
    if (msg.is_deleted) {
      return NextResponse.json({ success: false, error: "الرسالة دي اتحذفت." }, { status: 400 });
    }
    if (msg.message_type !== "text") {
      return NextResponse.json({ success: false, error: "الرسايل اللي فيها وسائط مش بتتعدل — احذفها وابعت واحدة جديدة." }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const newBody = typeof body?.body === "string" ? body.body.trim() : "";
    if (!newBody || newBody.length > 4000) {
      return NextResponse.json({ success: false, error: "نص الرسالة مطلوب (حتى ٤٠٠٠ حرف)." }, { status: 400 });
    }

    // فحص المحتوى المخالف — نفس فحص الإرسال
    const { scanCommunityText } = await import("@/lib/community/moderation");
    const scan = await scanCommunityText(newBody);
    if (scan.violation) {
      return NextResponse.json({ success: false, error: "النص المعدَّل يحتوي محتوى مخالف لقواعد المجتمع." }, { status: 409 });
    }

    const editedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await serverClient
      .from("messages")
      .update({ body: newBody, edited_at: editedAt, updated_at: editedAt })
      .eq("id", msg.id)
      .eq("sender_id", user.id)
      .select("id, conversation_id, sender_id, body, message_type, media_url, is_deleted, edited_at, created_at")
      .single();

    if (updateError || !updated) {
      console.error("[messages] PATCH", updateError);
      return NextResponse.json({ success: false, error: "تعذّر تعديل الرسالة." }, { status: 500 });
    }

    // Realtime: postgres_changes بيلتقط UPDATE تلقائيًا في عميل الشات
    return NextResponse.json({ success: true, message: updated });
  } catch (e) {
    console.error("[messages] PATCH unexpected", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

/** DELETE — حذف ناعم: بتختفي من الطرفين (بتتحفظ is_deleted = true) */
export async function DELETE(_req: Request, { params: paramsPromise }: RouteParams) {
  const params = await paramsPromise;
  try {
    const r = await resolveMessage(params);
    if ("error" in r) return r.error;
    const { serverClient, user, msg } = r;

    if (msg.sender_id !== user.id) {
      return NextResponse.json({ success: false, error: "تقدر تحذف رسايلك بس." }, { status: 403 });
    }
    if (msg.is_deleted) {
      return NextResponse.json({ success: true });
    }

    const deletedAt = new Date().toISOString();
    const { error: deleteError } = await serverClient
      .from("messages")
      .update({ is_deleted: true, body: "", media_url: null, updated_at: deletedAt })
      .eq("id", msg.id)
      .eq("sender_id", user.id);

    if (deleteError) {
      console.error("[messages] DELETE", deleteError);
      return NextResponse.json({ success: false, error: "تعذّر حذف الرسالة." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[messages] DELETE unexpected", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
