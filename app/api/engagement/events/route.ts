// app/api/engagement/events/route.ts
//
// P1-B2 — بوابة الأحداث من العميل (client_reported فقط).
//
// ⚠️ **ليه المسار ده محدود جدًا؟**
//   الأحداث اللي يبعتها المتصفح (client_reported) **مش دليل مكافأة**—she
//   الـregistry في الـDB classifiesها كمصدر ضعيف. usefulness بتاعها حاليًا:
//   Feature Discovery (نعرف إن المستخدم جرّب ميزة) وقياس الاستخدام.
//
//   أي حدث من نوع 'server' (زي exam_completed) attempted من هنا ⇒ مرفوض
//   على مستوى الكود قبل ما يوصل للـDB.
//
// ── الحماية ────────────────────────────────────────────────────────────────
//   1) session مطلوبة (requireUser) ⇒ الـuser_id من الجلسة مش من الطلب.
//   2) rate limit على مستوى المستخدم.
//   3) allowlist صارم: أنواع العميل المسموحة فقط.
//   4) الـDB يرفض أي مصدر/مفتاح/حجم مخالف — الكود ده مجرد طبقة أخف.

import { NextResponse } from "next/server";

import { checkRateLimit, requireUser } from "@/lib/api-guard";
import {
  CLIENT_REPORTED_EVENT_TYPES,
  recordClientReportedEvent,
  type EngagementEventType,
} from "@/lib/engagement/events";

export const dynamic = "force-dynamic";

const MAX_EVENTS_PER_MINUTE = 12;

export async function POST(request: Request) {
  try {
    const { user, response: authError } = await requireUser("message");
    if (authError) return authError;

    const limited = await checkRateLimit(
      `engagement-events:${user.id}`,
      MAX_EVENTS_PER_MINUTE,
      60_000,
      "message",
    );
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) as {
      type?: unknown;
      sourceId?: unknown;
      metadata?: unknown;
    } | null;

    const type = typeof body?.type === "string" ? (body.type as EngagementEventType) : null;
    if (!type || !CLIENT_REPORTED_EVENT_TYPES.includes(type)) {
      return NextResponse.json(
        { error: { message: "نوع الحدث ده مش مسموح من العميل." } },
        { status: 400 },
      );
    }

    const sourceId = typeof body?.sourceId === "string" ? body.sourceId.trim() : "";
    if (!sourceId || sourceId.length > 200) {
      return NextResponse.json(
        { error: { message: "معرّف المصدر غير صالح." } },
        { status: 400 },
      );
    }

    const metadata =
      body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};

    const result = await recordClientReportedEvent({
      type,
      sourceId,
      userId: user.id,
      metadata,
    });

    if (result.error) {
      // الرفض من الـDB (allowlist/حجم/معدل) — 400 مش 500.
      return NextResponse.json(
        { error: { message: "الحدث ده مرفوض." } },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, recorded: result.recorded });
  } catch (error) {
    console.error("[engagement/events] POST:", error);
    return NextResponse.json(
      { error: { message: "حصل خطأ غير متوقع. حاول تاني." } },
      { status: 500 },
    );
  }
}
