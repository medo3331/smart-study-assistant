import { NextResponse } from "next/server";
import { requireUser, checkRateLimit, clampText } from "@/lib/api-guard";
import { aiRouter } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/types";
import { recordAiOperation } from "@/lib/ai/operations";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";

/* ==========================================================================
   محتوى الدرس — توليد مرة واحدة وحفظ في `lesson_content` (Phase 1.2)

   قبل هذا الراوت: كل فتحة للدرس وكل ضغطة تاب شرح كانت بتستهلك نداء AI
   جديد وتنزل من الذاكرة (`/api/ai/generate` من غير أي حفظ) — نفس المحتوى
   بييتولّد كل مرة ويضيع لما الطالب يقفل الصفحة.

   النموذج دلوقتي:
     1) الطالب يفتح الدرس → الصفحة بتبعت POST { dayId, mode: "simple" }.
     2) الراوت يقرا `lesson_content` — لو الوضع متحفظ: يرجعه فورًا (صفر نداء AI).
     3) وإلا: يولّد من برومبت **مبني على السيرفر** (الموضوع من study_days
        والمادة من study_configs — مش من الكلاينت) ويعمل merge للوضع في
        `explanation` ويرجّعه.
     4) فشل الحفظ (migration لسه ما اتشغلتش) مش بيكسر الرد — المحتوى
        بيوصل الطالب والحفظ بيتعاد في الزيارة الجاية (نفس نمط best-effort
        الموجود في /api/chat).

   التوكنز/الكوتة: نفس معاملات `/api/ai/generate` (كوتة شات البوت مش
   مفعّلة هنا — الميزات الأساسية مفتوحة) + حد استخدام ٢٠ نداء/دقيقة.
   ========================================================================== */

export const maxDuration = 60;

/** أوضاع الشرح الأربعة — نفس تبويبات SmartContentViewer بالظبط. */
const CONTENT_MODES = ["simple", "academic", "visual", "practical"] as const;
type ContentMode = (typeof CONTENT_MODES)[number];

function isContentMode(value: unknown): value is ContentMode {
  return typeof value === "string" && (CONTENT_MODES as readonly string[]).includes(value);
}

/** شخصية الشرح — منقولة من الـ systemInstruction اللي كان بيبعته الكلاينت. */
const SYSTEM_PROMPT =
  "أنت مساعد تعليمي يكتب شرحاً واضحاً للمادة. " +
  "اكتب بالعربية الفصحى المبسطة، مع الإبقاء على المصطلحات التقنية والمعادلات والرموز بالإنجليزية زي ما هي متعارف عليها في المراجع العلمية " +
  "(متكتبش المصطلح العلمي بالعربي لو مفيش ترجمة شائعة ليه). " +
  "استخدم تنسيق Markdown بسيط: **نص عريض** للمصطلحات المهمة، وقوائم نقطية (- أو *) للنقاط، وعناوين فرعية لو الشرح طويل. " +
  "أسلوبك: هدوء واحترام ووضوح، بلا مبالغة ولا ألقاب حماسية ولا ختام تشجيعي ثابت. " +
  "خلي الشرح عملي ومفيد فعلاً مش سطحي، لكن من غير حشو زيادة عن اللزوم.";

/** خريطة مراحل التعليم → اسم عربي (نفس اللي في صفحة الدرس). */
const STAGE_LABELS: Record<string, string> = {
  PRIMARY: "ابتدائي",
  PREPARATORY: "إعدادي",
  SECONDARY: "ثانوي",
  BACCALAUREATE: "بكالوريا",
  UNIVERSITY: "جامعة",
};

/**
 * سياق الطالب التعليمي — بيتبعت كـ object من الصفحة ويتحط في البرومبت هنا.
 * كل قيمة بتتقفل بحرف أقصى (بيانات عرض بس — مش أوامر).
 */
function eduLineFrom(edu: unknown): string {
  if (!edu || typeof edu !== "object") return "";
  const record = edu as Record<string, unknown>;
  const parts: string[] = [];
  const stage = typeof record.stage === "string" ? record.stage.trim().slice(0, 40) : "";
  const grade = typeof record.grade === "string" ? record.grade.trim().slice(0, 60) : "";
  const track = typeof record.track === "string" ? record.track.trim().slice(0, 60) : "";
  const faculty = typeof record.faculty === "string" ? record.faculty.trim().slice(0, 60) : "";
  if (stage) parts.push(STAGE_LABELS[stage] ?? stage);
  if (grade) parts.push(grade);
  if (track) parts.push(track);
  if (faculty) parts.push(faculty);
  return parts.length ? `سياق الطالب: ${parts.join(" — ")}.` : "";
}

/**
 * برومبت كل وضع — نفس نص الصفحة القديمة حرفيًا (كانت في SmartContentViewer)،
 * بس بقت مبنية على السيرفر من `topic`/`subject` المقروءين من الداتابيز.
 */
const MODE_PROMPTS: Record<ContentMode, (topic: string, subject: string, eduLine: string) => string> = {
  simple: (topic, subject, eduLine) =>
    `اشرح مفهوم "${topic}" (جزء من مادة ${subject}) بشكل مبسط في نقاط واضحة، مع مثال بسيط يوضح الفكرة. ${eduLine} اكتب الشرح بالعربي، لكن حافظ على المصطلحات التقنية بالإنجليزية بين قوسين أو مباشرة (زي: Signal, System, Frequency) لأنها المصطلحات المستخدمة في المراجع والامتحانات.`,
  academic: (topic, subject, eduLine) =>
    `اشرح "${topic}" (جزء من مادة ${subject}) بأسلوب أكاديمي متعمق: عرّف المفهوم بدقة، اذكر القوانين/المعادلات الأساسية لو موجودة، وضّح الفروق بين الأنواع المختلفة لو فيه، واختم بملخص سريع. ${eduLine} اكتب بالعربي مع الإبقاء على المصطلحات التقنية والرموز بالإنجليزية زي المراجع الأكاديمية القياسية.`,
  visual: (topic, subject, eduLine) =>
    `اشرح "${topic}" (جزء من مادة ${subject}) بأسلوب مرئي وتخيلي: استخدم تشبيهات من الحياة اليومية، وارسم بالكلمات مخططات نصية بسيطة (زي رسم موجة أو رسم بياني في شكل نصي) توضح الفكرة بصريًا. ${eduLine} اكتب بالعربي مع إبقاء المصطلحات التقنية بالإنجليزية.`,
  practical: (topic, subject, eduLine) =>
    `اديني مثال تطبيقي حقيقي أو تمرين محلول خطوة بخطوة على "${topic}" (جزء من مادة ${subject})، زي مسألة أو سيناريو عملي بيوضح إزاي المفهوم بيتطبق فعليًا. ${eduLine} اكتب بالعربي مع إبقاء المصطلحات والمعادلات بالإنجليزية.`,
};

type LessonContentBody = {
  dayId?: unknown;
  mode?: unknown;
  force?: unknown;
  edu?: unknown;
};

export async function POST(req: Request) {
  try {
    // ١) تسجيل دخول إلزامي — الراوت بيولّد محتوى من حساب الطالب.
    const { user, supabase, response: authError } = await requireUser("message");
    if (authError) return authError;

    // ٢) حد استخدام: التوليد غالي، والكاش جواه بيخفّف الدفع — ٢٠ نداء/دقيقة.
    const limited = await checkRateLimit(`lesson-content:${user.id}`, 20, 60_000, "message");
    if (limited) return limited;

    const body = (await req.json().catch(() => null)) as LessonContentBody | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: { message: "البيانات المبعوتة غير صالحة." } }, { status: 400 });
    }

    const dayId = typeof body.dayId === "string" ? clampText(body.dayId, 64).trim() : "";
    if (!dayId) {
      return NextResponse.json({ error: { message: "مفيش معرّف درس." } }, { status: 400 });
    }
    const mode: ContentMode = isContentMode(body.mode) ? body.mode : "simple";
    const force = body.force === true;

    // ٣) الدرس لازم يكون بتاع المستخدم نفسه (RLS كمان بيدافع — ده تحقق مبكر).
    const { data: day } = await supabase
      .from("study_days")
      .select("id, topic, description, config_id")
      .eq("id", dayId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!day) {
      return NextResponse.json(
        { error: { message: "الدرس غير موجود.", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    const topic = typeof day.topic === "string" && day.topic.trim() ? day.topic.trim().slice(0, 200) : "الدرس";

    // المادة من study_configs (مصدر الحقيقة) — مش من الكلاينت.
    const { data: config } = await supabase
      .from("study_configs")
      .select("subject")
      .eq("id", day.config_id)
      .maybeSingle();
    const subject = typeof config?.subject === "string" ? config.subject.trim().slice(0, 120) : "";

    // ٤) الكاش: لو الوضع ده متحفظ قبل كده → ارجعه بدون أي نداء AI.
    //    (فشل القراءة = جدول لسه ما اتنفذش → بنعتبره "مفيش كاش" ونكمّل.)
    const { data: existing } = await supabase
      .from("lesson_content")
      .select("explanation")
      .eq("user_id", user.id)
      .eq("day_id", dayId)
      .maybeSingle();

    const storedModes =
      existing?.explanation && typeof existing.explanation === "object" && !Array.isArray(existing.explanation)
        ? (existing.explanation as Record<string, unknown>)
        : {};
    const cached = storedModes[mode];
    if (!force && typeof cached === "string" && cached.trim()) {
      return NextResponse.json({ ok: true, content: cached, cached: true, saved: true, mode });
    }

    // ٥) توليد جديد — البرومبت كله مبني هنا (الموضوع/المادة من الداتابيز).
    const usage = resolveUsageRequestContext(req, user.id);
    let completion;
    try {
      completion = await aiRouter.completeChat("chat", {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: MODE_PROMPTS[mode](topic, subject, eduLineFrom(body.edu)) },
        ],
        temperature: 0.7,
        usage,
      });
    } catch (error) {
      if (!(error instanceof AiProviderError)) throw error;
      const isRate = error.status === 429;
      const isUnavailable = error.status === 503;
      return NextResponse.json(
        {
          error: {
            message: isRate
              ? "الخدمة مشغولة دلوقتي. حاول تاني بعد شوية."
              : "حصل خطأ أثناء الاتصال بالمساعد. حاول تاني.",
            code: isRate ? "PROVIDER_RATE_LIMIT" : isUnavailable ? "PROVIDER_UNAVAILABLE" : "PROVIDER_ERROR",
          },
        },
        { status: isUnavailable ? 503 : isRate ? 429 : 502 }
      );
    }

    const answer = completion.content?.trim() ?? "";
    if (!answer) {
      return NextResponse.json(
        { error: { message: "الموديل رجع بدون محتوى. حاول تاني.", code: "EMPTY_COMPLETION" } },
        { status: 502 }
      );
    }

    void recordAiOperation(supabase, {
      userId: user.id,
      provider: completion.provider,
      model: completion.model,
      taskType: "chat",
      status: "completed",
      usage: completion.usage,
      contentLength: answer.length,
    });

    // ٦) الحفظ best-effort — merge للوضع جوه الكائن القديم (مش استبدال):
    //    فشل الـ migration ما يكسرش الشاشة؛ المحتوى بيوصل والحفظ بيتكرر
    //    في الزيارة الجاية. نفس منطق "مافيش path يفشل" في باقي الجداول.
    let saved = false;
    try {
      const now = new Date().toISOString();
      const { error: upsertError } = await supabase.from("lesson_content").upsert(
        {
          user_id: user.id,
          day_id: dayId,
          explanation: { ...storedModes, [mode]: answer },
          status: "ready",
          model: completion.model ?? null,
          generated_at: now,
          updated_at: now,
        },
        { onConflict: "user_id,day_id" }
      );
      if (upsertError) {
        console.warn("lesson-content: حفظ فشل (migration ناقصة؟):", upsertError.message);
      } else {
        saved = true;
      }
    } catch (saveError) {
      console.warn("lesson-content: حفظ فشل:", saveError);
    }

    return NextResponse.json({ ok: true, content: answer, cached: false, saved, mode });
  } catch (error) {
    console.error("lesson-content route error:", error);
    return NextResponse.json(
      { error: { message: "حصل خطأ غير متوقع أثناء توليد المحتوى.", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
