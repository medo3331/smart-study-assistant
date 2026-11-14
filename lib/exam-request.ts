/* ==========================================================================
   كاشف «طلب امتحان» للمساعد الشخصي
   ==========================================================================
   ليه الملف ده موجود؟

   المساعد كان بيسأل أسئلة توضيحية كتير جدًا («تقصد 5 ولا مجموعتين؟»
   «المادة إيه؟») مع إن الطالب كان قال كل حاجة: «امتحان في الفيزياء من
   10 أسئلة». السؤال هنا مش зада («5 ولا مجموعتين؟» — الطالب قال 5!)،
   ده **تأخير** بيخلي الطالب يسيب الشات.

   الحل: الكشف بكود (مش بموديل) — **فوري ومجاني ومحدّد**:
     • فوري — بنقرر قبل أي نداء شبكة.
     • مجاني — مفيش فاتورة Groq على «امتحان من 10 أسئلة».
     • محدّد — الأرقام بتتقرا من كلام الطالب نفسه.

   الدوال كلها **خالصة** (مفيش Date.now ولا شبكة) عشان تتختبر.

   ⛔ NO FABRICATION: لو جزء من الطلب ناقص (المادة أو العدد) مش
   بنخمّنه — بنرجّع `complete: false` والمساعد يسأل **سؤالًا واحدًا**
   عن الناقص بس.
   ========================================================================== */

import { matchWordNumber, normalizeDigits } from "./exam-intent";
import {
  EXAM_MAX_COUNT,
  EXAM_MIN_COUNT,
  type ExamDifficulty,
  type ExamQuestionType,
} from "./ai/exam-review";

/* -------------------------------------------------------------------------- */
/* ١) كلمات الامتحان                                                          */
/* -------------------------------------------------------------------------- */

/** لازم واحدة من دي تكون في الجملة وإلا مش طلب امتحان. */
const EXAM_KEYWORDS = [
  "امتحان", "امتحانات", "إمتحان", "اختبار", "اختبارات", "الكويز", "كويز",
  "quiz", "exam", "midterm", "ميدتيرم", "فاينال", "final exam",
  "نموذج امتحان", "أسئلة امتحان", "ورقة امتحان",
];

/** كلمات بتلغي الكشف — الكلام عن امتحان فات/موجود مش طلب توليد. */
const NEGATIVE_MARKERS = [
  "امبارح", "إمبارح", "الامتحان اللي فات", "عملت الامتحان", "خلصت الامتحان",
  "نجحت", "رسبت", "كان عندي", "كنت عندي", "حللت الامتحان", "امتحنت",
];

/* -------------------------------------------------------------------------- */
/* ٢) التطبيع                                                                  */
/* -------------------------------------------------------------------------- */

/** بيشيل التشكيل والتطويل وبيوحّد الألف/الهاء/التاء. */
function loosen(text: string): string {
  return text
    .replace(/[ً-ْـٰ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[؟?!.،,:؛;"«»()[\]{}'"`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* ٣) النتيجة                                                                  */
/* -------------------------------------------------------------------------- */

export interface ExamRequest {
  /** اسم المادة (نص حرفي) — null لو الطالب مالكهاش. */
  subject: string | null;
  /** عدد الأسئلة — null لو مذكورش. */
  count: number | null;
  /** الأنواع المطلوبة — فاضية معناها «الافتراضي» (اختيار من متعدد). */
  types: ExamQuestionType[];
  /** الصعوبة — null معناها «الافتراضي» (متوسط). */
  difficulty: ExamDifficulty | null;
  /** الطلب مكتمل؟ (المادة + العدد) ⇒ ينفّذ فورًا من غير أسئلة توضيحية. */
  complete: boolean;
  /** سبب الكشف — للتشخيص فقط. */
  reason: string;
}

/* -------------------------------------------------------------------------- */
/* ٤) الكاشف                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * بيقرا رسالة الطالب ويطلّع «طلب امتحان» لو موجود.
 *
 * مثال: «اعمللي امتحان في الفيزياء من 10 أسئلة مستوى متوسط»
 *   → { subject: "الفيزياء", count: 10, types: [], difficulty: "medium" }
 */
export function detectExamRequest(raw: string): ExamRequest | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;

  const text = loosen(normalizeDigits(raw.slice(0, 500)));

  const hasExamWord = EXAM_KEYWORDS.some((word) => text.includes(loosen(word)));
  if (!hasExamWord) return null;

  if (NEGATIVE_MARKERS.some((word) => text.includes(loosen(word)))) return null;

  const subject = extractSubject(raw);
  const count = extractCount(raw);
  const types = extractTypes(text);
  const difficulty = extractDifficulty(text);

  return {
    subject,
    count,
    types,
    difficulty,
    complete: subject !== null && count !== null,
    reason: "exam-request",
  };
}

/* -------------------------------------------------------------------------- */
/* ٥) عدد الأسئلة                                                              */
/* -------------------------------------------------------------------------- */

/**
 * تطبيع **خفيف** لنص العدد: بيشيل التشكيل وبيوحّد الألف بس.
 *
 * ⚠️ **ليه مش `loosen`**: `loosen` بيحوّل ئ→ي وة→ه ⇒ «الأسئلة» بتطلع
 *    «الاسياله» والكلمة اللي بندور عليها («أسئلة») بتتغيّر. هنا بنسيب
 *    الحروف زي ما هي عشان مطابقة الأعداد الكلامية تبقى ثابتة.
 */
function normalizeForCount(text: string): string {
  return text
    .replace(/[ً-ْـٰ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[؟?!.،,:؛;"«»()[\]{}'"`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** كلمة «السؤال» بصيغها المختلفة — بتُقارن بالتوكن بالظبط. */
const COUNT_NOUN = /^(?:اسئله|اسئيه|اسئلا|اسئلة|سؤال|سؤالا|سؤالاً|question|questions)$/;

function extractCount(raw: string): number | null {
  const text = normalizeForCount(normalizeDigits(raw.slice(0, 500)));

  // ① «10 أسئلة» / «10 سؤال» / «١٠ أسئلة» — الرقم اللي قبل كلمة السؤال.
  const beforeNoun = text.match(/(\d{1,2})\s*(?:اسئله|اسئيه|اسئلا|اسئلة|سؤال|سؤالا|سؤالاً|question)/);
  if (beforeNoun) {
    const value = Number(beforeNoun[1]);
    if (value >= EXAM_MIN_COUNT && value <= EXAM_MAX_COUNT) return value;
  }

  // ② «عدد الأسئلة 10» / «عدد الأسئلة: 10»
  const labelled = text.match(
    /(?:عدد|عددال)\s*(?:ال)?(?:اسئله|اسئيه|اسئلا|اسئلة|سؤال|questions)\s*(?:هي|=|:)?\s*(\d{1,2})/
  );
  if (labelled) {
    const value = Number(labelled[1]);
    if (value >= EXAM_MIN_COUNT && value <= EXAM_MAX_COUNT) return value;
  }

  // ③ «من 10» جوه سياق الامتحان — «امتحان من 10 أسئلة».
  const afterMin = text.match(/من\s+(\d{1,2})\b/);
  if (afterMin) {
    const value = Number(afterMin[1]);
    if (value >= EXAM_MIN_COUNT && value <= EXAM_MAX_COUNT) return value;
  }

  // ④ العدد الكلامي: «خمسة أسئلة» — التوكن اللي قبل كلمة السؤال.
  const tokens = text.split(" ");
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (!COUNT_NOUN.test(tokens[index + 1])) continue;
    const value = matchWordNumber(tokens[index]);
    if (value !== null && value >= EXAM_MIN_COUNT && value <= EXAM_MAX_COUNT) return value;
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* ٦) المادة                                                                    */
/* -------------------------------------------------------------------------- */

/** كلمات مابتصلحش تبقى اسم مادة (حروف جر/أعداد/كلمات وظيفية). */
const SUBJECT_NOISE = new Set([
  "من", "عن", "في", "فى", "ب", "على", "مادة", "بمادة", "امتحان", "إمتحان",
  "اختبار", "الكويز", "كويز", "quiz", "exam", "اسئله", "اسئلة", "سؤال", "سؤالا",
  "عدد", "عددال", "الاسئله", "منها", "عليها", "ليها", "بهم", "هو", "هي",
]);

function isNoiseToken(token: string): boolean {
  const t = loosen(token);
  if (!t) return true;
  if (/^\d+$/.test(t)) return true;
  if (SUBJECT_NOISE.has(t)) return true;
  return false;
}

/**
 * بيطلّع اسم المادة من جملة طلب امتحان.
 *
 * ⚠️ ترتيب الأولوية: «في [المادة]» —
 *    لأن «امتحان من 10 أسئلة» لوحدها مش مادة.
 */
export function extractSubject(raw: string): string | null {
  const text = raw.slice(0, 500);

  // ① «في الفيزياء» / «بمادة الرياضيات» / «مادة الفيزياء»
  const afterIn = text.match(
    /(?:في|فى|بمادة|مادة)\s+([^\s،.؟!؟]+(?:\s+[^\s،.؟!؟]+)?)/i
  );
  if (afterIn) {
    const cleaned = cleanSubject(afterIn[1]);
    if (cleaned) return cleaned;
  }

  // ② «امتحان الفيزياء» / «اختبار OOP»
  const afterExam = text.match(
    /(?:امتحان|إمتحان|اختبار|كويز|quiz|exam|ميدتيرم|فاينال)\s+([^\s،.؟!]+(?:\s+[^\s،.؟!]+)?)/i
  );
  if (afterExam) {
    const cleaned = cleanSubject(afterExam[1]);
    if (cleaned) return cleaned;
  }

  return null;
}

function cleanSubject(fragment: string): string | null {
  const words = fragment
    .trim()
    .split(/\s+/)
    .filter((word) => !isNoiseToken(word));

  if (words.length === 0) return null;
  const joined = words.join(" ").trim();
  // حرف أو حرفين مش اسم مادة (غالبًا بقايا حرف جر).
  if (joined.length < 3) return null;
  return joined;
}

/* -------------------------------------------------------------------------- */
/* ٧) الأنواع والصعوبة                                                          */
/* -------------------------------------------------------------------------- */

const TYPE_MARKERS: Array<{ type: ExamQuestionType; words: string[] }> = [
  { type: "mcq", words: ["اختيار من متعدد", "متعدد", "mcq", "اختياري"] },
  { type: "true_false", words: ["صح وخطا", "صح او خطا", "صح و خطا", "true false", "صحيح وخطا"] },
  { type: "essay", words: ["مقالي", "مقاله", "essay", "اكتابي", "مفتوح"] },
];

function extractTypes(text: string): ExamQuestionType[] {
  const found: ExamQuestionType[] = [];
  for (const marker of TYPE_MARKERS) {
    if (marker.words.some((word) => text.includes(word)) && !found.includes(marker.type)) {
      found.push(marker.type);
    }
  }
  return found;
}

const DIFFICULTY_MARKERS: Array<{ level: ExamDifficulty; words: string[] }> = [
  { level: "easy", words: ["سهل", "سهله", "easy", "مستوي سهل"] },
  { level: "medium", words: ["متوسط", "متوسطه", "medium", "مستوي متوسط"] },
  { level: "hard", words: ["صعب", "صعبه", "hard", "مستوي صعب", "challenging"] },
];

function extractDifficulty(text: string): ExamDifficulty | null {
  for (const marker of DIFFICULTY_MARKERS) {
    if (marker.words.some((word) => text.includes(word))) return marker.level;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* ٨) الرابط والرد                                                                */
/* -------------------------------------------------------------------------- */

/** رابط صفحة الامتحانات مع اختيار الطالب (مادة/عدد/أنواع/صعوبة). */
export function buildExamHref(request: ExamRequest): string {
  const params = new URLSearchParams();
  params.set("gen", "1");
  if (request.subject) params.set("subject", request.subject);
  if (request.count) params.set("count", String(request.count));
  if (request.types.length > 0) params.set("types", request.types.join(","));
  if (request.difficulty) params.set("difficulty", request.difficulty);
  return `/exams?${params.toString()}`;
}

/**
 * رد المساعد لما الطلب **مكتمل** — رسالة قصيرة + رابط مباشر.
 *
 * ⛔ مفيش سؤال توضيحي هنا: الطالب قال كل حاجة، فأي سؤال كده إهدار وقت.
 *
 * ⚠️ **الرابط بيتكتب نص فاضي (مش markdown)**: الـUI بتاع الداشبورد بيعرض
 *    النص خام، فلو حطينا `[نص](رابط)` هيبقى مكسوّر. الرابط المطلق بيتحول
 *    ل لينك تلقائي في الـmarkdown، والزر السريع بيعمل الباقي.
 */
export function buildExamAnswer(request: ExamRequest, origin?: string): string {
  const subject = request.subject ?? "المادة";
  const count = request.count ?? "العدد المطلوب";
  const types =
    request.types.length > 0
      ? ` (${request.types.map((type) => TYPE_LABELS_AR[type]).join(" + ")})`
      : "";
  const difficulty = request.difficulty
    ? ` بمستوى ${DIFFICULTY_LABELS_AR[request.difficulty]}`
    : "";
  const href = buildExamHref(request);
  const link = origin ? `${origin.replace(/\/$/, "")}${href}` : href;

  return [
    `تمام — جهّزت لك امتحان ${subject} من ${count} سؤال${types}${difficulty}.`,
    "افتح مولّد الامتحان وابدأ التوليد (محاضراتك محفوظة جاهزة):",
    link,
  ].join("\n\n");
}

/** لو الطلب **ناقص** — سؤال واحد محدد عن الناقص بس (مش مقهى أسئلة). */
export function buildExamClarifyingAnswer(request: ExamRequest): string {
  const missing: string[] = [];
  if (!request.subject) missing.push("المادة");
  if (!request.count) missing.push("عدد الأسئلة");
  const subjectPart = request.subject ? ` في ${request.subject}` : "";
  const countPart = request.count ? `${request.count} سؤال` : "";
  return [
    "عشان أبدأ معاك فورًا، محتاج منك حاجة واحدة ناقصة:",
    `• ${missing.join(" و")}${subjectPart}${countPart ? ` (${countPart})` : ""}`,
    "وبمجرد ما تبعتهالي هفتحلك مولّد الامتحان على طول.",
  ].join("\n");
}

const TYPE_LABELS_AR: Record<ExamQuestionType, string> = {
  mcq: "اختيار من متعدد",
  true_false: "صح أو خطأ",
  essay: "مقالي",
};

const DIFFICULTY_LABELS_AR: Record<ExamDifficulty, string> = {
  easy: "سهل",
  medium: "متوسط",
  hard: "صعب",
};

/* -------------------------------------------------------------------------- */
/* ٩) قواعد البرومبت                                                            */
/* -------------------------------------------------------------------------- */

/**
 * قواعد بتتحقن في برومبت المساعد — عشان الموديل نفسه ما يسألش أسئلة
 * توضيحية لما الطلب مكتمل (القواعد دي بتكمّل الكاشف، مش بتغني عنه).
 */
export const EXAM_REQUEST_PROMPT_RULES = [
  "طلب امتحان من الطالب — لو قال المادة **و** عدد الأسئلة (أو النمط/الصعوبة):",
  "- متسألش أي سؤال توضيحي. نفّذ فورًا: افتح له صفحة الامتحانات (/exams?gen=1) واذكر له اختياره.",
  "- متقترحش تقسيم العدد ولا تسأل «5 ولا مجموعتين؟» — الطالب قال الرقم، خُد بيه.",
  "- لو ناقص حاجة واحدة بس (المادة أو العدد) اسأل سؤالًا واحدًا محددًا عن الناقص، وبعده نفّذ.",
  "- متولّدش الأسئلة بنفسك في الشات — المولّد بياخدها من تفريغ محاضراتك، وأنت بتوجّهه.",
].join("\n");