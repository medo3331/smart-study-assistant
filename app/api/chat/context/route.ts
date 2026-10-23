import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";

/**
 * سياق واجهة الشات فقط. لا يعيد محتوى الملفات أو تاريخًا كاملاً للمحادثات؛
 * الراوت `/api/chat` يبني السياق الموثوق للـ AI بنفسه وقت إرسال السؤال.
 */
export async function GET() {
  const { user, supabase, response: authError } = await requireUser("message");
  if (authError) return authError;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let profileResult: any = { data: null, error: null };
  let configResult: any = { data: null, error: null };
  try {
    [profileResult, configResult] = await Promise.all([
      supabase.from("profiles").select("subject").eq("id", user.id).maybeSingle(),
      supabase
        .from("study_configs")
        .select("id, subject")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  } catch (e) {
    console.error("[chat/context] profile/config fetch failed:", e);
  }

  const config = configResult?.data ?? null;
  let daysResult: any = { data: [], error: null };
  try {
    daysResult = config
      ? await supabase
          .from("study_days")
          .select("id, day, topic, is_completed")
          .eq("config_id", config.id)
          .eq("user_id", user.id)
          .order("day", { ascending: true })
      : { data: [], error: null };
  } catch (e) {
    console.error("[chat/context] study_days fetch failed:", e);
    daysResult = { data: [], error: null };
  }

  const days = (daysResult.data ?? []) as Array<{
    id: string;
    day: number;
    topic: string | null;
    is_completed: boolean | null;
  }>;
  const currentLesson = days.find((day) => !day.is_completed) ?? days.at(-1) ?? null;
  const name =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
    "صديقي";

  return NextResponse.json({
    name,
    subject: config?.subject ?? profileResult.data?.subject ?? "",
    configId: config?.id ?? null,
    lesson: currentLesson
      ? { id: currentLesson.id, day: currentLesson.day, topic: currentLesson.topic ?? "الدرس الحالي" }
      : null,
    progress: { completed: days.filter((day) => day.is_completed).length, total: days.length },
  });
}
