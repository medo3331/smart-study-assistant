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
  "نموذج امتحان", "أسئلة امتحان", "ورقة امتحان", "اختبرني", "اختبرنى",
];

/** كلمات بتلغي الكشف — الكلام عن امتحان فات/موجود مش طلب توليد. */
const NEGATIVE_MARKERS = [
  "امبارح", "إمبارح", "الامتحان اللي فات", "عملت الامتحان", "خلصت الامتحان",
  "نجحت", "رسبت", "كان عندي", "كنت عندي", "حللت الامتحان", "امتحنت",
];

/**
 * عبارات نيّة تخطيط — الطالب بيحكي عن امتحان جاي أو بيطلب مساعدة في التجهيز
 * («عندي امتحان بعد يومين»)، مش طلب توليد امتحان. دي بترجّع الرسالة للموديل
 * عشان يخطّط ويرتّب المهمات بدل ما نبعتله زر مولّد فورًا.
 */
const PLANNING_MARKERS = [
  "عندي امتحان", "امتحاني", "امتحانى",
  "عندي اختبار", "اختباري", "اختبارى",
  "عندي كويز", "كويزي",
  "باقي على", "فاضل على",
  "بعد يوم", "بعد اسبوع", "بعد شهر",
  "الاسبوع الجاي", "الامتحان الجاي", "قرب الامتحان", "قربت الامتحانات",
  "مش مذاكر", "مش مستعد", "لسه مستعدش", "ازاي اجهز", "ازاي اذاكر",
  "خطة مذاكرة", "جدول مذاكرة", "رتب لي", "رتبلي",
];

/**
 * عبارات طلب توليد صريح — لو ظهرت مع أي حاجة تانية، طلب التوليد هو اللي بيكسب
 * («عندي امتحان، اختبرني» ⇒ اختبرني هنا).
 */
const GENERATION_MARKERS = [
  "اعمل لي امتحان", "اعملي امتحان", "اعمل امتحان",
  "اعمل لي اختبار", "اعملي اختبار", "اعمل اختبار",
  "اعمل لي كويز", "اعملي كويز", "اعمل كويز",
  "عايز امتحان", "عاوز امتحان", "عايز اختبار", "عاوز اختبار", "عايز كويز", "عاوز كويز",
  "اريد امتحان", "اريد اختبار",
  "اختبرني", "اختبرنى",
  "ولد لي امتحان", "ولد لي اختبار", "اكتب لي امتحان", "جهز لي امتحان",
  "امتحان تجريبي", "اختبار تجريبي", "كويز تجريبي",
  "generate", "quiz me",
];

/**
 * بيقول الطالب بيحكي عن امتحان جاي أو طلب مساعدة في التجهيز/التخطيط؟
 *
 * مثال: «عندي امتحان في الشبكات بعد يومين» ⇒ true (تخطيط، مش توليد).
 * «عندي امتحان بس عايز امتحان تجريبي» ⇒ false (التوليد الصريح بيكسب).
 */
export function isExamPlanningStatement(raw: string): boolean {
  if (typeof raw !== "string" || raw.trim().length === 0) return false;
  const text = loosen(normalizeDigits(raw.slice(0, 500)));
  if (GENERATION_MARKERS.some((word) => text.includes(loosen(word)))) return false;
  return PLANNING_MARKERS.some((word) => text.includes(loosen(word)));
}

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
  /**
   * فيه طلب امتحان **شغّال** في المحادثة (حتى لو ناقصه بيانات).
   *
   * ⚠️ الشات مش form: أول ما الطالب يقول «عايز امتحان» بنبعتله زر
   *    المولّد فورًا، وهو بيكمّل الباقي في الشاشة.
   */
  active: boolean;
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

  // 🎯 «عندي امتحان بعد يومين» = طلب تخطيط ومساعدة، مش طلب توليد امتحان.
  //    بنسيبها للموديل يخطّط ويرتّب المهمات بدل ما نبعت زر المولّد فورًا.
  if (isExamPlanningStatement(text)) return null;

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
    active: true,
    reason: "exam-request",
  };
}

/** دور واحد في المحادثة (رسالة) — بنقرا التاريخ كله مش آخر رسالة. */
export interface ChatTurn {
  role?: string | null;
  content?: string | null;
}

/**
 * الرسالة دي فيها **نيّة امتحان**؟ (كلمة امتحان + مفيش كلام عن امتحان فات)
 *
 * ⚠️ بتستخدمها الراوتات عشان تقرّر: «محتاج أقرأ تاريخ المحادثة ولا أخلص؟»
 */
export function containsExamSignal(raw: string): boolean {
  if (typeof raw !== "string" || raw.trim().length === 0) return false;
  const text = loosen(normalizeDigits(raw.slice(0, 500)));
  const hasExamWord = EXAM_KEYWORDS.some((word) => text.includes(loosen(word)));
  if (!hasExamWord) return false;
  if (NEGATIVE_MARKERS.some((word) => text.includes(loosen(word)))) return false;
  return !isExamPlanningStatement(text);
}

/** أقصى عدد دورات بنقراها من التاريخ (آخر ١٢ رسالة في المحادثة). */
const MAX_SCANNED_TURNS = 12;

/**
 * 🔥 كشف **stateful** — بيقرا تاريخ المحادثة ويجمع بيانات طلب الامتحان.
 *
 * ⚠️ **ليه تاريخ وليس آخر رسالة**: المساعد كان بيدخل في **حلقة مفرغة**
 *    («كام سؤال؟» → «5» → «المادة إيه؟» → «عربي» → «كام سؤال؟» تاني).
 *    السبب إن كل نداء كان بيقرا الرسالة الأخيرة بس ⇒ بيانات الطالب اللي
 *    قالها في الرسالة السابقة بتضيع ⇒ المساعد بيبدأ من الصفر كل مرة.
 *
 * القاعدة: بنمشي على **آخر** رسالة فيها كلمة امتحان (بداية الطلب) وبنجمع
 * من بعدها لحد الآن: المادة والعدد (آخر قيمة مقروءة هي الفيصل).
 *
 * النتيجة `active: true` حتى لو البيانات ناقصة — عشان بنبعت زر المولّد فورًا
 * (الشات مش form؛ الطالب بيكمّل الباقي في شاشة المولّد).
 */
export function detectExamRequestFromHistory(turns: ChatTurn[]): ExamRequest | null {
  const scanned = (turns ?? [])
    .filter((turn) => turn && typeof turn.content === "string" && turn.content.trim() !== "")
    .slice(-MAX_SCANNED_TURNS);

  const userTurns = scanned.filter((turn) => turn.role !== "assistant");
  if (userTurns.length === 0) return null;

  // 🎯 آخر رسالة طالب فيها حكي عن امتحان جاي (تخطيط/مساعدة)؟ ⇒ مش طلب توليد —
  //    بنسيبها للموديل (خطط وترتيب مهمات) بدل ما نبعت زر المولّد تاني.
  const lastUserTurn = userTurns[userTurns.length - 1];
  if (isExamPlanningStatement(String(lastUserTurn.content ?? ""))) return null;

  // ① بداية الطلب = آخر رسالة فيها كلمة امتحان (وليست كلام عن امتحان فات).
  let startIndex = -1;
  for (let index = scanned.length - 1; index >= 0; index -= 1) {
    const turn = scanned[index];
    if (turn.role === "assistant") continue;
    const content = String(turn.content);
    const text = loosen(normalizeDigits(content.slice(0, 500)));
    const hasExamWord = EXAM_KEYWORDS.some((word) => text.includes(loosen(word)));
    if (!hasExamWord) continue;
    if (NEGATIVE_MARKERS.some((word) => text.includes(loosen(word)))) continue;
    startIndex = index;
    break;
  }
  if (startIndex === -1) return null;

  // ② نجمع البيانات من بداية الطلب لحد الآن (آخر قيمة مقروءة هي الفيصل).
  let subject: string | null = null;
  let count: number | null = null;
  let types: ExamQuestionType[] = [];
  let difficulty: ExamDifficulty | null = null;

  for (let index = startIndex; index < scanned.length; index += 1) {
    const turn = scanned[index];
    if (turn.role === "assistant") continue;
    const content = String(turn.content);

    const turnSubject = extractSubject(content) ?? extractLooseSubject(content);
    if (turnSubject) subject = turnSubject;

    const turnCount = extractCount(content) ?? extractBareCount(content);
    if (turnCount !== null) count = turnCount;

    const text = loosen(normalizeDigits(content.slice(0, 500)));
    const turnTypes = extractTypes(text);
    if (turnTypes.length > 0) types = turnTypes;
    const turnDifficulty = extractDifficulty(text);
    if (turnDifficulty) difficulty = turnDifficulty;
  }

  // ③ لو أنا قبل كده بعته نفس الزر بنفس الاختيار ⇒ متكررش نفس الرد.
  //    (الطالب قال «تمام» بعد ما وصله الزر ⇒ يرد عادي، مش تكرار).
  const sent = lastSentExamRequest(scanned, startIndex);
  if (sent && sent.subject === subject && sent.count === count) return null;

  return {
    subject,
    count,
    types,
    difficulty,
    complete: subject !== null && count !== null,
    active: true,
    reason: "exam-request-history",
  };
}

/** آخر زر مولّد بعناه المساعد (بالاختيار اللي فيه) — عشان نعرف بينكرّره ولا لأ. */
function lastSentExamRequest(
  scanned: ChatTurn[],
  startIndex: number
): { subject: string | null; count: number | null } | null {
  for (let index = scanned.length - 1; index > startIndex; index -= 1) {
    const turn = scanned[index];
    if (turn.role !== "assistant") continue;
    const content = String(turn.content ?? "");
    if (!content.includes("/exams?gen=1")) continue;
    const subject = decodeURIComponent(
      (content.match(/[?&]subject=([^&\s)"']+)/)?.[1] ?? "").replace(/\+/g, " ")
    );
    const countRaw = content.match(/[?&]count=(\d{1,2})/)?.[1];
    const count = countRaw ? Number(countRaw) : null;
    return { subject: subject || null, count: count ?? null };
  }
  return null;
}

/**
 * عدد «مجرّد» — رسالة الطالب كلها رقم («5» جوابًا على «كام سؤال؟»).
 *
 * ⚠️ بيتقبل **بس** جوه كشف التاريخ (طلب امتحان شغّال) — مش في الرسالة
 *    الواحدة، عشان رقم لوحده مش دليل على إنه عدد أسئلة.
 */
function extractBareCount(raw: string): number | null {
  const text = normalizeForCount(normalizeDigits(raw.slice(0, 50))).trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const value = Number(text);
  if (value < EXAM_MIN_COUNT || value > EXAM_MAX_COUNT) return null;
  return value;
}

/** الردود اللي مش مادة («تمام» / «ايوه» / «ماشي» …). */
const REPLY_NOISE = new Set([
  "تمام", "ايوه", "ايه", "لا", "ماشي", "شكرا", "شكرا لك", "اهلا", "السلام عليكم",
  "ok", "okay", "yes", "no", "thanks", "thank you", "hi", "hello",
  "اكمل", "كمل", "يلا", "برضه", "نفس الشيء", "زي ما قلت", "خلاص",
]);

/**
 * مادة «مجرّدة» — رسالة الطالب كلها كلمة («عربي» جوابًا على «المادة إيه؟»).
 *
 * ⚠️ بتقبل الكلمة بس لو: قصيرة، مش رقم، ومش من كلام الردود.
 */
function extractLooseSubject(raw: string): string | null {
  const text = raw.trim();
  if (!text || text.length > 40) return null;
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 3) return null;
  if (tokens.some((token) => /^\d+$/.test(token))) return null;
  if (REPLY_NOISE.has(loosen(text))) return null;
  if (tokens.some((token) => REPLY_NOISE.has(loosen(token)))) return null;
  if (tokens.some((token) => isNoiseToken(token))) return null;
  const joined = tokens.join(" ").trim();
  if (joined.length < 3) return null;
  return joined;
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
    /(?:في|فى|بمادة|مادة)\s+(?:مادة\s+|بمادة\s+)?([^\s،.؟!؟]+(?:\s+[^\s،.؟!؟]+)?)/i
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
export function buildExamHref(request: ExamRequest, options: { topic?: boolean } = {}): string {
  const params = new URLSearchParams();
  params.set("gen", "1");
  if (request.subject) params.set("subject", request.subject);
  if (request.count) params.set("count", String(request.count));
  if (request.types.length > 0) params.set("types", request.types.join(","));
  if (request.difficulty) params.set("difficulty", request.difficulty);
  // 🌍 **موضوع عام**: المولّد يفتح على تاب «موضوع عام» ومعبّى بالموضوع.
  if (options.topic && request.subject) params.set("topic", request.subject);
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
 *
 * ⚠️ **`topicMode`**: الطالب ماعندهوش ملفات ⇒ بنقترح «موضوع عام»
 *    (امتحان من معلومات الـAI) بدل ما نقوله «مفيش محاضرات».
 */
export function buildExamAnswer(
  request: ExamRequest,
  origin?: string,
  options: { hasSources?: boolean } = {}
): string {
  const subject = request.subject;
  const count = request.count;
  const types =
    request.types.length > 0
      ? ` (${request.types.map((type) => TYPE_LABELS_AR[type]).join(" + ")})`
      : "";
  const difficulty = request.difficulty
    ? ` بمستوى ${DIFFICULTY_LABELS_AR[request.difficulty]}`
    : "";
  /**
   * 🌍 **موضوع عام؟** = الطالب طلب امتحان في مادة، وعنده **ملفات**؟ لو
   *    لأ ⇒ بنفتح المولّد على تاب «موضوع عام» (امتحان من معارف الـAI).
   */
  const topicMode = subject ? options.hasSources === false : false;
  const href = buildExamHref(request, { topic: topicMode });
  const link = origin ? `${origin.replace(/\/$/, "")}${href}` : href;

  // الطلب مكتمل ⇒ نحكيله اختياره بالظبط (ومفيش أي سؤال توضيحي).
  if (subject && count) {
    if (topicMode) {
      return [
        `تمام — جهّزت لك امتحان ${subject} من ${count} سؤال${types}${difficulty}.`,
        "ما وصلناش ملفات في الموضوع ده، فالامتحان هيتبني على معلومات عامة فيه. لو عايزه مخصص لمحاضرتك، ارفع الملف في نفس الشاشة:",
        link,
      ].join("\n\n");
    }
    return [
      `تمام — جهّزت لك امتحان ${subject} من ${count} سؤال${types}${difficulty}.`,
      "افتح مولّد الامتحان وابدأ التوليد (محاضراتك محفوظة جاهزة):",
      link,
    ].join("\n\n");
  }

  // الطلب ناقص ⇒ ما نسألش خالص: نحوّله للشاشة وهيكمّل الباقي بنفسه.
  const known: string[] = [];
  if (subject) known.push(`المادة: ${subject}`);
  if (count) known.push(`${count} سؤال`);
  if (request.types.length > 0) {
    known.push(`الأنواع: ${request.types.map((t) => TYPE_LABELS_AR[t]).join(" + ")}`);
  }
  if (request.difficulty) known.push(`المستوى: ${DIFFICULTY_LABELS_AR[request.difficulty]}`);

  return [
    `تمام — طلب امتحان${known.length > 0 ? ` (${known.join(" · ")})` : ""}.`,
    "افتح مولّد الامتحان وكمّل باقي الإعدادات فيه (المادة/الأنواع/الصعوبة) — أهو أضمن وأسرع من إكمالها في الشات:",
    link,
  ].join("\n\n");
}

/** لو الطلب **ناقص** — سؤال واحد محدد عن الناقص بس (مش مقهى أسئلة). */
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
  "⚠️ أهم قاعدة أولًا — فرّق بين الطلبين قبل أي حاجة:",
  "- 📚 لو الطالب بيحكي عن امتحان جاي («عندي امتحان بعد يومين»، «امتحاني السبت»، «مش مستعد للامتحان») — ده طلب مساعدة وتخطيط مش طلب امتحان: متبعتش روابط ولا زر مولّد خالص. ابدأ فورًا رحلة تخطيط: اسأل عن المادة، المحتوى وعدد المحاضرات أو الأجزاء، موعد الامتحان والوقت المتاح يوميًا، وبعدها ابنِ له خطة مذاكرة واقعية بخطوات مرقّمة ومواعيد، ورتّب له المهمات خطوة بخطوة.",
  "- 📝 لو الطالب طلب توليد امتحان صراحةً («اعمل لي امتحان»، «اختبرني»، «عايز امتحان من 10 أسئلة») — ساعتها بس بتشتغل قواعد زر المولّد اللي تحت.",
  "لو المستخدم طلب امتحان (طلب توليد صريح):",
  "- متسألش أسئلة توضيحية خالص (ولا سؤالين، ولا «كام سؤال ولا مجموعتين؟»).",
  "- اعرض زر «افتح مولّد الامتحان» فورًا مع رابط /exams?gen=1 — ولو تعرف المادة أو العدد ضيفهم (?subject=…&count=…).",
  "- قوله يكمل باقي الإعدادات (المادة/الأنواع/الصعوبة) في شاشة المولّد، لأن الشاشة أسهل وأسرع من الشات.",
  "- متولّدش الأسئلة بنفسك في الشات — المولّد بياخدها من تفريغ محاضراته.",
  "- 🌍 لو مفيش ملفات (محاضرات/مستندات) للمادة دي: متقولش «مفيش محاضرات» — قول إنه ينفع يعمل «موضوع عام» (امتحان من معلومات عامة في المادة) وافتح المولّد على ?topic=… .",
].join("\n");