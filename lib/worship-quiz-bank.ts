/* ==========================================================================
   worship-quiz-bank — منطق بنك الأسئلة الجاهزة (db/123)
   وسيط نقي بلا أي اعتماد على Supabase أو الشبكة عشان يكون قابل للاختبار —
   الـ route (app/api/worship/quiz/route.ts) هو اللي بيتعامل مع الـ DB.

   المسار: generate بيقرأ من worship_quiz_bank أولاً (استجابة فورية)،
   ولو البنك فاضي يرجع للتوليد المباشر (Groq) بنفس البرومبت والتحقق.
   ========================================================================== */

/* ── الأشكال — نفس عقد route.ts بالظبط (لازم يفضل مطابق) ── */

/** شكل السؤال الكامل كما يُخزَّن سيرفرًا (يشمل الإجابة الصحيحة). */
export type StoredQuestion = {
  question: string;
  options: string[];
  correct: number;
  source: string;
  explanation: string;
};

/** شكل السؤال المُرسَل للكلاينت — بدون correct ولا explanation. */
export type ClientQuestion = {
  question: string;
  options: string[];
  source: string;
};

/** بيانات صف البنك اللازمة للاختيار — بدون questions (ثقيلة). */
export type BankCandidateRow = {
  id: string;
  used_count: number;
  last_used_at: string | null;
};

export const QUIZ_TOTAL_QUESTIONS = 10;
// ⚠️ llama-3.3-70b-versatile اتشال من Groq (model_not_found 404) — وqwen/
//    qwen3.8-27b بيضرب OTPM 429 ("Requested 1239 > Limit 1000") على دفعة
//    ١٠ أسئلة عربية. openai/gpt-oss-120b متحقق منه فعلياً (٢٠٠ + ١٠ أسئلة
//    صالحة) ومتطابق مع QUIZ_CREDIT_MODEL في route.ts — محاسبة الكريديت
//    أصلاً على الموديل ده.
export const QUIZ_MODEL_GROQ = "openai/gpt-oss-120b";

/** الحد اللي تحته بنطلّب إعادة تعبئة خلفية بعد التقديم. */
export const QUIZ_BANK_MIN_ROWS = 5;

/* ==========================================================================
   ١) اختيار صف البنك — دالة نقية (unit-tested)
   ==========================================================================
   نفس دلالات SQL: ORDER BY last_used_at nulls first, used_count asc,
   random() LIMIT 1 — مع تفضيل مجموعة مش في آخر ٣ جلسات للمستخدم.

   • لو فيه مرشّحين خارج آخر جلسات المستخدم → نختار من بينهم حصراً.
   • لو كلهم استُخدموا مؤخراً → نرجع لكل الصفوف (أفضل من فشل).
   • التعادل في مفتاح الترتيب (نفس last_used_at و used_count) بيُحلّ
     عشوائياً عبر rng القابل للحقن (افتراضياً Math.random) — نفس دور
     random() في SQL، وبيخلي الاختبار حتمياً. */

/** مفتاح الترتيب: (وقت آخر استخدام — الفاضي أولاً، ثم الأقل استخداماً). */
function bankRowKey(row: BankCandidateRow): [number, number] {
  const ts = row.last_used_at ? Date.parse(row.last_used_at) : Number.NaN;
  return [Number.isFinite(ts) ? ts : Number.NEGATIVE_INFINITY, row.used_count];
}

function compareKeys(
  a: [number, number],
  b: [number, number],
): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
}

/**
 * يختار صفّ البنك الأنسب من قائمة مرشّحين — أو null لو القائمة فاضية.
 * recentBankIds: معرّفات المجموعات المستخدمة في آخر جلسات المستخدم
 * (نفضّل تجنّبها لو فيه بديل).
 */
export function pickBankRow(
  rows: readonly BankCandidateRow[],
  recentBankIds: readonly string[],
  rng: () => number = Math.random,
): BankCandidateRow | null {
  if (rows.length === 0) return null;

  const recent = new Set(recentBankIds);
  const fresh = rows.filter((r) => !recent.has(r.id));
  const pool = fresh.length > 0 ? fresh : rows;

  // أول تمريرة: المفتاح الأدنى (الأقدم استخداماً + الأقل استخداماً).
  let minKey = bankRowKey(pool[0]);
  for (let i = 1; i < pool.length; i++) {
    const k = bankRowKey(pool[i]);
    if (compareKeys(k, minKey) < 0) minKey = k;
  }

  // تمريرة تانية: كل الصفوف المتعادلة في المفتاح الأدنى → اختيار عشوائي.
  const ties = pool.filter(
    (r) => compareKeys(bankRowKey(r), minKey) === 0,
  );
  const index = Math.min(ties.length - 1, Math.max(0, Math.floor(rng() * ties.length)));
  return ties[index] ?? null;
}

/* ==========================================================================
   ٢) التحقق من محتوى صف البنك — jsonb ممكن يكون أي حاجة، نتحقق قبل التقديم
   ==========================================================================
   نفس قواعد parseQuestions بالظبط — أي عنصر ناقص يُرفض الصف كله. */

export function isStoredQuestionArray(value: unknown): value is StoredQuestion[] {
  if (!Array.isArray(value) || value.length !== QUIZ_TOTAL_QUESTIONS) return false;
  for (const item of value) {
    const q = item as Record<string, unknown> | null;
    if (!q || typeof q !== "object") return false;
    if (typeof q.question !== "string" || !q.question.trim()) return false;
    if (
      !Array.isArray(q.options) ||
      q.options.length !== 4 ||
      q.options.some((o) => typeof o !== "string" || !o.trim())
    ) {
      return false;
    }
    const correct = q.correct;
    if (
      typeof correct !== "number" ||
      !Number.isInteger(correct) ||
      correct < 0 ||
      correct > 3
    ) {
      return false;
    }
    if (typeof q.source !== "string" || !q.source.trim()) return false;
    if (typeof q.explanation !== "string") return false;
  }
  return true;
}

/** تحويل أسئلة مخزّنة إلى شكل الكلاينت — بدون correct ولا explanation. */
export function toClientQuestions(stored: readonly StoredQuestion[]): ClientQuestion[] {
  return stored.map((q) => ({
    question: q.question,
    options: q.options,
    source: q.source,
  }));
}

/* ==========================================================================
   ٣) البرومبت والـ parsing — مشترَكان بين مسار التوليد المباشر،
      إعادة التعبئة الخلفية، وسكريبت الزرع الأولي (نفس المصدر)
   ========================================================================== */

/**
 * برومبت الجيل — عربي صارم: JSON فقط، ١٠ أسئلة، مصادر موثوقة حصراً.
 * المنع صريح: الأحاديث الضعيفة/الموضوعة، خلافات الفقه بين المذاهب،
 * أسئلة الرأي والاجتهاد.
 */
export function buildQuizPrompt(): string {
  return `أنت مختص في الأسئلة الدينية للطلاب المسلمين. أنشئ ١٠ أسئلة اختيار من متعدد في العلوم الدينية (قرآن كريم، حديث شريف، عقيدة، سيرة، عبادات).

قواعد صارمة ومطلقة:
١) الرد بصيغة JSON صالحة فقط — مصفوفة من ١٠ عناصر، بدون أي نصوص إضافية أو علامات Markdown (مثل \`\`\`json)، بالهيكل التالي تماماً:
[
  { "question": "نص السؤال", "options": ["الخيار ١", "الخيار ٢", "الخيار ٣", "الخيار ٤"], "correct": 0, "source": "المصدر", "explanation": "شرح موجز للإجابة الصحيحة" }
]
٢) correct رقم من ٠ إلى ٣ يشير إلى فهرس الإجابة الصحيحة في options.
٣) المصادر موثوقة فقط:
   - القرآن الكريم: اذكر اسم السورة ورقم الآية في source (مثال: "سورة البقرة، الآية ٢٨٦").
   - الحديث الشريف: من الصحيحين (البخاري ومسلم) أو الكتب الستة مع رقم الحديث أو رقم الكتاب/الباب في source (مثال: "صحيح البخاري، حديث ١").
   - العقيدة والسيرة والمعلومات المتفق عليها بين الجميع.
٤) ممنوع منعاً باتاً: الأحاديث الضعيفة أو الموضوعة أو المروية بلا إسناد معروف، الخلافات الفقهية بين المذاهب، أسئلة الرأي والاجتهاد والتقدير الشخصي.
٥) سؤال لكل عنصر، و٤ خيارات لكل سؤال، وخيار واحد صحيح فقط، وبدون تكرار للسؤال.`;
}

/** تحقق صارم من مخرجات الموديل — أي عنصر ناقص يُرفض. */
export function parseQuestions(raw: string): StoredQuestion[] | null {
  const jsonStart = raw.indexOf("[");
  const jsonEnd = raw.lastIndexOf("]") + 1;
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.substring(jsonStart, jsonEnd));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const out: StoredQuestion[] = [];
  for (const item of parsed) {
    const q = item as Record<string, unknown>;
    const question = typeof q.question === "string" ? q.question.trim() : "";
    const options = Array.isArray(q.options)
      ? q.options.filter((o): o is string => typeof o === "string" && o.trim().length > 0)
      : [];
    const correct = q.correct;
    const source = typeof q.source === "string" ? q.source.trim() : "";
    const explanation = typeof q.explanation === "string" ? q.explanation.trim() : "";
    if (
      !question ||
      options.length !== 4 ||
      typeof correct !== "number" ||
      !Number.isInteger(correct) ||
      correct < 0 ||
      correct > 3 ||
      !source
    ) {
      return null;
    }
    out.push({ question, options, correct, source, explanation });
  }
  return out.length === QUIZ_TOTAL_QUESTIONS ? out : null;
}
