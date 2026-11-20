// app/api/notes/share/route.ts
//
// 📤 إنشاء لينك مشاركة دفتر للقراءة فقط.
//
// العميل بيبعت عنوان الدفتر + صفحاته كـ snapshot JSON (بدون originalStrokes).
// اللينك بيبقى /notes-shared/<uuid> — الـ id عشوائي وغير قابل للتخمين.
// القراءة العامة عبر GET /api/notes/share/[id] (service-role).

import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit, requireUser } from "@/lib/api-guard";
import { createServiceClient } from "@/lib/supabase/admin";

/** أقصى حجم للحمولة (JSON) — حماية من التخزين الضخم. */
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;
/** أقصى عدد صفحات في المشاركة. */
const MAX_SHARE_PAGES = 60;

const PAGE_RE = /^\d+-\d+-\d+-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const { user, response: authError } = await requireUser("message");
    if (authError) return authError;

    const limited = await checkRateLimit(`notes-share:${user.id}`, 10, 60_000, "message");
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) as
      | { title?: unknown; payload?: unknown; pageCount?: unknown }
      | null;
    if (!body || typeof body.payload !== "object" || body.payload === null) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "حمولة المشاركة ناقصة." } },
        { status: 400 },
      );
    }
    const payload = body.payload as Record<string, unknown>;
    const pages = Array.isArray(payload.pages) ? payload.pages : [];
    if (pages.length < 1 || pages.length > MAX_SHARE_PAGES) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: `عدد الصفحات لازم يكون بين 1 و${MAX_SHARE_PAGES}.` } },
        { status: 400 },
      );
    }
    // نظّف originalStrokes — القارئ مش محتاجها وبتكبّر الحمولة.
    for (const page of pages) {
      if (page && typeof page === "object") {
        const record = page as Record<string, unknown>;
        if (record.snapshot && typeof record.snapshot === "object") {
          delete (record.snapshot as Record<string, unknown>).originalStrokes;
        }
      }
    }
    const serialized = JSON.stringify({ pages });
    if (Buffer.byteLength(serialized) > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "الدفتر كبير جداً للمشاركة (حد 4MB). جرّب تصدّر PDF بدلها." } },
        { status: 413 },
      );
    }
    const title = typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 120)
      : "دفتر";
    const pageCount = pages.length;

    const admin = createServiceClient();
    const { data, error } = await admin
      .from("shared_notebooks")
      .insert({ owner_id: user.id, title, payload: { pages }, page_count: pageCount })
      .select("id")
      .single();
    if (error || !data) {
      console.error("notes/share insert:", error);
      return NextResponse.json(
        { error: { code: "UNKNOWN", message: "مقدرناش نعمل لينك المشاركة — جرّب تاني." } },
        { status: 500 },
      );
    }
    // أمّن الباراميتر: الـ id اللي بيرجع من gen_random_uuid() uuid عشوائي —
    // بس للينك العام بنفضّل شكل قصير قابل للفحص.
    return NextResponse.json({ ok: true, shareId: data.id as string });
  } catch (error) {
    console.error("notes/share POST:", error);
    return NextResponse.json(
      { error: { code: "UNKNOWN", message: "حصل خطأ غير متوقع. حاول تاني." } },
      { status: 500 },
    );
  }
}

/** DELETE — إلغاء لينك مشاركة (؟shareId=). */
export async function DELETE(request: NextRequest) {
  try {
    const { user, response: authError } = await requireUser("message");
    if (authError) return authError;
    const shareId = new URL(request.url).searchParams.get("shareId") ?? "";
    if (!PAGE_RE.test(shareId)) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "معرّف المشاركة غير صالح." } },
        { status: 400 },
      );
    }
    const admin = createServiceClient();
    // الحذف بيتحقق إن صف المشاركة بتاع المستخدم ده فعلاً.
    const { error } = await admin
      .from("shared_notebooks")
      .delete()
      .eq("id", shareId)
      .eq("owner_id", user.id);
    if (error) {
      console.error("notes/share delete:", error);
      return NextResponse.json(
        { error: { code: "UNKNOWN", message: "مقدرناش نلغي المشاركة — جرّب تاني." } },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("notes/share DELETE:", error);
    return NextResponse.json(
      { error: { code: "UNKNOWN", message: "حصل خطأ غير متوقع. حاول تاني." } },
      { status: 500 },
    );
  }
}
