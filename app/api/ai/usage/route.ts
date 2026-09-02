import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  checkAiRateLimit,
  checkGuestRateLimit,
  isPremiumUser,
} from "@/lib/ai/rate-limit";

/**
 * GET /api/ai/usage
 * REAL DATA ONLY — reads ai_credit_ledger via existing rate-limit helpers.
 * No hard-coded limits, no new table.
 * Returns text/vision windowed usage for current user.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "غير مسجل", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const isAnonymous = Boolean((user as unknown as { is_anonymous?: boolean }).is_anonymous);

  if (isAnonymous) {
    const guest = await checkGuestRateLimit(supabase, user.id);
    return NextResponse.json({
      ok: true,
      isAnonymous: true,
      isPremium: false,
      guest: {
        limit: guest.limit,
        used: guest.used,
        remaining: guest.remaining,
        windowHours: guest.windowHours,
        ...(!guest.allowed ? { retryAfter: guest.retryAfter, oldestAt: guest.oldestAt } : {}),
      },
      text: {
        limit: guest.limit,
        used: guest.used,
        remaining: guest.remaining,
        windowHours: guest.windowHours,
        ...(!guest.allowed ? { retryAfter: guest.retryAfter } : {}),
      },
      vision: {
        limit: 0,
        used: 0,
        remaining: 0,
        windowHours: 0,
      },
    });
  }

  const isPremium = await isPremiumUser(supabase, user.id);

  const [textRate, visionRate] = await Promise.all([
    checkAiRateLimit(supabase, user.id, { isVisionOrFile: false }),
    checkAiRateLimit(supabase, user.id, { isVisionOrFile: true }),
  ]);

  return NextResponse.json({
    ok: true,
    isAnonymous: false,
    isPremium,
    text: {
      limit: textRate.limit,
      used: textRate.used,
      remaining: textRate.remaining,
      windowHours: textRate.windowHours,
      ...(textRate.allowed ? {} : { retryAfter: (textRate as Extract<typeof textRate, { allowed: false }>).retryAfter, oldestAt: (textRate as Extract<typeof textRate, { allowed: false }>).oldestAt }),
    },
    vision: {
      limit: visionRate.limit,
      used: visionRate.used,
      remaining: visionRate.remaining,
      windowHours: visionRate.windowHours,
      ...(visionRate.allowed ? {} : { retryAfter: (visionRate as Extract<typeof visionRate, { allowed: false }>).retryAfter, oldestAt: (visionRate as Extract<typeof visionRate, { allowed: false }>).oldestAt }),
    },
  });
}
