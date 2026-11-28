import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import {
  advanceOnboarding,
  initialOnboardingState,
  isValidOnboardingAction,
  normalizeOnboardingRow,
  type OnboardingState,
} from "@/lib/onboarding/steps";

/* ==========================================================================
   Onboarding Progress — حفظ حالة جولة التعريف بالمنصة لكل مستخدم.
   GET: قراءة الحالة. POST: { action: start | next | complete | skip | reset }.
   بدون AI ⇒ بدون خصم Credits. كل الكتابة عبر RLS (صف المستخدم فقط).
   ========================================================================== */

function stateResponse(state: OnboardingState) {
  return NextResponse.json({ success: true, state });
}

export async function GET() {
  const { user, supabase, response: authError } = await requireUser("success");
  if (authError) return authError;

  try {
    const { data } = await supabase
      .from("onboarding_progress")
      .select("current_step, completed_steps, completed_at, skipped_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!data) return NextResponse.json({ success: true, state: initialOnboardingState() });
    return NextResponse.json({ success: true, state: normalizeOnboardingRow(data) });
  } catch (err) {
    console.warn("onboarding: load failed", err);
    return NextResponse.json({ success: true, state: initialOnboardingState() });
  }
}

export async function POST(request: Request) {
  const { user, supabase, response: authError } = await requireUser("success");
  if (authError) return authError;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: { message: "طلب غير صالح" } }, { status: 400 });
  }

  const action = (body as { action?: unknown } | null)?.action;
  if (!isValidOnboardingAction(action)) {
    return NextResponse.json({ success: false, error: { message: "إجراء غير معروف" } }, { status: 400 });
  }

  let current: OnboardingState = initialOnboardingState();
  try {
    const { data } = await supabase
      .from("onboarding_progress")
      .select("current_step, completed_steps, completed_at, skipped_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) current = normalizeOnboardingRow(data);
  } catch (err) {
    console.warn("onboarding: load before advance failed", err);
  }

  const next = advanceOnboarding(current, action);
  const now = new Date().toISOString();

  try {
    const { error } = await supabase.from("onboarding_progress").upsert(
      {
        user_id: user.id,
        current_step: next.currentStep,
        completed_steps: next.completedSteps,
        completed_at: next.completed ? now : null,
        skipped_at: next.skipped ? now : null,
        updated_at: now,
      },
      { onConflict: "user_id" }
    );
    if (error) throw error;
  } catch (err) {
    console.warn("onboarding: save failed", err);
    return NextResponse.json(
      { success: false, error: { message: "مقدرناش نحفظ تقدم الجولة — جرب تاني." } },
      { status: 503 }
    );
  }

  return stateResponse(next);
}
