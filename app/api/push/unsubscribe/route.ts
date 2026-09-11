import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";

/* إلغاء اشتراك جهاز واحد (soft delete عبر is_active).
   بنسيب الصف موجود عشان لو المستخدم فعّل تاني من نفس الجهاز،
   الـ upsert على الـ endpoint يرجّعه نشط بدل ما يعمل صف جديد. */

export async function POST(req: NextRequest) {
  try {
    const { user, supabase, response: authError } = await requireUser("flat");
    if (authError) return authError;

    const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
    const endpoint = body?.endpoint;
    if (typeof endpoint !== "string" || !endpoint) {
      return NextResponse.json({ error: "الـ endpoint مطلوب" }, { status: 400 });
    }

    // كتابة بعميل المستخدم (RLS) تكفي هنا — الصف مملوك له.
    const { error } = await supabase
      .from("push_subscriptions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("endpoint", endpoint);

    if (error) {
      console.error("Failed to deactivate push subscription:", error);
      return NextResponse.json({ error: "فشل إلغاء الاشتراك" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("push/unsubscribe error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
