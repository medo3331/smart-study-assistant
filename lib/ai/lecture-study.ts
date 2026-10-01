/* ==========================================================================
   🃏❓ محتوى المذاكرة المولّد — Phase 4-B
   ═══════════════════════════════════════════════════════════════════════

   **سيرفر بس.** بيدخل من الراوت بس.

   ═══ ليه بنعيد استخدام `lib/ai/structured.ts` ═══
   المشروع عنده بنية تحقّق كاملة ومكتوبة قبلنا: `expectObject` و
   `expectArray` و `expectString` و `expectNumber` و `rejectUnknownKeys` و
   `validateStructured`. وملفها نفسه بيقول في أول سطر: «الوكلاء
   المستقبلية (كويزات، خرائط ذهنية، خطط مذاكرة، فلاش كاردز) كلها هتبني
   على الدوال دي». فبنستخدمها بدل ما نكتب regex من الصفر.

   ⚠️ **zod مش متثبّت في المشروع** — فمش هنضيفه لمهمة واحدة. التحقق هنا
   مكتوب بنفس أسلوب المشروع (رمي `AiStructuredOutputError`).

   ═══ القاعدة الذهبية ═══
   أي JSON جاي من موديل = **بيانات غير موثوقة**. كل حقل بيتفحص قبل ما
   يوصل للصف في القاعدة. البطاقة اللي جاوبتها فاضية أو السؤال اللي
   اختياراته ٣ بدل ٤ بيتحتسب — مش بيتخزّن.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  AiStructuredOutputError,
  expectArray,
  expectNumber,
  expectObject,
  expectString,
  rejectUnknownKeys,
  validateStructured,
  type Validator,
} from "./structured";
import type { AiTaskInput } from "./tasks/types";

/* ═══════════════════════════ الأنواع ═══════════════════════════ */

/** بطاقة مذاكرة واحدة. */
export type Flashcard = {
  question: string;
  answer: string;
};

/** سؤال اختيار من متعدد. */
export type Mcq = {
  question: string;
  /** ٤ اختيارات بالظبط. */
  options: string[];
  /** فهرس الاختيار الصحيح، من ٠ لـ ٣. */
  correctAnswer: number;
  explanation: string;
};

/** نوع المحتوى المطلوب. */
export type StudyContentKind = "flashcards" | "mcq";

/* ═══════════════════════════ الحدود ═══════════════════════════ */

/** العدد الافتراضي اللي الواجهة بتطلبه. */
export const DEFAULT_STUDY_COUNT = 10;

/** أقصى عدد مسموح في طلب واحد — سقف على الـ client وعلى البرومبت. */
export const MAX_STUDY_COUNT = 50;

/** عدد الاختيارات المطلوب في كل سؤال MCQ. */
export const MCQ_OPTIONS_COUNT = 4;

/** أطول نص قبل ما نعتبره «مش سؤال». */
const MAX_QUESTION_CHARS = 400;
const MAX_ANSWER_CHARS = 1200;
const MAX_OPTION_CHARS = 300;
const MAX_EXPLANATION_CHARS = 600;

/** 📐 وصف الشكل للموديل — بيتحقّد في نفس رسالة النظام. */
export const SCHEMA_DESCRIPTIONS: Record<StudyContentKind, string> = {
  flashcards: `{ "flashcards": [ { "question": "string", "answer": "string" } ] }`,
  mcq: `{ "mcqs": [ { "question": "string", "options": ["a","b","c","d"], "correctAnswer": 0, "explanation": "string" } ] } — correctAnswer فهرس الاختيار الصحيح من 0 إلى 3`,
};

/**
 * 🔢 يقرا العدد المطلوب ويحدّه.
 *
 * ⚠️ **ليه بنحدّه من السيرفر**: أي رقم من الـ client غير موثوق. من غير
 * السقف ده، طلب واحد بـ `count: 100000` كان هيخلي الموديل يولّد مليون
 * بطاقة في نداء واحد — ودي فاتورة حقيقية.
 */
export function resolveStudyCount(raw: unknown): number {
  // ⚠️ `Number(null)` و `Number("")` بيرجعوا **0**، مش NaN. فلو دخلنا
  // من غير الحارس ده، `count: null` (عميل بيبعت الحقل فاضي) كان هيطلع
  // 1 بطاقة بدل 10 — سلوك غلط ومباشر. فالتشكيل الصريح قبل التحويل.
  if (typeof raw !== "number" && typeof raw !== "string") {
    return DEFAULT_STUDY_COUNT;
  }
  if (typeof raw === "string" && raw.trim() === "") return DEFAULT_STUDY_COUNT;

  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_STUDY_COUNT;
  const truncated = Math.floor(value);
  if (truncated < 1) return 1;
  if (truncated > MAX_STUDY_COUNT) return MAX_STUDY_COUNT;
  return truncated;
}

/* ═══════════════════════════ التطبيع ═══════════════════════════ */

/**
 * تطبيع النص للمقارنة.
 *
 * ⚠️ **ليه ضروري لإزالة التكرار**: الموديل بيكتب نفس السؤال بأشكال
 * مختلفة — «ما هو الـ LP؟» و«ماهو الـ LP ؟». المقارنة الحرفية هعتبرهم
 * مختلفين، والطالب هيشوف ١٠ بطاقات، ٥ منها نفس الفكرة.
 */
export function normalizeForCompare(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[؟?!.،,:؛;"«»()\[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    // ⚠️ المسافة بين الكلمات coalesce: «ما هو» و«ماهو» نفس السؤال في
    //eyes أرباب فضاء. من غير ده الـ key كان هيفصلهم ونفس المفهوم
    //بيتكرر مرتين في البطاقات.
    .replace(/\s*([^\s])\s*/g, "$1");
}

/**
 * 🔑 مفتاح التشابه بين سؤالين.
 *
 * بنقارن **الكلمات المميزة** مش النص كامل. السؤالين «ما هو الـ LP؟» و
 * «إيه هو الـ LP؟» بعد التطبيع: "ما هو ال lp" و "ايه هو ال lp" — الكلمات
 * الطويلة عندهم واحدة ("lp") ⇒ نفس المفتاح ⇒ التاني يتشال.
 */
function similarityKey(text: string): string {
  const normalized = normalizeForCompare(text);
  const words = normalized.split(" ").filter((w) => w.length >= 4);
  return words.length > 0 ? [...new Set(words)].sort().join("|") : normalized;
}

/**
 * 🚫 يزيل التكرار من قائمة أسئلة.
 *
 * ⚠️ الترتيب بيتحفظ: بنخلّي **الأول** من كل مجموعة متشابهة. في
 * الـ map-reduce أول سؤال غالباً بييجي من أول chunk، وده اللي بيكون في
 * سياق المحاضرة الأول. اختيار الأخير كان هيخلّي الترتيب معكوس.
 */
export function dedupeBySimilarity<T>(items: T[], getText: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = similarityKey(getText(item));
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/* ═══════════════════════════ التحقق ═══════════════════════════ */

/** 🃺 تتحقق من بطاقة واحدة. بترمي عند أي مشكلة — المتفق عليه في structured.ts. */
function parseFlashcard(value: unknown): Flashcard {
  const obj = expectObject(value);
  // ⬇️ الحقول غير المتوقعة مرفوضة: لو الموديل أضاف `confidence` أو أي حاجة
  // تانية، إحنا مش عارفين إزاي نقرأها — الرفض أوضح من التجاهل الصامت.
  rejectUnknownKeys(obj, ["question", "answer"], "flashcard");

  const question = expectString(obj.question, "question");
  const answer = expectString(obj.answer, "answer");

  if (question.length > MAX_QUESTION_CHARS) {
    throw new AiStructuredOutputError("Flashcard question is too long to be a question");
  }
  if (answer.length > MAX_ANSWER_CHARS) {
    throw new AiStructuredOutputError("Flashcard answer is too long");
  }
  return { question, answer };
}

/** ✅ مُحقِّق مصفوفة بطاقات. */
export const validateFlashcards: Validator<Flashcard[]> = (value) => {
  // بيقبل الشكلين: مصفوفة مباشرة، أو كائن ملفوف { flashcards: [...] }.
  const raw = Array.isArray(value) ? value : expectObject(value).flashcards;
  return expectArray(raw).map(parseFlashcard);
};

/**
 * ❓ تتحقق من سؤال MCQ واحد.
 *
 * ⚠️ **الصرامة هنا مقصودة** — دي كل حمايات جودة الاختبار:
 *   1) options.length === 4 بالظبط (مش 3 ولا 5).
 *   2) correctAnswer عدد صحيح بين 0 و 3 — بيرجّع على خيار موجود فعلاً.
 *   3) كل الخيارات نص غير فاضي.
 *   4) الخيارات **مش متكررة** جوه نفس السؤال — تكرار معناه سؤالين عملياً
 *      في واحد، والإجابة الصح ممكن تبقى غامضة.
 *
 * أي إخلال = السؤال **يترك** من النتيجة (مش بيتخزّن ناقص).
 */
function parseMcq(value: unknown): Mcq {
  const obj = expectObject(value);
  rejectUnknownKeys(obj, ["question", "options", "correctAnswer", "explanation"], "mcq");

  const question = expectString(obj.question, "question");
  const explanation = expectString(obj.explanation, "explanation");
  const correctAnswer = expectNumber(obj.correctAnswer, "correctAnswer");

  if (question.length > MAX_QUESTION_CHARS) {
    throw new AiStructuredOutputError("MCQ question is too long");
  }
  if (explanation.length > MAX_EXPLANATION_CHARS) {
    throw new AiStructuredOutputError("MCQ explanation is too long");
  }

  // 1) أربع اختيارات بالظبط.
  const options = expectArray(obj.options);
  if (options.length !== MCQ_OPTIONS_COUNT) {
    throw new AiStructuredOutputError(
      `MCQ must have exactly ${MCQ_OPTIONS_COUNT} options, got ${options.length}`,
    );
  }
  const parsedOptions = options.map((option, index) => {
    const text = expectString(option, `options[${index}]`);
    if (text.length > MAX_OPTION_CHARS) {
      throw new AiStructuredOutputError(`options[${index}] is too long`);
    }
    return text;
  });

  // 2) فهرس صحيح داخل المدى. Number.isInteger عشان 1.5 أو "1" (نص) يعدّوش.
  if (!Number.isInteger(correctAnswer)) {
    throw new AiStructuredOutputError("correctAnswer must be an integer");
  }
  if (correctAnswer < 0 || correctAnswer >= MCQ_OPTIONS_COUNT) {
    throw new AiStructuredOutputError(
      `correctAnswer ${correctAnswer} is out of range 0..${MCQ_OPTIONS_COUNT - 1}`,
    );
  }

  // 3) اختيارات مكررة جوه نفس السؤال = سؤال غامض.
  const uniqueOptions = new Set(parsedOptions.map(normalizeForCompare));
  if (uniqueOptions.size !== MCQ_OPTIONS_COUNT) {
    throw new AiStructuredOutputError("MCQ has duplicate options");
  }

  return { question, options: parsedOptions, correctAnswer, explanation };
}

/** ✅ مُحقِّق مصفوفة MCQ. */
export const validateMcqs: Validator<Mcq[]> = (value) => {
  const raw = Array.isArray(value) ? value : expectObject(value).mcqs;
  return expectArray(raw).map(parseMcq);
};
/* ═══════════════════════════ البرومبت ═══════════════════════════ */

/** القواعد المشتركة — نفس روح Phase 4-A: الموديل ما بيخترعش. */
const GROUNDING = [
  "ممنوع تخترع أي معلومة غير موجودة في التفريغ.",
  "التزم بالتفريغ كمرجع وحيد؛ لو المعلومة مش فيه ما تولّدش سؤال عنها.",
  "لو فيه مصطلح إنجليزي، اكتبه بالإنجليزي واشرحه بالعربي.",
  "الرد بنفس لغة المحاضرة: عربي ثم عربي، إنجليزي ثم إنجليزي، مختلط ثم عربي مع الحفاظ على المصطلحات.",
].join("\n");

/** برومبت بطاقات المذاكرة. */
function flashcardsPrompt(count: number, partLabel: string): string {
  return [
    "أنت «ماجيكلي»، مساعد مذاكرة. بتولّد بطاقات مذاكرة من تفريغ محاضرة جامعية.",
    "",
    `اكتب ${count} بطاقة بصيغة JSON فقط، بالشكل ده:`,
    SCHEMA_DESCRIPTIONS.flashcards,
    "",
    "شروط البطاقة الكويسة:",
    "- السؤال يختبر مفهوم مش استرجاع كلمة.",
    "- الإجابة مختصرة لكن كافية.",
    "- غطّي التعريفات والعلاقات والقواعد والأمثلة اللي في المحاضرة.",
    "- متنوّع في الصعوبة: سهل، متوسط، وفكري.",
    "- ممنوع تكرار نفس الفكرة في أكتر من بطاقة.",
    GROUNDING,
    partLabel,
  ]
    .filter(Boolean)
    .join("\n");
}

/** برومبت أسئلة الاختيار من متعدد. */
function mcqPrompt(count: number, partLabel: string): string {
  return [
    "أنت «ماجيكلي»، مساعد مذاكرة. بتولّد أسئلة اختيار من متعدد من تفريغ محاضرة جامعية.",
    "",
    `اكتب ${count} سؤال بصيغة JSON فقط، بالشكل ده:`,
    SCHEMA_DESCRIPTIONS.mcq,
    "",
    "شروط السؤال الكويس:",
    "- 4 اختيارات بالظبط، واحد صحيح فقط، والباقي معقولين لكن غلط.",
    "- explanation يشرح ليه الإجابة دي صحيحة، مش بيكرر السؤال.",
    "- ممنوع «كل ما سبق» أو «لا شيء مما سبق» — دي بتبوِّخ السؤال.",
    "- ممنوع سؤال إجابته محتاجة معرفة برّه المحاضرة.",
    "- ممنوع اختيارين معناه واحد — السؤال يبقى غامض.",
    "- متنوّع في الصعوبة: سهل، متوسط، وفكري (تطبيق وتحليل مش حفظ).",
    GROUNDING,
    partLabel,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ═══════════════════════════ التوليد ═══════════════════════════ */

/** خطأ معروف للراوت يترجمه لـ HTTP + رسالة عربية آمنة. */
export class StudyContentError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "StudyContentError";
    this.code = code;
    this.status = status;
  }
}

/** ❌ خطأ موحّد لرد الموديل الغلط — رسالة واحدة لكل الأنواع. */
function invalidOutput(): StudyContentError {
  return new StudyContentError(
    "INVALID_AI_OUTPUT",
    "الخدمة رجعت صيغة غير صالحة. جرّب تاني كمان شوية.",
    502,
  );
}

/** اعتمادات قابلة للحقن — في الاختبارات بنمرّر mock بدل المزوّد الحقيقي. */
export type GenerateDeps = {
  runTask: (task: "chat", input: AiTaskInput) => Promise<{ content: string }>;
  chunk: (text: string, max: number) => string[];
  chunkChars: number;
};
/**
 * يولّد محتوى المذاكرة من تفريغ.
 *
 * === الاستراتيجية: map-reduce (زي Phase 4-A) ===
 *   - تفريغ قصير -> نداء واحد.
 *   - تفريغ طويل -> نداء لكل قطعة، بعدين تنقية واختيار محلي.
 *
 * WHY مافيش نداء دمج هنا (اختلاف مقصود عن Phase 4-A):
 *   نداء الدمج بياخد نصوص وبيعيد صياغتها، وده خطر على الأسئلة لأن إعادة
 *   الصياغة ممكن تغير اجابة صح أو تحوّل correctAnswer لفهرس غلط. هنا
 *   بناخد القطع المولّدة كما هي (بعد التحقق) وبنختار أفضل 10 منها.
 *
 * WHY فشل أي قطعة = فشل الطلب كله: مافيش partial. نص مذاكرة ناقص
 *   بيتدرّس زي ما هو، وده أسوأ من رسالة فشل مع زر إعادة محاولة.
 */
export async function generateStudyContent(input: {
  kind: StudyContentKind;
  transcript: string;
  count: number;
  deps: GenerateDeps;
}): Promise<{ items: Flashcard[] | Mcq[]; aiCalls: number }> {
  const { kind, transcript, count, deps } = input;
  const chunks = deps.chunk(transcript, deps.chunkChars);

  if (chunks.length === 0) {
    throw new StudyContentError(
      "EMPTY_TRANSCRIPT",
      "مفيش نص في المحاضرة دي نتعامل معاه.",
      422,
    );
  }

  // في النص الطويل بنطلب أكثر من العدد المطلوب من كل قطعة، عشان إزالة
  // التكرار ما تخلّيش النتيجة النهائية أقل من المطلوب.
  const perChunk =
    chunks.length > 1 ? Math.ceil((count * 1.6) / chunks.length) + 2 : count;

  const collected: Array<Flashcard | Mcq> = [];
  let aiCalls = 0;

  for (const [index, chunk] of chunks.entries()) {
    const partLabel =
      chunks.length > 1
        ? `هذا الجزء ${index + 1} من ${chunks.length} من محاضرة طويلة.`
        : "";
    const system =
      kind === "flashcards"
        ? flashcardsPrompt(perChunk, partLabel)
        : mcqPrompt(perChunk, partLabel);

    const response = await deps.runTask("chat", {
      messages: [
        { role: "system", content: system },
        { role: "user", content: chunk },
      ],
      options: { temperature: 0.4 },
    });
    aiCalls += 1;

    // التحقق عن كل قطعة لوحدها مش بعد الدمج.
    // تفريع صريح مش ternary: Validator<Flashcard[]> و Validator<Mcq[]>
    // نوعين مختلفين والاتحاد مش بيترجم لنوع واحد.
    if (kind === "flashcards") {
      const result = validateStructured(response.content, validateFlashcards);
      if (!result.ok) throw invalidOutput();
      collected.push(...result.value);
    } else {
      const result = validateStructured(response.content, validateMcqs);
      if (!result.ok) throw invalidOutput();
      collected.push(...result.value);
    }
  }

  const deduped = dedupeBySimilarity(collected, (item) => item.question);
  const final = deduped.slice(0, count);

  if (final.length === 0) {
    throw new StudyContentError(
      "NO_VALID_ITEMS",
      "ما قدرناش نولّد محتوى صالح من المحاضرة دي. جرّب تاني.",
      502,
    );
  }

  // cast آمن بالبناء: kind بيحدد المُحقِّق، فكل العناصر من النوع نفسه.
  return { items: final as Flashcard[] | Mcq[], aiCalls };
}

/* ═══════════════════════════ الحفظ ═══════════════════════════ */

const COLUMN_BY_KIND: Record<StudyContentKind, "flashcards" | "mcqs"> = {
  flashcards: "flashcards",
  mcq: "mcqs",
};

/**
 * يحفظ المحتوى المولّد في عمود واحد بس.
 *
 * WHY الحماية الأهم هنا: بنعمل update بالعمود المحسوب من kind، مش
 *   بنمرّر object جاهز. ده بيضمن عملياً إن summary و explanation و
 *   transcript_* ميتمسوش أبداً — مش نية كويسة، ده مفيش مسار كود يعدّلهم.
 */
export async function saveStudyContent(input: {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  lectureId: string;
  userId: string;
  kind: StudyContentKind;
  items: Flashcard[] | Mcq[];
}): Promise<void> {
  const { supabase, lectureId, userId, kind, items } = input;
  const column = COLUMN_BY_KIND[kind];

  const { error } = await supabase
    .from("lectures")
    .update({ [column]: items })
    .eq("id", lectureId)
    .eq("user_id", userId);

  if (error) {
    console.error(
      `lecture-study: فشل حفظ ${kind} [${error.code ?? "no-code"}]`,
    );
    throw new StudyContentError(
      "DB_WRITE_FAILED",
      "المحتوى اتولّد بس مقدرش نحفظه. جرّب تاني كمان شوية.",
      500,
    );
  }
}