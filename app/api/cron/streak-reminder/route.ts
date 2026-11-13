import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";

import { createServiceClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest, nextPageRange } from "@/lib/cron/daily-maintenance";
import {
  buildStreakReminderPayload,
  chunkIds,
  isStreakAtRisk,
  STREAK_REMINDER_MIN,
} from "@/lib/cron/streak-reminder";
import { cairoDateString } from "@/lib/time/cairo";

/**
 * GET /api/cron/streak-reminder — تنبيه «سلسلتك في خطر»
 *
 * الهدف: الطالب اللي عنده سلسلة ≥ ٣ أيام ولسه ماذاكرش النهارده، يوصله Web Push
 * قبل ما اليوم يخلص — ده أرخص إنقاذ للسلسلة (أرخص من أي مكافأة نضيفها).
 *
 * ⚠️ كل المقارنات **بيوم القاهرة** (`cairoDateString` = نفس `public.cairo_day`
 *    في الداتابيز). قبل P0 كان فيه يومين في نفس المنتج، وده اللي كان بيخلي
 *    الطالب يخسر سلسلته وهو فاكر إنه سجّل.
 *
 * ⚠️ الأمان: `CRON_SECRET` فشل مُغلق — لو مش مضبوط الطلب بيترفض دايمًا
 *    (نفس `daily-maintenance`). القراءة بـ service_role لأن الـ RLS بتمنع
 *    قراءة بروفايلات وأشتراكات حد تاني.
 *
 * ⚠️ idempotency: cron بيتشغّل مرة في اليوم. لو اتشغّل مرتين (إعادة تشغيل
 *    يدوية) هتبعت نفس الإشعار تاني — التاج الثابت `streak-reminder` بيخلي
 *    الإشعار الجديد يستبدل القديم على الجهاز بدل ما يكوم فوقه.
 *
 * ⚠️ مفيش إشعار إلا لصاحب اشتراك محفوظ في `push_subscriptions`. لو المستخدم
 *    قفل التنبيهات، الاشتراك بيتمسح من `/api/push/subscribe` (DELETE) فمايوصلوش
 *    حاجة — ده معنى احترام الاختيار.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOB_NAME = "streak-reminder";
const PAGE_SIZE = 500;
const MAX_PAGES = 10; // سقف 5000 مستخدم لكل تشغيل
const SUBSCRIPTION_CHUNK = 100;

type CronResult = {
  started_at: string;
  finished_at?: string;
  status: "success" | "error" | "partial" | "skipped";
  cairo_day: string;
  scanned: number;
  at_risk: number;
  notified: number;
  failed: number;
  stale_removed: number;
  reason?: string;
  errors?: string[];
  error?: string;
};

function readVapidConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  if (publicKey === "" || privateKey === "") return null;
  // subject لازم يكون mailto: أو https: — قيمة افتراضية معقولة بدل ما نرمي
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@magicly.app";
  return { publicKey, privateKey, subject };
}

export async function GET(req: NextRequest) {
  const startedAtMs = Date.now();
  const today = cairoDateString();
  const result: CronResult = {
    started_at: new Date(startedAtMs).toISOString(),
    status: "success",
    cairo_day: today,
    scanned: 0,
    at_risk: 0,
    notified: 0,
    failed: 0,
    stale_removed: 0,
  };
  const errors: string[] = [];

  if (!isAuthorizedCronRequest(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const vapid = readVapidConfig();
  if (!vapid) {
    /* مش خطأ تشغيل: الميزة لسه مش مظبوطة على البيئة دي. بنرجّع 200 عشان ما
       نعلّمش التشغيل فاشل كل يوم، بس بنسجّل السبب صريح. */
    result.status = "skipped";
    result.reason = "VAPID keys غير مضبوطة (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)";
    console.warn("[cron/streak-reminder] skipped:", result.reason);
    return NextResponse.json(result, { status: 200 });
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const supabase = createServiceClient();

  try {
    // ── ١) الطلبة اللي المفروض يتبعتلهم: سلسلة ≥ ٣ ولسه ماذاكروش النهارده
    const atRisk: Array<{ id: string; streak: number }> = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const [from, to] = nextPageRange(page, PAGE_SIZE);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, streak, last_study_day")
        .gte("streak", STREAK_REMINDER_MIN)
        // `neq` في PostgREST بيستثني NULL، فبنضيف فرع is.null ونفلتره في JS
        .or(`last_study_day.is.null,last_study_day.neq.${today}`)
        .order("id", { ascending: true })
        .range(from, to);

      if (error) {
        errors.push(`profiles read: ${error.message}`);
        break;
      }

      const rows = (data ?? []) as Array<{
        id?: string;
        streak?: number | null;
        last_study_day?: string | null;
      }>;

      for (const row of rows) {
        if (typeof row?.id !== "string" || row.id === "") continue;
        result.scanned += 1;
        if (!isStreakAtRisk({ streak: row.streak, lastStudyDay: row.last_study_day, today })) {
          continue;
        }
        atRisk.push({ id: row.id, streak: Math.floor(Number(row.streak) || 0) });
      }

      if (rows.length < PAGE_SIZE) break;
    }

    result.at_risk = atRisk.length;

    // ── ٢) الاشتراكات المحفوظة لهم بس
    for (const chunk of chunkIds(atRisk, SUBSCRIPTION_CHUNK)) {
      const ids = chunk.map((row) => row.id);
      const { data: subs, error: subsError } = await supabase
        .from("push_subscriptions")
        .select("id, user_id, subscription")
        .in("user_id", ids);

      if (subsError) {
        errors.push(`push_subscriptions read: ${subsError.message}`);
        break;
      }

      const streakByUser = new Map(chunk.map((row) => [row.id, row.streak]));
      const subscriptions = (subs ?? []) as Array<{
        id?: string;
        user_id?: string;
        subscription?: unknown;
      }>;

      for (const sub of subscriptions) {
        if (typeof sub?.user_id !== "string" || !sub.subscription) continue;
        const streak = streakByUser.get(sub.user_id) ?? STREAK_REMINDER_MIN;
        const payload = buildStreakReminderPayload(streak);

        try {
          await webpush.sendNotification(
            sub.subscription as webpush.PushSubscription,
            JSON.stringify(payload)
          );
          result.notified += 1;
        } catch (pushError) {
          const statusCode = (pushError as { statusCode?: number }).statusCode;
          /* 404/410 = الاشتراك ميت (المستخدم مسح الموقع أو غيّر الجهاز).
             بنمسح الصف عشان ما نكرّرش المحاولة عليه كل يوم. */
          if (statusCode === 404 || statusCode === 410) {
            if (typeof sub.id === "string") {
              const { error: deleteError } = await supabase
                .from("push_subscriptions")
                .delete()
                .eq("id", sub.id);
              if (!deleteError) result.stale_removed += 1;
            }
          } else {
            result.failed += 1;
            errors.push(
              `push ${statusCode ?? "unknown"}: ${pushError instanceof Error ? pushError.message : String(pushError)}`
            );
          }
        }
      }
    }
  } catch (error) {
    result.status = "error";
    result.error = error instanceof Error ? error.message : String(error);
    errors.push(result.error);
  }

  if (result.status !== "error") {
    result.status =
      errors.length > 0 ? (result.notified > 0 ? "partial" : "error") : "success";
  }
  result.errors = errors.slice(0, 20);
  result.finished_at = new Date().toISOString();

  // السجل غير قاتل: فشله لا يُخفي نتيجة العملية.
  try {
    const { error: logError } = await supabase.from("cron_runs").insert({
      job_name: JOB_NAME,
      status: result.status,
      result,
      error_message: errors.length > 0 ? errors.join(" | ").slice(0, 1000) : null,
      duration_ms: Date.now() - startedAtMs,
    });
    if (logError) console.warn("[cron/streak-reminder] log insert failed:", logError.message);
  } catch (logError) {
    console.warn(
      "[cron/streak-reminder] log insert threw:",
      logError instanceof Error ? logError.message : logError
    );
  }

  const httpStatus = result.status === "error" ? 500 : 200;
  return NextResponse.json(result, { status: httpStatus });
}
