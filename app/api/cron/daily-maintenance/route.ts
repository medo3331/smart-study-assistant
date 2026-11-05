import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/admin";
import {
  isAuthorizedCronRequest,
  isMonthlyGraceWindow,
  nextPageRange,
} from "@/lib/cron/daily-maintenance";

/**
 * GET /api/cron/daily-maintenance — صيانة الكريدت اليومية (Phase B2.3)
 *
 * ١) `expire_old_grants()` دائمًا: تُصفّر المنح المنتهية وتكتب صفوف `expire`
 *    سالبة في `ai_credit_ledger` (تنفيذ الدالة نفسها، لا نلمسها هنا).
 * ٢) `grant_monthly_credits(user)` مرة واحدة شهريًا، **فقط** في نافذة 1..3
 *    لتغطية فشل التشغيل الأول. الدالة idempotent عبر `monthly:<user>:<YYYY-MM>`.
 * ٣) كل تشغيل يُسجَّل في `cron_runs` بحالته ومدّته.
 *
 * ⚠️ **لماذا نمرّ على `profiles` لا على `entitlements`:**
 *   `grant_monthly_credits` تعالج المستخدم الذي لا يملك entitlement كخطة
 *   `free` (وله 50 كريدت شهريًا في `subscription_plans`). التمرير على
 *   `entitlements` فقط كان سيحرم **كل مستخدمي free** من منحهم.
 *
 * ⚠️ الأمان: الترويسة تُقارن زمنيًا آمنًا، ولو `CRON_SECRET` غير مضبوط
 *   فالطلب يُرفض دائمًا (fail-closed) — لا يوجد cron مفتوح.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOB_NAME = "daily-maintenance";
const PAGE_SIZE = 500;
const MAX_PAGES = 10; // سقف 5000 مستخدم لكل تشغيل

type CronResult = {
  started_at: string;
  finished_at?: string;
  status: "success" | "error" | "partial";
  expired?: unknown;
  monthly_grants?: unknown;
  errors?: string[];
  error?: string;
};

export async function GET(req: NextRequest) {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();

  if (!isAuthorizedCronRequest(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const results: CronResult = { started_at: startedAt, status: "success" };
  const errors: string[] = [];

  try {
    // ── ١) انتهاء المنح — كل يوم
    const { data: expireData, error: expireError } = await supabase.rpc("expire_old_grants");
    if (expireError) {
      errors.push(`expire_old_grants: ${expireError.message}`);
      results.expired = { error: expireError.message };
    } else {
      results.expired = expireData;
    }

    // ── ٢) المنح الشهرية — ضمن النافذة فقط
    const now = new Date();
    if (isMonthlyGraceWindow(now)) {
      let scanned = 0;
      let grantedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const [from, to] = nextPageRange(page, PAGE_SIZE);
        const { data: users, error: usersError } = await supabase
          .from("profiles")
          .select("id")
          .order("id", { ascending: true })
          .range(from, to);

        if (usersError) {
          errors.push(`profiles read: ${usersError.message}`);
          break;
        }

        const rows = (users ?? []) as Array<{ id?: string }>;
        if (rows.length === 0) break;

        for (const row of rows) {
          if (typeof row?.id !== "string" || row.id === "") continue;
          scanned += 1;
          const { data, error } = await supabase.rpc("grant_monthly_credits", {
            p_user_id: row.id,
          });
          if (error) {
            failedCount += 1;
            continue;
          }
          const outcome = (Array.isArray(data) ? data[0] : data) as
            | { granted?: boolean }
            | null;
          if (outcome?.granted) grantedCount += 1;
          else skippedCount += 1;
        }

        if (rows.length < PAGE_SIZE) break;
      }

      // لا نُخزّن معرّفات المستخدمين في السجل — أعداد فقط.
      results.monthly_grants = {
        scanned,
        granted_count: grantedCount,
        skipped_count: skippedCount,
        failed_count: failedCount,
      };
      if (failedCount > 0) errors.push(`grant_monthly_credits failed for ${failedCount} users`);
    } else {
      results.monthly_grants = {
        skipped: `day ${now.getDate()} outside grace window 1-3`,
      };
    }
  } catch (error) {
    results.status = "error";
    results.error = error instanceof Error ? error.message : String(error);
    errors.push(results.error);
  }

  if (results.status !== "error") {
    results.status = errors.length > 0 ? "partial" : "success";
  }
  results.errors = errors;
  results.finished_at = new Date().toISOString();

  const durationMs = Date.now() - startedAtMs;

  // السجل غير قاتل: فشله لا يُخفي نتيجة العملية.
  try {
    const { error: logError } = await supabase.from("cron_runs").insert({
      job_name: JOB_NAME,
      status: results.status,
      result: results,
      error_message: errors.length > 0 ? errors.join(" | ").slice(0, 1000) : null,
      duration_ms: durationMs,
    });
    if (logError) console.warn("[cron/daily-maintenance] log insert failed:", logError.message);
  } catch (logError) {
    console.warn(
      "[cron/daily-maintenance] log insert threw:",
      logError instanceof Error ? logError.message : logError
    );
  }

  // الفشل يجب أن يظهر للـ cron (Vercel يعلّم التشغيل فاشلًا على 5xx).
  const httpStatus = results.status === "error" ? 500 : 200;
  return NextResponse.json(results, { status: httpStatus });
}
