/**
 * /api/store/purchase-requests — طلبات الشراء (كريدت / باقة) — دفع يدوي.
 *
 * GET  → طلبات المستخدم الحالي (الأحدث أولًا)
 * POST → إنشاء طلب جديد:
 *   { kind: "credits", packId: "<uuid>" }
 *   { kind: "plan", planKey: "pro" | "ultra", durationDays?: 30 }
 *
 * الحماية:
 *   - مصادقة إجبارية (الزوار يُوجَّهون لتسجيل الدخول).
 *   - طلب واحد نشط (awaiting_payment / payment_submitted) لنفس الهدف —
 *     لمنع طوفان الطلبات بدون أي عدّاد خارجي.
 *   - السعر يُقرأ من القاعدة (snapshot) — الكلاينت لا يرسل مبلغًا.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createSupportTicketForRequest,
  notifyAdmins,
  type PurchaseRequestRow,
} from "@/lib/store/purchase-requests";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ ok: false, error: "سجّل الدخول الأول.", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("purchase_requests")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, error: "تعذر قراءة الطلبات.", code: "READ_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, requests: (data ?? []) as PurchaseRequestRow[] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ ok: false, error: "سجّل الدخول الأول لإنشاء طلب شراء.", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "بيانات غير صالحة.", code: "INVALID_REQUEST" }, { status: 400 });
  }
  const kind = (body as { kind?: unknown }).kind;
  const packId = typeof (body as { packId?: unknown }).packId === "string" ? (body as { packId: string }).packId.trim() : "";
  const planKeyRaw = typeof (body as { planKey?: unknown }).planKey === "string" ? (body as { planKey: string }).planKey.trim().toLowerCase() : "";
  const durationDaysRaw = Number((body as { durationDays?: unknown }).durationDays);
  const viaSupport = (body as { viaSupport?: unknown }).viaSupport === true;

  // ── منع الطلبات المكرّرة: طلب نشط واحد لنفس الهدف ──
  const activeStatuses = ["awaiting_payment", "payment_submitted"] as const;
  if (kind === "credits" && packId) {
    const { data: dup } = await supabase
      .from("purchase_requests")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "credits")
      .eq("pack_id", packId)
      .in("status", [...activeStatuses])
      .limit(1);
    if (dup && dup.length > 0) {
      return NextResponse.json({ ok: false, error: "عندك طلب نشط لنفس الحزمة بالفعل — راجع طلباتك أو أكد الدفع.", code: "DUPLICATE_REQUEST" }, { status: 409 });
    }
  }
  if (kind === "plan" && planKeyRaw) {
    const { data: dup } = await supabase
      .from("purchase_requests")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "plan")
      .eq("plan_key", planKeyRaw)
      .in("status", [...activeStatuses])
      .limit(1);
    if (dup && dup.length > 0) {
      return NextResponse.json({ ok: false, error: "عندك طلب اشتراك نشط لنفس الباقة بالفعل — أكد الدفع أو انتظر المراجعة.", code: "DUPLICATE_REQUEST" }, { status: 409 });
    }
  }

  // ── الحزم: السعر والكريدت من القاعدة فقط ──
  if (kind === "credits") {
    if (!packId) {
      return NextResponse.json({ ok: false, error: "اختر حزمة أولًا.", code: "PACK_REQUIRED" }, { status: 400 });
    }
    const { data: pack, error: packError } = await supabase
      .from("credit_packs")
      .select("id, title_ar, credits, price, currency")
      .eq("id", packId)
      .eq("is_active", true)
      .maybeSingle();
    if (packError || !pack) {
      return NextResponse.json({ ok: false, error: "الحزمة غير موجودة أو غير متاحة.", code: "PACK_NOT_FOUND" }, { status: 404 });
    }
    const row = pack as { id: string; title_ar: string; credits: number; price: number; currency: string };
    const { data: created, error: insertError } = await supabase
      .from("purchase_requests")
      .insert({
        user_id: user.id,
        kind: "credits",
        pack_id: row.id,
        credits: row.credits,
        amount: row.price,
        currency: row.currency,
        status: "awaiting_payment",
      })
      .select("id")
      .single();
    if (insertError || !created) {
      return NextResponse.json({ ok: false, error: "تعذر إنشاء الطلب. حاول مرة أخرى.", code: "INSERT_FAILED" }, { status: 500 });
    }
    void notifyAdmins({
      title: "طلب شراء كريدت جديد",
      message: `حزمة «${row.title_ar}» (${row.credits} كريدت — ${row.price} ${row.currency}) في انتظار الدفع. راجع /admin/purchase-requests`,
      type: "warning",
    });
    return NextResponse.json({ ok: true, requestId: created.id, status: "awaiting_payment" }, { status: 201 });
  }

  // ── الباقات: السعر من القاعدة فقط ──
  if (kind === "plan") {
    if (!["pro", "ultra"].includes(planKeyRaw)) {
      return NextResponse.json({ ok: false, error: "اختر باقة صالحة للاشتراك.", code: "PLAN_INVALID" }, { status: 400 });
    }
    const durationDays = Number.isInteger(durationDaysRaw) && durationDaysRaw >= 1 && durationDaysRaw <= 365 ? durationDaysRaw : 30;

    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("plan_key, display_name_ar, name, price_monthly, currency")
      .eq("plan_key", planKeyRaw)
      .eq("is_active", true)
      .maybeSingle();
    if (planError || !plan) {
      return NextResponse.json({ ok: false, error: "الباقة غير موجودة أو غير متاحة.", code: "PLAN_NOT_FOUND" }, { status: 404 });
    }
    const row = plan as { plan_key: string; display_name_ar: string | null; name: string | null; price_monthly: number | null; currency: string | null };
    const amount = row.price_monthly && row.price_monthly > 0 ? row.price_monthly : 0;
    const { data: created, error: insertError } = await supabase
      .from("purchase_requests")
      .insert({
        user_id: user.id,
        kind: "plan",
        plan_key: row.plan_key,
        plan_duration_days: durationDays,
        amount,
        currency: row.currency || "EGP",
        status: "awaiting_payment",
      })
      .select("id")
      .single();
    if (insertError || !created) {
      return NextResponse.json({ ok: false, error: "تعذر إنشاء الطلب. حاول مرة أخرى.", code: "INSERT_FAILED" }, { status: 500 });
    }

    // مسار رسايل الدعم: فتح تذكرة بالمحادثة وربطها بالطلب.
    let ticketId: string | null = null;
    if (viaSupport) {
      ticketId = await createSupportTicketForRequest({
        userId: user.id,
        requestId: created.id,
        planLabel: row.display_name_ar || row.name || row.plan_key,
        durationDays,
        amount,
        currency: row.currency || "EGP",
      });
    }

    void notifyAdmins({
      title: "طلب اشتراك جديد",
      message: `باقة ${row.display_name_ar || row.name || row.plan_key} لمدة ${durationDays} يوم${viaSupport ? " — عبر رسايل الدعم" : ""} — في انتظار تأكيد الدفع. راجع /admin/subscription-requests`,
      type: "warning",
    });
    return NextResponse.json({ ok: true, requestId: created.id, ticketId, status: "awaiting_payment" }, { status: 201 });
  }

  return NextResponse.json({ ok: false, error: "نوع الطلب غير معروف.", code: "KIND_INVALID" }, { status: 400 });
}
