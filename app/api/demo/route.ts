import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { checkDailyBudget, checkRateLimit } from '@/lib/api-guard';
import { ExtractError, extractTextFromFile } from '@/lib/extract-text';
import { GROQ_MODELS } from '@/lib/ai-config';

/* ==========================================================================
   🎁 الديمو المفتوح — الراوت الوحيد اللي بيستهلك توكنز من غير تسجيل

   الفكرة: الزائر يرفع ملزمته هو ويشوف النتيجة قبل ما يعمل حساب. ده أقوى
   إثبات ممكن إن الموقع شغال — بس كمان أخطر راوت في المشروع، لأن كل طلب
   فيه نداء OCR + نداء موديل، والاتنين بفلوس.

   ⚠️ الحماية هنا **طبقات مش طبقة واحدة**، والترتيب نفسه جزء من الحماية:

   ١) سقف يومي عام (١٥٠ في اليوم) — مايهمّهوش مين بيطلب.
      بيتفحص **الأول** عن قصد: حدّ الـ IP بيكتب في ماب في الذاكرة قبل
      ما يرجّع، فلو كان قبله كان المهاجم يقدر يزوّد الماب حتى بعد ما
      الميزانية تخلص. بالترتيب ده، الرفض بيحصل من غير أي أثر.
      ⚠️ ده معناه إن هجوم بسيط يقدر يقفل الديمو على الزوار الحقيقيين
      لحد نص الليل UTC. مقبول عن قصد: تعطيل الديمو مؤقتاً أهون من فاتورة
      مفتوحة. لو الموقع كبر، الحل الصح عدّاد مركزي (Upstash) + كابتشا.
      ⚠️ والعدّاد في ذاكرة الـ instance، فعلى Vercel السقف الفعلي =
      السقف × عدد الـ instances الشغالة.

   ٢) حدّ على الـ IP (٣ في الساعة) — بيوقف الاستخدام العادي الزيادة.
      عجزه: `x-forwarded-for` هيدر بيتزوّر، فمهاجم بيولّد IP جديد كل طلب
      (وحتى من غير تزوير، أي حد عنده IPv6 /64 عنده IPs بلا حصر).
      اللي بيغطي العجز ده هو السقف اليومي فوق.

   ٣) رفض مبكر بـ content-length، وحدود حجم أصغر من الراوت المسجّل
      (٤ ميجا بدل ٨) وسقف نص أقل (٨ آلاف حرف بدل ٦٠ ألف) — بيحدّد
      تكلفة الطلب الواحد نفسه.

   ٤) نداء موديل واحد لكل مفتاح بـ max_tokens محدود، من غير retry داخلي
      ومهلة ٢٠ ثانية. مفيش شات ولا متابعة.
      ⚠️ مسار الصور بيعمل لحد نداءين OCR مش واحد (إنجن ١ للعربي وإنجن ٣
      كاحتياطي) — مكتوب في lib/extract-text.ts.

   ٥) رد الموديل بيعدّي على validate() قبل ما يخرج للمتصفح.

   ومفيش أي كتابة في الداتابيز — الراوت بيقرا ويرجّع وخلاص.
   ========================================================================== */

/** أصغر من راوت المسجّلين عن قصد: التجربة مش محتاجة كتاب كامل. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1024 * 1024;
/** النص اللي بنقراه من الملف. */
const MAX_TEXT_CHARS = 8_000;
/** اللي بنبعته فعلاً للموديل — ده اللي بيحدد تكلفة التوكنز. */
const MAX_PROMPT_CHARS = 5_000;
/** أقل نص مفيد: أقل من كده الموديل هيخترع محتوى مش موجود. */
const MIN_TEXT_CHARS = 120;

/** ٣ محاولات في الساعة لكل IP. */
const IP_LIMIT = 3;
const IP_WINDOW_MS = 60 * 60 * 1000;
/** سقف اليوم كله مهما كان مصدر الطلبات. */
const DAILY_BUDGET = 150;
/** سماحية لترويسات الـ multipart فوق حجم الملف نفسه. */
const BODY_OVERHEAD_BYTES = 64 * 1024;

/* ⚠️ افتراضيات Groq SDK: `maxRetries = 2` و `timeout = 60s`. مع أربع
   مفاتيح في اللوب، الطلب الواحد كان ممكن يوصل ١٢ نداء و١٢ دقيقة انتظار.
   بنلغي الـ retry الداخلي (اللوب بتاعنا هو اللي بيجرّب المفتاح اللي
   بعده) وبنقصّر المهلة: الزائر مستنيّ قدام الشاشة، ومحدش هيستنى دقيقة. */
const GROQ_TIMEOUT_MS = 20_000;

/** سقف زمن التنفيذ على المنصة — لازم يزيد شوية عن أسوأ حالة للّوب. */
export const maxDuration = 60;

/** شكل الرد المتوقّع من الموديل. */
type DemoResult = {
  title: string;
  language: 'ar' | 'en';
  summary: string[];
  flashcards: { q: string; a: string }[];
  quiz: { question: string; choices: string[]; answerIndex: number; why: string };
  plan: { day: number; title: string; desc: string }[];
};

const SYSTEM_PROMPT = `أنت معلم خبير بيحضّر مادة مذاكرة من ملف الطالب.

اقرأ النص المرفق وأخرج JSON فقط بدون Markdown بالهيكل ده بالظبط:
{
  "title": "عنوان قصير للمادة من محتواها الفعلي",
  "language": "ar أو en حسب لغة النص",
  "summary": ["نقطة", "نقطة", "نقطة", "نقطة"],
  "flashcards": [{"q": "سؤال قصير", "a": "إجابة سطر واحد"}],
  "quiz": {
    "question": "سؤال اختيار من متعدد من المادة",
    "choices": ["أ", "ب", "ج", "د"],
    "answerIndex": 0,
    "why": "سطر واحد يشرح ليه دي الإجابة الصح"
  },
  "plan": [{"day": 1, "title": "عنوان اليوم", "desc": "سطر واحد"}]
}

قواعد مهمة:
- summary من ٣ لـ ٥ نقاط، كل نقطة سطر واحد.
- flashcards ٤ كروت بالظبط.
- plan ٣ أيام بالظبط.
- answerIndex رقم من ٠ لـ ٣ وبيشاور على الإجابة الصح في choices.
- **اكتب بنفس لغة النص المرفق.** لو النص إنجليزي اكتب كل حاجة بالإنجليزي.
- اشتغل على المحتوى الفعلي بس. ممنوع تخترع معلومات مش في النص.
- لو النص مش مادة دراسية (فاتورة، محادثة، كلام عشوائي) رجّع:
  {"error": "not_study_material"}`;

/** بيتأكد إن رد الموديل مطابق للشكل المتوقّع قبل ما يوصل للمتصفح. */
function validate(data: unknown): DemoResult | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  const strArray = (v: unknown, min: number, max: number) =>
    Array.isArray(v) &&
    v.length >= min &&
    v.length <= max &&
    v.every((x) => typeof x === 'string' && x.trim().length > 0);

  if (typeof d.title !== 'string' || !d.title.trim()) return null;
  if (!strArray(d.summary, 2, 6)) return null;

  if (!Array.isArray(d.flashcards) || d.flashcards.length < 2) return null;
  const flashcards = d.flashcards
    .filter(
      (c): c is { q: string; a: string } =>
        !!c &&
        typeof c === 'object' &&
        typeof (c as { q?: unknown }).q === 'string' &&
        typeof (c as { a?: unknown }).a === 'string'
    )
    .slice(0, 4);
  if (flashcards.length < 2) return null;

  const q = d.quiz as Record<string, unknown> | undefined;
  if (
    !q ||
    typeof q.question !== 'string' ||
    !strArray(q.choices, 2, 5) ||
    typeof q.answerIndex !== 'number' ||
    !Number.isInteger(q.answerIndex) ||
    q.answerIndex < 0 ||
    q.answerIndex >= (q.choices as string[]).length
  ) {
    return null;
  }

  if (!Array.isArray(d.plan) || d.plan.length < 2) return null;
  const plan = d.plan
    .filter(
      (p): p is { day: number; title: string; desc: string } =>
        !!p &&
        typeof p === 'object' &&
        typeof (p as { title?: unknown }).title === 'string' &&
        typeof (p as { desc?: unknown }).desc === 'string'
    )
    .slice(0, 3)
    .map((p, i) => ({ day: i + 1, title: p.title, desc: p.desc }));
  if (plan.length < 2) return null;

  return {
    title: d.title.slice(0, 120),
    language: d.language === 'en' ? 'en' : 'ar',
    summary: (d.summary as string[]).slice(0, 5),
    flashcards,
    quiz: {
      question: q.question as string,
      choices: q.choices as string[],
      answerIndex: q.answerIndex,
      why: typeof q.why === 'string' ? q.why : '',
    },
    plan,
  };
}

export async function POST(request: NextRequest) {
  try {
    /* ⚠️ ترتيب الطبقتين مقصود: السقف اليومي **قبل** حدّ الـ IP.
       السبب إن checkRateLimit بيكتب في ماب في الذاكرة قبل ما يرجّع،
       فلو اتنادى الأول كان المهاجم يقدر يزوّد الماب بمفتاح جديد كل
       طلب حتى بعد ما ميزانية اليوم تخلص — يعني الطبقة اللي المفروض
       تحمي كانت واقفة ورا side-effect بتاع اللي قبلها.
       بالترتيب ده، لما الميزانية تخلص الطلب بيترفض من غير ما يلمس
       الماب خالص. */
    const overBudget = checkDailyBudget('demo', DAILY_BUDGET, 'flat');
    if (overBudget) return overBudget;

    /* حدّ الـ IP.
       ⚠️ x-forwarded-for بيتزوّر، وعشان كده وحده مش كفاية — السقف
       اليومي فوق هو اللي بيغطي الحالة دي. */
    const forwarded = request.headers.get('x-forwarded-for') ?? '';
    const ip = forwarded.split(',')[0].trim() || 'unknown';
    const limited = checkRateLimit(`demo:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS, 'flat');
    if (limited) return limited;

    /* رفض مبكر بالحجم قبل ما نقرا الـ body.
       formData() بيحمّل الأجزاء كلها في الذاكرة، فالفحص بعديها معناه
       إننا خزّنّا الملف بالكامل الأول. Vercel عنده سقف بيمتص ده، بس
       الاعتماد على المنصة مش مكتوب في الكود — والسطرين دول بيخلّوه
       صريح ويحموا أي استضافة تانية. */
    const declaredSize = Number(request.headers.get('content-length') ?? 0);
    if (declaredSize > MAX_FILE_BYTES + BODY_OVERHEAD_BYTES) {
      return NextResponse.json(
        { error: 'الملف كبير أوي. أقصى حجم ٤ ميجا.' },
        { status: 413 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    /* `instanceof` مش `as File`: لو الحقل اتبعت كنص عادي، الـ cast كان
       بيعدّي و`file.type` تطلع undefined وترمي TypeError جوّه القراءة —
       يعني ٥٠٠ في اللوجز بدل ٤٠٠ واضحة. */
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'مفيش ملف اتبعت' }, { status: 400 });
    }

    // ٣) القراءة — نفس كود الراوت المسجّل بحدود أصغر
    const text = await extractTextFromFile(file, {
      maxFileBytes: MAX_FILE_BYTES,
      maxImageBytes: MAX_IMAGE_BYTES,
      maxTextChars: MAX_TEXT_CHARS,
    });

    // نص قصير أوي = الموديل هيخترع. أحسن نقول للمستخدم بدل ما نوريه كلام ملفّق
    if (text.replace(/\s+/g, ' ').trim().length < MIN_TEXT_CHARS) {
      return NextResponse.json(
        {
          error:
            'النص اللي في الملف قليل أوي عشان أعملك منه مادة مذاكرة. جرّب ملف فيه محتوى أكتر.',
        },
        { status: 422 }
      );
    }

    const apiKeys = Array.from(
      new Set(
        [
          process.env.GROQ_API_KEY_1,
          process.env.GROQ_API_KEY_2,
          process.env.GROQ_API_KEY_3,
          process.env.GROQ_API_KEY,
        ]
          .map((k) => k?.trim())
          .filter((k): k is string => !!k)
      )
    );

    if (apiKeys.length === 0) {
      console.error('demo: مفيش أي GROQ_API_KEY معرف');
      return NextResponse.json({ error: 'الخدمة غير متاحة حالياً.' }, { status: 503 });
    }

    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text.slice(0, MAX_PROMPT_CHARS) },
    ];

    let raw = '';
    let lastError: unknown = null;

    for (const apiKey of apiKeys) {
      try {
        const groq = new Groq({ apiKey, maxRetries: 0, timeout: GROQ_TIMEOUT_MS });
        const completion = await groq.chat.completions.create({
          model: GROQ_MODELS.fast,
          messages,
          temperature: 0.3,
          max_tokens: 1600,
          response_format: { type: 'json_object' },
        });
        raw = completion.choices[0]?.message?.content || '';
        if (raw) break;
      } catch (err) {
        console.warn('demo: فشل مفتاح، بجرّب اللي بعده', err);
        lastError = err;
      }
    }

    if (!raw) {
      console.error('demo: كل المفاتيح فشلت', lastError);
      return NextResponse.json(
        { error: 'الخدمة مشغولة دلوقتي. جرّب تاني بعد شوية.' },
        { status: 503 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('demo: رد غير صالح من الموديل');
      return NextResponse.json(
        { error: 'الرد جه بشكل غير مفهوم. حاول تاني.' },
        { status: 502 }
      );
    }

    // الموديل بيقول بنفسه إن الملف مش مادة دراسية
    if ((parsed as { error?: unknown })?.error === 'not_study_material') {
      return NextResponse.json(
        {
          error:
            'الملف ده مش شكله مادة دراسية. جرّب ترفع ملزمة أو محاضرة أو ملخص.',
        },
        { status: 422 }
      );
    }

    const result = validate(parsed);
    if (!result) {
      console.error('demo: رد الموديل مش مطابق للشكل المتوقّع');
      return NextResponse.json(
        { error: 'النتيجة جت ناقصة. جرّب تاني.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof ExtractError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('demo route error:', error);
    return NextResponse.json({ error: 'حصل خطأ غير متوقع. حاول تاني.' }, { status: 500 });
  }
}
