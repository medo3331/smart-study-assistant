import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/api-guard";
import { checkSubscriptionQuota } from "@/lib/ai/quota-check";
import { readQuotaSnapshot } from "@/lib/ai/quota-snapshot";
import { resolveActor } from "@/lib/policy";

/* ==========================================================================
   📄 /api/notes/page-quota — كوتة الصفحات اليومية للنوته
   ══════════════════════════════════════════════════════════════════════════

   قرار صاحب المشروع: المستخدم غير المشترك له 10 صفحات يومياً (صفحات
   النوته + صفحات PDF المستوردة). المشتركون Pro/Ultra بلا حد.

   النوته local-first — فالحد بيتم من **طلب مسبق للسيرفر** قبل إنشاء
   الصفحة (زي تذكرة رفع الملفات): الطالب يطلب رصيد N صفحة، لو مسموح
   يعملها محلياً. لو السيرفر مش متاح (أوفلاين) بنسمح — النوته لازم
   تفضل شغالة أوفلاين، والحد اقتصادي مش أمني.

   POST JSON { count?: number }  (افتراضي 1، أقصى 50 لاستيراد PDF)
     → 200 { allowed, used, limit, resetAt, reasonAr? }
       limit = -1 يعني بلا حد (مشتركون/مالك)
   ========================================================================== */

/* GET — قراءة الرصيد **بدون استهلاك** — لشريط الاستهلاك في المحرر. */
export async function GET() {
  try {
    const { user, response: authError } = await requireUserSafe();
    if (authError) return authError;

    const snapshot = await readQuotaSnapshot(user.id, "page");
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (error) {
    console.error("notes/page-quota GET:", error);
    return NextResponse.json(
      { error: { code: "UNKNOWN", message: "حصل خطأ غير متوقع. حاول تاني." } },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, supabase, response: authError } = await requireUserSafe();
    if (authError) return authError;

    const limited = await checkRateLimit(`page-quota:${user.id}`, 60, 60_000, "message");
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) as { count?: unknown } | null;
    const rawCount = typeof body?.count === "number" ? Math.floor(body.count) : 1;
    const count = Math.max(1, Math.min(50, rawCount));

    const actor = await resolveActor(supabase, user.id, user.email ?? null);
    const quota = await checkSubscriptionQuota(user.id, "page", actor.isOwner);

    return NextResponse.json({
      ok: true,
      allowed: quota.allowed,
      used: quota.used,
      limit: quota.limit,
      resetAt: quota.resetAt,
      reasonAr: quota.reasonAr,
      count,
    });
  } catch (error) {
    console.error("notes/page-quota:", error);
    return NextResponse.json(
      { error: { code: "UNKNOWN", message: "حصل خطأ غير متوقع. حاول تاني." } },
      { status: 500 },
    );
  }
}

/** نفس حماية requireUser — بترجع الـ response مباشرة بدون استثناء. */
async function requireUserSafe() {
  const { requireUser } = await import("@/lib/api-guard");
  return requireUser("message");
}
