// ===========================================================================
// MAGICLY — Community C2: Post image upload
// ===========================================================================
// POST /api/community/upload — multipart { file } → صورة منشور (5MB، صور فقط)
// الرفع على Supabase Storage باكت 'community' عام — مجلد خاص بكل مستخدم
// (community/{user_id}/{uuid}.ext) عشان يشتغل على Vercel (الديسك مؤقت هناك).
// الـRPC create_community_post بيقبل روابط Supabase العامة أو المسارات القديمة.
// ===========================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { v4 as uuidv4 } from "uuid";

const BUCKET = "community";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

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
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ success: false, error: "File type not allowed." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: "File too large (max 5 MB)." }, { status: 400 });
    }

    const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
    const safeExt = ext?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
    const path = `${user.id}/${uuidv4()}.${safeExt}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await serverClient.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (uploadError) {
      console.error("[community/upload] storage upload", uploadError);
      return NextResponse.json({ success: false, error: "Failed to upload file." }, { status: 500 });
    }

    const { data } = serverClient.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ success: true, url: data.publicUrl });
  } catch (error) {
    console.error("[community/upload] POST", error);
    return NextResponse.json({ success: false, error: "Failed to upload file." }, { status: 500 });
  }
}
