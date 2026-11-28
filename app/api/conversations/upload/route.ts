// ===========================================================================
// MAGICLY — Messaging C17: رفع وسائط الشات
// ---------------------------------------------------------------------------
// POST /api/conversations/upload — multipart { file } → رابط عام
// الصور (5MB) + الصوت (10MB — تسجيلات المايك) + الملفات (10MB)
// على باكت 'community' بمسار chat/{user_id}/{uuid}.ext
// ===========================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { v4 as uuidv4 } from "uuid";

const BUCKET = "community";
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_OTHER = 10 * 1024 * 1024;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/x-m4a", "audio/m4a", "audio/wav"];
const FILE_TYPES = ["application/pdf", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

export function mediaKindOf(type: string): "image" | "audio" | "file" | null {
  if (IMAGE_TYPES.includes(type)) return "image";
  if (AUDIO_TYPES.includes(type)) return "audio";
  if (FILE_TYPES.includes(type)) return "file";
  // MediaRecorder أحيانًا بيبعت audio/webm;codecs=opus — نطابق البادئة
  if (type.startsWith("audio/")) return "audio";
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const serverClient = await createClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "No file uploaded." }, { status: 400 });
    }

    const kind = mediaKindOf(file.type);
    if (!kind) {
      return NextResponse.json({ success: false, error: "نوع الملف غير مدعوم (صور أو صوت أو PDF/مستندات)." }, { status: 415 });
    }
    const max = kind === "image" ? MAX_IMAGE : MAX_OTHER;
    if (file.size > max) {
      return NextResponse.json({ success: false, error: `الملف كبير — الحد الأقصى ${Math.round(max / 1024 / 1024)} MB.` }, { status: 413 });
    }

    const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
    const safeExt = ext?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || (kind === "audio" ? "webm" : kind === "image" ? "png" : "bin");
    // سياسة الباكت بتشترط أول فولدر = user_id → المسار {user}/chat/{uuid}
    const path = `${user.id}/chat/${uuidv4()}.${safeExt}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await serverClient.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (uploadError) {
      console.error("[conversations/upload] storage upload", uploadError);
      return NextResponse.json({ success: false, error: "تعذّر رفع الملف." }, { status: 500 });
    }

    const { data } = serverClient.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ success: true, url: data.publicUrl, kind, type: file.type, size: file.size });
  } catch (error) {
    console.error("[conversations/upload] POST", error);
    return NextResponse.json({ success: false, error: "تعذّر رفع الملف." }, { status: 500 });
  }
}
