// app/api/engagement/discovery/route.ts
//
// P1-B2.2 — Smart Notes Feature Discovery API.
//
// GET  → حالة اكتشاف Smart Notes للمستخدم الحالي (undiscovered/introduced/
//        tried/adopted + نصوص العرض). القراءة من الـDB، والمستخدم بيشوف
//        حالته بس (RLS owner read).
// POST → يسجّل “التعرّف” (introduced) — SERVER-SIDE فقط.
//
// ⚠️ **مفيش POST من العميل لتغيير الحالة try/adopt**:
//    `tried`/`adopted` بيتشتقوا من `engagement_events` في الـDB. العميل
//    ميقدرش يدّعي إنه جرّب.
//
// ⚠️ ممنوع في هذه المرحلة: Coins، XP، Missions، Push.

import { NextResponse } from "next/server";

import { checkRateLimit, requireUser } from "@/lib/api-guard";
import {
  decideDiscoveryPresentation,
  FEATURE_KEYS,
  isDiscoverableFeature,
  type FeatureKey,
} from "@/lib/engagement/feature-contract";
import {
  getFeatureDiscoveryState,
  recordFeatureIntroduction,
  refreshFeatureDiscoveryState,
} from "@/lib/engagement/features";

export const dynamic = "force-dynamic";

const SMART_NOTES = FEATURE_KEYS.SMART_NOTES;

export async function GET(request: Request) {
  try {
    const { user, response: authError } = await requireUser("message");
    if (authError) return authError;

    const url = new URL(request.url);
    const requested = url.searchParams.get("feature") ?? SMART_NOTES;
    const featureKey = (requested === SMART_NOTES ? SMART_NOTES : requested) as FeatureKey;

    // ⛔ Discovery بيخدم المميزات القابلة للاكتشاف فقط. المميزات غير
    //    المتاحة أو غير المفعّلة ماتتردّش أصلاً (مفيش تسريب حالة).
    if (!isDiscoverableFeature(featureKey)) {
      return NextResponse.json(
        { error: { message: "الميزة دي مش متاحة للاكتشاف." } },
        { status: 404 },
      );
    }

    // ١) نحدّث الحالة من الأحداث الموثّقة (tried/adopted) —(server side).
    await refreshFeatureDiscoveryState(user.id, featureKey);

    // ٢) نقرأ الحالة النهائية.
    const snapshot = await getFeatureDiscoveryState(user.id, featureKey);
    if (!snapshot) {
      return NextResponse.json({ error: { message: "الميزة دي مش متاحة." } }, { status: 404 });
    }

    const decision = decideDiscoveryPresentation(featureKey, {
      state: snapshot.state,
      dismissCount: snapshot.dismissCount,
    });

    return NextResponse.json({
      feature: featureKey,
      state: snapshot.state,
      availability: snapshot.availability,
      label: snapshot.label,
      route: snapshot.route,
      dismissCount: snapshot.dismissCount,
      decision,
      copy: {
        intro: decision.showIntro ? snapshot.discoveryCopy : null,
        tip: decision.showTip ? snapshot.tipCopy : null,
      },
    });
  } catch (error) {
    console.error("[engagement/discovery] GET:", error);
    return NextResponse.json(
      { error: { message: "حصل خطأ غير متوقع. حاول تاني." } },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { user, response: authError } = await requireUser("message");
    if (authError) return authError;

    const limited = await checkRateLimit(
      `engagement-discovery:${user.id}`,
      10,
      60_000,
      "message",
    );
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) as {
      feature?: unknown;
      surface?: unknown;
      action?: unknown;
    } | null;

    const featureKey =
      typeof body?.feature === "string" && body.feature === SMART_NOTES
        ? SMART_NOTES
        : SMART_NOTES;
    const surface = typeof body?.surface === "string" ? body.surface.slice(0, 60) : "unknown";

    // الإجراء المسموح الوحيد دلوقتي: تسجيل التعريف.
    const action = typeof body?.action === "string" ? body.action : "introduce";
    if (action !== "introduce") {
      return NextResponse.json(
        { error: { message: "الإجراء ده مش متاح." } },
        { status: 400 },
      );
    }

    const state = await recordFeatureIntroduction(user.id, featureKey, surface);
    if (!state) {
      return NextResponse.json(
        { error: { message: "الميزة دي مش قابلة للاكتشاف." } },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, feature: featureKey, state });
  } catch (error) {
    console.error("[engagement/discovery] POST:", error);
    return NextResponse.json(
      { error: { message: "حصل خطأ غير متوقع. حاول تاني." } },
      { status: 500 },
    );
  }
}
