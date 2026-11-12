/* ==========================================================================
   POST /api/curriculum/expand

   بيوسّع منهجاً موجوداً بدروس جديدة:
   1) يتحقق من الملكية، ونسبة الإكمال (80%)، والحد الأقصى (50).
   2) بياخد المستوى والموضوعات من المادة نفسها — مش من الكلاينت.
   3) بيولّد دروس جديدة تبدأ من max(day_number)+1 بدون تكرار.
   4) بيلحقهم ويحدّث days_count عبر RPC واحد (transaction).

   التسعير: كريدت لكل 10 دروس إضافية، والفشل بيرجّع الكريدت.
   ========================================================================== */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit, requireUser } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { curriculumCreditCost } from "@/lib/ai/credit-pricing";
import { GROQ_MODELS } from "@/lib/ai-config";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";
import { generateCurriculum } from "@/lib/curriculum/service";
import {
  CURRICULUM_MAX_LESSONS,
  CURRICULUM_MIN_LESSONS,
  CurriculumGenerationError,
  type CurriculumLevel,
} from "@/lib/curriculum/types";

export const maxDuration = 60;

const MIN_COMPLETION_RATIO = 0.8;

interface ConfigRow {
  id: string;
  subject: string;
  category: string | null;
  curriculum_level: string | null;
  focus_topics: unknown;
}

function errorResponse(message: string, status: number, code: string) {
  return NextResponse.json({ success: false, error: message, code }, { status });
}

function normalizeLevel(value: string | null): CurriculumLevel {
  if (value === "beginner" || value === "advanced") return value;
  return "intermediate";
}

function parseFocusTopics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 10);
}

export async function POST(req: Request) {
  let supabase: SupabaseClient | null = null;
  let userId = "";
  let refundRef = "";

  try {
    const { user, supabase: client, response: authError } = await requireUser("success");
    if (authError) return authError;

    const db = client;
    supabase = db;
    userId = user.id;

    const limited = await checkRateLimit(`curriculum-expand:${user.id}`, 6, 60_000, "success");
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return errorResponse("البيانات المبعوتة غير صالحة.", 400, "INVALID_REQUEST");
    }

    const configId =
      typeof (body as { configId?: unknown }).configId === "string"
        ? (body as { configId: string }).configId.trim()
        : "";
    if (!configId) {
      return errorResponse("معرّف المادة مطلوب.", 400, "INVALID_REQUEST");
    }

    const additionalCount = Number((body as { additionalCount?: unknown }).additionalCount);
    if (
      !Number.isInteger(additionalCount) ||
      additionalCount < CURRICULUM_MIN_LESSONS ||
      additionalCount > CURRICULUM_MAX_LESSONS
    ) {
      return errorResponse(
        `عدد الدروس الإضافية لازم يكون رقم صحيح بين ${CURRICULUM_MIN_LESSONS} و ${CURRICULUM_MAX_LESSONS}.`,
        400,
        "INVALID_REQUEST"
      );
    }

    // المادة لازم تكون ملك المستخدم — الاستعلام نفسه بيضمن ده.
    const { data: configData, error: configError } = await db
      .from("study_configs")
      .select("id, subject, category, curriculum_level, focus_topics")
      .eq("id", configId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (configError) throw configError;
    if (!configData) {
      return errorResponse("المادة مش موجودة أو مش تابعة لحسابك.", 404, "COURSE_NOT_FOUND");
    }

    const config = configData as ConfigRow;

    const { data: dayRows, error: daysError } = await db
      .from("study_days")
      .select("day_number, topic, is_completed, learning_style")
      .eq("config_id", configId)
      .eq("user_id", user.id)
      .order("day_number", { ascending: true });

    if (daysError) throw daysError;

    const days = (dayRows ?? []) as Array<{
      day_number: number;
      topic: string | null;
      is_completed: boolean | null;
      learning_style: string | null;
    }>;

    const total = days.length;
    if (total === 0) {
      return errorResponse("المنهج لسه من غير دروس. أضف دروساً أولاً.", 409, "EMPTY_CURRICULUM");
    }

    const completed = days.filter((day) => day.is_completed).length;
    const requiredCompleted = Math.ceil(total * MIN_COMPLETION_RATIO);
    if (completed < requiredCompleted) {
      return errorResponse(
        "التوسيع متاح بعد إكمال 80% من الدروس على الأقل.",
        409,
        "EXPANSION_NOT_READY"
      );
    }

    if (total + additionalCount > CURRICULUM_MAX_LESSONS) {
      return errorResponse(
        `الحد الأقصى للمنهج ${CURRICULUM_MAX_LESSONS} درساً. تقدر تضيف ${Math.max(
          0,
          CURRICULUM_MAX_LESSONS - total
        )} درساً كحد أقصى.`,
        400,
        "LESSON_LIMIT_REACHED"
      );
    }

    const maxDay = days.reduce((max, day) => Math.max(max, day.day_number), 0);
    const existingTopics = days
      .map((day) => (day.topic ?? "").trim())
      .filter((topic) => topic.length > 0);

    const learningStyle = days.at(-1)?.learning_style ?? "practical";

    const cost = curriculumCreditCost(additionalCount);
    const guard = await guardAiAccessAndReserve(db, user.id, GROQ_MODELS.advanced, {
      cost,
    });
    if (!guard.ok) return guard.response;
    refundRef = guard.refId;

    const usage = resolveUsageRequestContext(req, user.id, {
      feature: "curriculum_expand",
      diagnostics: {
        configId,
        additionalCount,
        existingLessons: total,
        credits: cost,
      },
    });

    const generated = await generateCurriculum(
      {
        subject: config.subject,
        category: config.category ?? "دراسة أكاديمية",
        level: normalizeLevel(config.curriculum_level),
        lessonCount: additionalCount,
        focusTopics: parseFocusTopics(config.focus_topics),
        personaContext: "",
        startDay: maxDay + 1,
        existingTopics,
      },
      usage
    );

    const { data: rpcData, error: rpcError } = await db.rpc("append_curriculum_days", {
      p_config_id: configId,
      p_days: generated.days.map((day) => ({
        day: day.day,
        title: day.title,
        topic: day.topic,
        description: day.description,
      })),
      p_learning_style: learningStyle,
    });

    if (rpcError) throw rpcError;

    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;

    return NextResponse.json({
      success: true,
      data: {
        configId,
        added: generated.days.length,
        startDay: row?.start_day ?? maxDay + 1,
        daysCount: row?.days_count ?? total + generated.days.length,
        days: generated.days,
      },
      creditsCharged: cost,
    });
  } catch (error) {
    if (refundRef && supabase && userId) {
      try {
        await refundAiCreditIfNeeded(supabase, userId, refundRef);
      } catch (refundError) {
        console.error("curriculum/expand: refund failed", refundError);
      }
    }

    if (error instanceof CurriculumGenerationError) {
      return errorResponse(error.message, error.status, error.code);
    }

    console.error("curriculum/expand failed:", error);
    const message = error instanceof Error ? error.message : "";
    if (/append_curriculum_days|function/i.test(message)) {
      return errorResponse(
        "دالة التوسيع غير موجودة. شغّل db/34-expand-curriculum-function.sql في Supabase وبعدها حاول تاني.",
        500,
        "MIGRATION_REQUIRED"
      );
    }

    return errorResponse("حصل خطأ أثناء توسيع المنهج. حاول تاني.", 500, "INTERNAL_ERROR");
  }
}
