// ===========================================================================
// MAGICLY — Community C2: Post image upload
// ===========================================================================
// POST /api/community/upload — multipart { file } → صورة منشور (5MB، صور فقط)
// بيحفظ في public/uploads/community بنفس نمط message-attachments.
// الـRPC create_community_post بيقبل مسارات /uploads/community/ فقط.
// ===========================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { v4 as uuidv4 } from "uuid";
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "fs";
import { join } from "path";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "community");

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
    const storedFileName = `${uuidv4()}.${safeExt}`;
    const uploadDir = join(UPLOAD_DIR, new Date().toISOString().slice(0, 4));
    const filePath = join(uploadDir, storedFileName);

    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(filePath, buffer);
    chmodSync(filePath, 0o644);

    const fileUrl = `/uploads/community/${new Date().toISOString().slice(0, 4)}/${storedFileName}`;
    return NextResponse.json({ success: true, url: fileUrl });
  } catch (error) {
    console.error("[community/upload] POST", error);
    return NextResponse.json({ success: false, error: "Failed to upload file." }, { status: 500 });
  }
}
