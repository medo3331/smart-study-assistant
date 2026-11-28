// app/api/notes/share/[id]/route.ts
//
// 📖 قراءة نوتة مشاركة — عامة (بدون تسجيل) عبر معرّف غير قابل للتخمين.

import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/api-guard";
import { createServiceClient } from "@/lib/supabase/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "لينك المشاركة غير صالح." } },
        { status: 400 },
      );
    }
    // حد أعلى للمعدل على المفتاح العام (IP-level عبر الـ id نفسه).
    const limited = await checkRateLimit(`notes-share-read:${id}`, 60, 60_000, "message");
    if (limited) return limited;
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("shared_notebooks")
      .select("title, payload, page_count")
      .eq("id", id)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "لينك المشاركة مش موجود أو اتلغى." } },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      title: data.title,
      pageCount: data.page_count,
      payload: data.payload,
    });
  } catch (error) {
    console.error("notes/share/[id] GET:", error);
    return NextResponse.json(
      { error: { code: "UNKNOWN", message: "حصل خطأ غير متوقع. حاول تاني." } },
      { status: 500 },
    );
  }
}
