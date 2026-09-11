/**
 * /api/ai/file/generate — توليد محتوى منظم بالـ AI ثم تصديره كملف
 *
 * خطوة واحدة: الطالب بيدي موضوع + نوع المحتوى + صيغة الملف،
 * الراوت بيولّد البيانات المنظمة (ملخص/كويز/خطة/بطاقات) عبر راوتر الـ AI
 * وبيمرّرها لـ generateFile.
 *
 *   POST { topic, content, type?, subject?, stage?, studentName? }
 *   - لو type موجود → بيرجّع الملف نفسه (binary)
 *   - لو مفيش type  → بيرجّع البيانات المنظمة فقط { data }
 */
import { NextResponse } from "next/server";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError, type AiTaskType } from "@/lib/ai/types";
import { extractJson } from "@/lib/ai/structured";
import { recordAiOperation } from "@/lib/ai/operations";
import { checkRateLimit, requireUser } from "@/lib/api-guard";
import { guardAiAccessAndReserve, refundAiCreditIfNeeded } from "@/lib/ai/ai-credit-guard";
import { routeCandidates } from "@/lib/ai/routing";
import { filterAccessibleModels } from "@/lib/ai/model-access";
import { generateFile, type FileContent, type FileType } from "@/lib/ai/file-generator";
import {
  peekServiceQuota,
  consumeServiceQuota,
  refundServiceQuota,
  type AiServiceId,
} from "@/lib/ai/service-registry";

const VALID_TYPES: FileType[] = ["pdf", "docx", "xlsx", "pptx"];
const VALID_CONTENT: FileContent[] = ["summary", "quiz", "study_plan", "report", "flashcards"];

/** مهمة الراوتر المناسبة لكل نوع محتوى. */
const CONTENT_TASK: Record<FileContent, AiTaskType> = {
  summary: "summarize",
  report: "content",
  quiz: "quiz",
  study_plan: "study_plan",
  flashcards: "flashcards",
};

/** شكل الـ JSON المطلوب لكل نوع محتوى — بيروح في الـ prompt. */
const CONTENT_SCHEMA: Record<FileContent, string> = {
  summary: `{ "key_points": ["نقطة 1", "..."], "concepts": [{ "term": "المصطلح", "definition": "تعريفه" }] }`,
  report: `{ "key_points": ["..."], "sections": [{ "heading": "عنوان القسم", "body": "محتوى القسم" }] }`,
  quiz: `{ "questions": [{ "question": "نص السؤال", "options": ["أ", "ب", "ج", "د"], "correct_answer": "الإجابة الصحيحة بنفس نصها في الاختيارات", "explanation": "شرح مختصر", "difficulty": "سهل|متوسط|صعب" }] }`,
  study_plan: `{ "daily_schedule": [{ "day": "السبت", "tasks": [{ "subject": "المادة", "topic": "الموضوع", "duration_minutes": 30, "priority": "عالية|متوسطة|منخفضة" }] }] }`,
  flashcards: `{ "cards": [{ "front": "السؤال/المصطلح", "back": "الإجابة/التعريف" }] }`,
};

const CONTENT_AMOUNT: Record<FileContent, string> = {
  summary: "6-10 نقاط رئيسية و3-6 مفاهيم",
  report: "4-6 أقسام",
  quiz: "6 أسئلة اختيار من متعدد",
  study_plan: "خطة 7 أيام، في كل يوم 2-4 مهام",
  flashcards: "10 بطاقات",
};

export async function POST(req: Request) {
  try {
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    const limited = checkRateLimit(`file-generate:${user.id}`, 5, 60_000, "message");
    if (limited) return limited;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: { message: "جسم الطلب غير صالح." } }, { status: 400 });
    }

    const topic = String(body.topic ?? "").trim().slice(0, 300);
    const content = body.content as FileContent;
    const type = (body.type ?? undefined) as FileType | undefined;
    const subject = typeof body.subject === "string" ? body.subject.slice(0, 120) : undefined;
    const stage = typeof body.stage === "string" ? body.stage.slice(0, 40) : undefined;
    const studentName = typeof body.studentName === "string" ? body.studentName.slice(0, 120) : undefined;

    if (topic.length < 3) {
      return NextResponse.json(
        { error: { message: "اكتب موضوعًا واضحًا (٣ أحرف على الأقل)." } },
        { status: 400 }
      );
    }
    if (!VALID_CONTENT.includes(content)) {
      return NextResponse.json(
        { error: { message: `نوع المحتوى غير مدعوم: ${String(content)}` } },
        { status: 400 }
      );
    }
    if (type !== undefined && !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: { message: `صيغة الملف غير مدعومة: ${String(type)}` } },
        { status: 400 }
      );
    }

    // لو عايز ملف فعلًا — فحص حد خدمة الملفات للباقة (بدون خصم لسه)
    if (type) {
      const peek = await peekServiceQuota(supabase, user.id, `file_${type}` as AiServiceId);
      if (peek.limit <= 0 || peek.used >= peek.limit) {
        const reasonAr =
          peek.limit <= 0
            ? "صيغة الملف دي غير متاحة في باقتك الحالية."
            : `وصلت للحد اليومي من ملفات ${type} (${peek.limit}). بيتجدد الحد يوميًا بتوقيت UTC.`;
        return NextResponse.json(
          { error: { message: reasonAr, code: "QUOTA_EXCEEDED", tier: peek.tier } },
          { status: 402 }
        );
      }
    }

    // حجز رصيد نصي لتوليد المحتوى (1 طلب = 1 كريدت)
    const task = CONTENT_TASK[content];
    const candidates = routeCandidates(task);
    const hasEnt = async (k: string, v: string) => {
      const { data } = await supabase.rpc("has_entitlement", {
        p_user_id: user.id,
        p_kind: k,
        p_value: v,
      });
      return Boolean(data);
    };
    const accessible = await filterAccessibleModels(candidates, hasEnt);
    if (accessible.length === 0 && candidates.length > 0) {
      return NextResponse.json(
        { error: { message: "هذه المهمة تتطلب صلاحية. اشترِها من المتجر.", code: "MODEL_ACCESS_REQUIRED" } },
        { status: 403 }
      );
    }
    const guard = await guardAiAccessAndReserve(
      supabase,
      user.id,
      accessible[0]?.model ?? "openai/gpt-oss-120b"
    );
    if (!guard.ok) return guard.response;

    // الخصم الفعلي لحد الملفات — بعد ما الحجز اتقبل
    if (type) {
      const quota = await consumeServiceQuota(supabase, user.id, `file_${type}` as AiServiceId);
      if (!quota.allowed) {
        await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
        return NextResponse.json(
          { error: { message: quota.reasonAr, code: "QUOTA_EXCEEDED", tier: quota.tier } },
          { status: 402 }
        );
      }
    }

    let data: Record<string, unknown>;
    try {
      const system =
        "أنت مولّد محتوى تعليمي دقيق. أرجع JSON صالح فقط بدون أي نص خارج الـ JSON وبدون code blocks. التزم بالشكل المطلوب حرفيًا.";
      const userPrompt = [
        `أنشئ ${content === "quiz" ? "اختبارًا" : content === "study_plan" ? "خطة مذاكرة" : content === "flashcards" ? "بطاقات مراجعة" : content === "report" ? "تقريرًا" : "ملخصًا"} عن: "${topic}"`,
        subject ? `المادة: ${subject}` : "",
        stage ? `المرحلة الدراسية: ${stage}` : "",
        `الكمية المطلوبة: ${CONTENT_AMOUNT[content]}`,
        "اللغة: العربية.",
        "لا تخترع حقائق أو تواريخ غير مؤكدة؛ التزم بالمعلومات المتعارف عليها أكاديميًا.",
        `الشكل المطلوب (JSON):`,
        CONTENT_SCHEMA[content],
      ]
        .filter(Boolean)
        .join("\n");

      const completion = await aiRouter.completeChat(task, {
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
      });

      void recordAiOperation(supabase, {
        userId: user.id,
        provider: completion.provider,
        model: completion.model,
        taskType: task,
        status: "completed",
        usage: completion.usage,
        contentLength: completion.content.length,
      });

      const parsed = extractJson(completion.content);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("الموديل أرجع بيانات غير صالحة — جرّب مرة تانية.");
      }
      data = parsed as Record<string, unknown>;
    } catch (e) {
      await refundAiCreditIfNeeded(supabase, user.id, guard.refId);
      if (type) refundServiceQuota(user.id, `file_${type}` as AiServiceId);
      throw e;
    }

    // لو مش عايز ملف — ارجع البيانات المنظمة فقط
    if (!type) {
      return NextResponse.json({ ok: true, data, content, topic });
    }

    let result;
    try {
      result = await generateFile({
        type,
        content,
        title: topic,
        subject,
        data,
        studentName,
        language: "ar",
      });
    } catch (e) {
      // المحتوى اتولّد لكن التحويل لملف فشل — نرجّع حد الملف للمستخدم
      refundServiceQuota(user.id, `file_${type}` as AiServiceId);
      throw e;
    }

    const encoded = encodeURIComponent(result.filename);
    return new Response(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `attachment; filename="file.${type}"; filename*=UTF-8''${encoded}`,
        "Content-Length": result.size.toString(),
      },
    });
  } catch (error) {
    if (error instanceof AiProviderError) {
      return NextResponse.json(
        {
          error: {
            message:
              error.status === 429
                ? "مولّد المحتوى مشغول حاليًا. حاول تاني بعد شوية."
                : "تعذّر توليد المحتوى حاليًا.",
          },
        },
        { status: error.status === 429 ? 429 : 502 }
      );
    }
    console.error("[File Generate API]", error);
    return NextResponse.json(
      { error: { message: (error as Error).message || "حصل خطأ غير متوقع." } },
      { status: 500 }
    );
  }
}
