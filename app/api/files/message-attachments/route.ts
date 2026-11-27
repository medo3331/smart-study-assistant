// ===========================================================================
// MAGICLY — Messaging Core — Message attachment upload
// ===========================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { v4 as uuidv4 } from "uuid";
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "fs";
import { join } from "path";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "messages");

// Limit: 10 MB per file
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "video/mp4",
];

export async function POST(req: NextRequest) {
  try {
    const serverClient = await (await import("@/lib/supabase/server")).createClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const conversationId = formData.get("conversation_id") as string | null;
    const parentMessageId = formData.get("parent_id") as string | null;
    const messageId = formData.get("message_id") as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file uploaded." }, { status: 400 });
    }

    // Validate conversation_id
    if (!conversationId) {
      return NextResponse.json({ success: false, error: "conversation_id is required." }, { status: 400 });
    }

    // Verify conversation exists
    const { data: conversation, error: convError } = await serverClient
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ success: false, error: "Conversation not found." }, { status: 404 });
    }

    // Verify user is a participant
    const { data: participant, error: partError } = await serverClient
      .from("conversation_participants")
      .select("participant_id")
      .eq("conversation_id", conversationId)
      .eq("participant_id", user.id)
      .single();

    if (partError || !participant) {
      return NextResponse.json({ success: false, error: "You are not a participant of this conversation." }, { status: 403 });
    }

    // Validate file type
    const ALLOWED_TYPES = [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "application/pdf", "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "video/mp4",
    ];
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ success: false, error: "File type not allowed." }, { status: 400 });
    }

    // Validate file size (10 MB max)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: "File too large (max 10 MB)." }, { status: 400 });
    }

    // Generate unique file name
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
    const safeExt = (ext?.replace(/[^a-zA-Z0-9]/g, "") || "") || "bin";
    const storedFileName = `${uuidv4()}.${safeExt}`;
    const uploadDir = join(UPLOAD_DIR, new Date().toISOString().slice(0, 4));
    const filePath = join(uploadDir, storedFileName);

    // Ensure directory exists
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
    }

    // Write file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(filePath, buffer);
    chmodSync(filePath, 0o644);

    const fileUrl = `/uploads/messages/${new Date().toISOString().slice(0, 4)}/${storedFileName}`;

    // Save attachment record to messages table (if message is created) or as a standalone attachment
    // For now, return the file URL and metadata
    // The client will link it to the conversation/message

    return NextResponse.json({
      success: true,
      file: {
        id: uuidv4(),
        url: fileUrl,
        name: file.name,
        size: file.size,
        type: file.type,
        conversation_id: conversationId,
        parent_message_id: parentMessageId || null,
        uploaded_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[message-attachments] POST", error);
    return NextResponse.json({ success: false, error: "Failed to upload file." }, { status: 500 });
  }
}
