/* ==========================================================================
   POST /api/curriculum/generate

   بيولّد هيكل منهج كامل (Outline + أوصاف) ويرجّعه للواجهة للمعاينة.
   ⚠️ الراوت ده **مش بيحفظ** أي حاجة في قاعدة البيانات — الحفظ مسؤولية
   خطوة التأكيد في الـ Wizard (المرحلة الجاية)، عشان المستخدم يشوف
   العناوين ويعيد التوليد قبل أي كتابة.

   التسعير: سيرفر-سايد فقط — كريدت لكل 10 دروس (بحد أدنى 1).
   الفشل بيرجّع الكريدت كامل (refund)، ومفيش أي قوالب صامتة.
   ========================================================================== */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit, clampText, requireUser } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { curriculumCreditCost } from "@/lib/ai/credit-pricing";
import { GROQ_MODELS } from "@/lib/ai-config";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";
import { generateCurriculum } from "@/lib/curriculum/service";
import { buildEducationalContext } from "@/lib/curriculum/prompts";
import {
  CURRICULUM_LEVELS,
  CURRICULUM_MAX_FOCUS_TOPIC_CHARS,
  CURRICULUM_MAX_FOCUS_TOPICS,
  CURRICULUM_MAX_LESSONS,
  CURRICULUM_MAX_PERSONA_CONTEXT_CHARS,
  CURRICULUM_MAX_SUBJECT_CHARS,
  CURRICULUM_MAX_CATEGORY_CHARS,
  CURRICULUM_MIN_LESSONS,
  CurriculumGenerationError,
  type CurriculumGenerationInput,
  type CurriculumLevel,
} from "@/lib/curriculum/types";

export const maxDuration = 60;

function errorResponse(message: string, status: number, code: string) {
  return NextResponse.json({ success: false, error: message, code }, { status });
}

/**
 * B4.0.2g-f: مصدر الحقيقة هو السيرفر — بيجيب سياق الطالب التعليمي من
 * ملفه (المرحلة/الصف/المسار بأسمائها) عشان الموديل ما يعتمدش على
 * الكلينت في تحديد المسار. الفشل هنا مش حرج — الإحقнамتخطى.
 */
async function loadEducationalContext(
  db: SupabaseClient,
  userId: string
): Promise<string> {
  try {
    const { data: profile } = await db
      .from("profiles")
      .select("education_stage_id, education_grade_id, education_track_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) return "";

    const lookupName = async (
      table: "education_stages" | "education_grades" | "education_tracks",
      id: unknown
    ): Promise<string | null> => {
      if (!id || typeof id !== "string") return null;
      const { data } = await db.from(table).select("name").eq("id", id).maybeSingle();
      return typeof data?.name === "string" ? data.name : null;
    };

    return buildEducationalContext({
      stage: await lookupName("education_stages", profile.education_stage_id),
      grade: await lookupName("education_grades", profile.education_grade_id),
      track: await lookupName("education_tracks", profile.education_track_id),
    });
  } catch (error) {
    console.error("curriculum/generate: educational context lookup failed", error);
    return "";
  }
}

function parseRequest(body: Record<string, unknown>):
  | { ok: true; input: CurriculumGenerationInput }
  | { ok: false; message: string } {
  const subject = clampText(body.subject, CURRICULUM_MAX_SUBJECT_CHARS).trim();
  if (!subject) {
    return { ok: false, message: "اسم المادة مطلوب." };
  }

  const category =
    clampText(body.category, CURRICULUM_MAX_CATEGORY_CHARS).trim() || "دراسة أكاديمية";

  const levelRaw = typeof body.level === "string" ? body.level.trim() : "";
  if (!CURRICULUM_LEVELS.includes(levelRaw as CurriculumLevel)) {
    return {
      ok: false,
      message: "مستوى العمق لازم يكون واحد من: مبتدئ، متوسط، متقدم.",
    };
  }

  const lessonCount = Number(body.lessonCount);
  if (
    !Number.isInteger(lessonCount) ||
    lessonCount < CURRICULUM_MIN_LESSONS ||
    lessonCount > CURRICULUM_MAX_LESSONS
  ) {
    return {
      ok: false,
      message: `عدد الدروس لازم يكون رقم صحيح بين ${CURRICULUM_MIN_LESSONS} و ${CURRICULUM_MAX_LESSONS}.`,
    };
  }

  if (body.focusTopics !== undefined && !Array.isArray(body.focusTopics)) {
    return { ok: false, message: "الموضوعات المركزة لازم تكون قائمة نصية." };
  }

  const seen = new Set<string>();
  const focusTopics: string[] = [];
  for (const raw of Array.isArray(body.focusTopics) ? body.focusTopics : []) {
    if (typeof raw !== "string") continue;
    const topic = raw.trim().slice(0, CURRICULUM_MAX_FOCUS_TOPIC_CHARS);
    if (!topic) continue;
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    focusTopics.push(topic);
    if (focusTopics.length >= CURRICULUM_MAX_FOCUS_TOPICS) break;
  }

  const personaContext = clampText(
    body.personaContext,
    CURRICULUM_MAX_PERSONA_CONTEXT_CHARS
  ).trim();

  return {
    ok: true,
    input: {
      subject,
      category,
      level: levelRaw as CurriculumLevel,
      lessonCount,
      focusTopics,
      personaContext,
    },
  };
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

    const limited = checkRateLimit(`curriculum-generate:${user.id}`, 6, 60_000, "success");
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return errorResponse("البيانات المبعوتة غير صالحة.", 400, "INVALID_REQUEST");
    }

    const parsed = parseRequest(body as Record<string, unknown>);
    if (!parsed.ok) {
      return errorResponse(parsed.message, 400, "INVALID_REQUEST");
    }

    const { input } = parsed;

    // B4.0.2g-f: السياق التعليمي من الـ DB — يتعامل قبل أي خصم كريدت،
    // ومُحقن في بداية personaContext (مساحة 1200 بتستوعب السطرين).
    const educationalContext = await loadEducationalContext(db, userId);
    if (educationalContext) {
      input.personaContext = [educationalContext, input.personaContext]
        .filter(Boolean)
        .join(" ")
        .slice(0, CURRICULUM_MAX_PERSONA_CONTEXT_CHARS);
    }

    // السيرفر هو مصدر التكلفة: كريدت لكل 10 دروس.
    const cost = curriculumCreditCost(input.lessonCount);
    const guard = await guardAiAccessAndReserve(db, user.id, GROQ_MODELS.advanced, {
      cost,
    });
    if (!guard.ok) return guard.response;
    refundRef = guard.refId;

    const usage = resolveUsageRequestContext(req, user.id, {
      feature: "curriculum_generate",
      diagnostics: {
        lessonCount: input.lessonCount,
        level: input.level,
        focusTopics: input.focusTopics.length,
        credits: cost,
      },
    });

    const result = await generateCurriculum(input, usage);

    return NextResponse.json({
      success: true,
      data: result,
      creditsCharged: cost,
    });
  } catch (error) {
    if (refundRef && supabase && userId) {
      try {
        await refundAiCreditIfNeeded(supabase, userId, refundRef);
      } catch (refundError) {
        console.error("curriculum/generate: refund failed", refundError);
      }
    }

    if (error instanceof CurriculumGenerationError) {
      return errorResponse(error.message, error.status, error.code);
    }

    console.error("curriculum/generate failed:", error);
    return errorResponse(
      "حصل خطأ أثناء توليد المنهج. حاول تاني.",
      500,
      "INTERNAL_ERROR"
    );
  }
}
