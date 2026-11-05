"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/* ==========================================================================
   فتح درس مبكراً مقابل 150 XP

   الخصم والإدخال في study_day_unlocks بيحصلوا جوه RPC واحد
   (unlock_study_day) — مش هنا. السبب إن الخصم والإدخال لازم يكونوا
   في معاملة واحدة، وده مش مضمون لو عملناه من عميل JS.
   ========================================================================== */

export type UnlockDayResult =
  | { ok: true; xpRemaining: number }
  | { ok: false; error: string };

function friendlyUnlockError(raw: string): string {
  if (/insufficient xp/i.test(raw)) {
    return "محتاج 150 XP على الأقل عشان تفتح الدرس ده بدري.";
  }
  if (/already completed/i.test(raw)) {
    return "الدرس ده مكتمل بالفعل — مش محتاج فتح مبكر.";
  }
  if (/day is not locked/i.test(raw)) {
    return "الدرس ده مفتوح أصلاً. كمّل عادي.";
  }
  if (/first lesson|already open/i.test(raw)) {
    return "الدرس الأول مفتوح دايماً — مش محتاج فتح مبكر.";
  }
  if (/anonymous|not authenticated/i.test(raw)) {
    return "سجّل دخول الأول عشان تقدر تفتح دروس بدري.";
  }
  if (/unlock_study_day|does not exist|could not find the function/i.test(raw)) {
    return "جدول/دالة الفتح المبكر لسه مش متظبطة. شغّل db/35-study-day-unlocks.sql في Supabase.";
  }
  return "مقدرناش نفتح الدرس دلوقتي. حاول تاني.";
}

export async function unlockStudyDay(dayId: string): Promise<UnlockDayResult> {
  if (!dayId) return { ok: false, error: "الدرس غير صالح." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "سجّل دخول الأول عشان تقدر تفتح دروس بدري." };
  }

  const { data, error } = await supabase.rpc("unlock_study_day", {
    p_day_id: dayId,
  });

  if (error) {
    return { ok: false, error: friendlyUnlockError(error.message ?? "") };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const xpRemaining = Number(row?.xp_remaining);

  // الصفحات اللي بتقرأ من السيرفر تتفعّل من جديد. الداشبورد عميل،
  // فبيحدّث حالته من القيمة اللي بترجع من هنا كمان.
  revalidatePath("/dashboard");
  revalidatePath("/lessons");
  revalidatePath("/lessons/[configId]", "page");
  revalidatePath("/lesson/[dayId]", "page");

  return {
    ok: true,
    xpRemaining: Number.isFinite(xpRemaining) ? xpRemaining : 0,
  };
}
