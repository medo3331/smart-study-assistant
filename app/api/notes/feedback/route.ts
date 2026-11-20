// app/api/notes/feedback/route.ts
//
// ⭐ تقييم الطالب لميزة «النوت الجانبية» — بيتسجل كتذكرة دعم بفئة
// 'feedback' فتظهر للأدمن في صندوق الدعم مع باقي آراء الطلاب.

import { NextResponse } from "next/server";

import { checkRateLimit, requireUser } from "@/lib/api-guard";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { user, response: authError } = await requireUser("message");
    if (authError) return authError;

    const limited = await checkRateLimit(`notes-feedback:${user.id}`, 5, 3_600_000, "message");
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) as
      | { rating?: unknown; comment?: unknown; context?: unknown }
      | null;
    const rating = Number(body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "التقييم لازم يكون من 1 لـ 5." } },
        { status: 400 },
      );
    }
    const comment =
      typeof body?.comment === "string" ? body.comment.trim().slice(0, 2000) : "";
    if (rating <= 3 && comment.length < 5) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "قولنا إيه اللي محتاج يتحسن (٥ حروف على الأقل)." } },
        { status: 400 },
      );
    }
    const context = typeof body?.context === "string" ? body.context.trim().slice(0, 120) : "";

    const service = createServiceClient();
    const description = [
      `التقييم: ${"⭐".repeat(rating)} (${rating}/5)`,
      context ? `المصدر: ${context}` : "",
      "",
      comment || "(من غير تعليق)",
    ]
      .filter(Boolean)
      .join("\n")
      .trim();

    const { data, error } = await service
      .from("support_tickets")
      .insert({
        user_id: user.id,
        title: `تقييم النوت الجانبية — ${rating}/5`,
        subject: `تقييم النوت الجانبية — ${rating}/5`,
        description,
        category: "feedback",
        status: "open",
        priority: rating <= 2 ? "medium" : "low",
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("notes/feedback insert:", error);
      return NextResponse.json(
        { error: { code: "UNKNOWN", message: "مقدرناش نسجّل تقييمك — جرّب تاني." } },
        { status: 500 },
      );
    }

    // أول رسالة في المحادثة = نص التقييم نفسه.
    await service.from("support_messages").insert({
      ticket_id: data.id,
      author_id: user.id,
      author_role: "user",
      body: description,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("notes/feedback POST:", error);
    return NextResponse.json(
      { error: { code: "UNKNOWN", message: "حصل خطأ غير متوقع. حاول تاني." } },
      { status: 500 },
    );
  }
}
