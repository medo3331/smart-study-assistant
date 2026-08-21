/* ==========================================================================
   كاشف نية الامتحان

   الهدف: المستخدم يكتب في الشات «عندي امتحان بعد ٣ أيام» والموقع يفهم
   لوحده إن ده طلب خطة مستعجلة، مش سؤال عادي للمساعد.

   ليه كود مش موديل؟ لأن الكشف لازم يكون **فوري ومجاني ومحدّد**:
     • فوري — الكارت بيظهر قبل أي طلب شبكة، فالمستخدم بيحس إن الموقع فاهم.
     • مجاني — لو بعتنا كل رسالة للموديل نسأله «دي نية امتحان؟» بنضاعف
       فاتورة Groq على كل حرف بيتكتب.
     • محدّد — الموديل بيهلوس تواريخ. الأرقام هنا بتتقرا من نص المستخدم
       نفسه فمافيش مجال لـ «بعد ٣ أيام» تطلع ٧.

   الدوال كلها **خالصة** (مفيش Date.now جوه المنطق، التاريخ بيتمرر) عشان
   تتختبر وماتكسرش عند نص الليل.
   ========================================================================== */

/** أقصى مدة بنقبلها كـ «امتحان قريب». أكتر من كده يبقى تراك عادي. */
export const MAX_EXAM_DAYS = 30;
/** أقل مدة. صفر = الامتحان النهاردة، وده لسه ينفع (خطة ليوم واحد). */
export const MIN_EXAM_DAYS = 0;

export interface ExamIntent {
  /** كام يوم فاضل للامتحان. صفر = النهاردة. */
  daysUntil: number;
  /** المادة لو قدرنا نطلّعها من الجملة، وإلا null. */
  subject: string | null;
  /** النص اللي لقطنا منه المدة — بنوريه للمستخدم عشان يتأكد إننا فهمنا صح. */
  matchedPhrase: string;
}

/* --------------------------------------------------------------------------
   ١) الأرقام

   العربي بيتكتب بأرقام هندية (٣) أو لاتينية (3) أو كلام (تلاتة). التلاتة
   لازم يشتغلوا لأن المستخدم المصري بيخلط بينهم في نفس الجملة.
   -------------------------------------------------------------------------- */

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_INDIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** بيحوّل أي أرقام هندية في النص لأرقام لاتينية عشان parseInt يفهمها. */
export function normalizeDigits(text: string): string {
  let out = "";
  for (const ch of text) {
    const ai = ARABIC_INDIC_DIGITS.indexOf(ch);
    if (ai !== -1) {
      out += String(ai);
      continue;
    }
    const ei = EXTENDED_ARABIC_INDIC_DIGITS.indexOf(ch);
    if (ei !== -1) {
      out += String(ei);
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * الأعداد المكتوبة كلام.
 *
 * ⚠️ الترتيب هنا **مهم**: البحث بيمشي بالطول التنازلي، فـ «اتناشر» لازم
 * تتلاقى قبل «تنين» — وإلا «اتناشر» هتتقرا ٢ وسط الكلمة.
 */
const WORD_NUMBERS: Record<string, number> = {
  // ١–١٠ بالفصحى والعامية المصرية
  "واحد": 1, "يوم": 1, "يومين": 2, "اتنين": 2, "تنين": 2, "اثنين": 2,
  "تلاته": 3, "تلاتة": 3, "ثلاثة": 3, "ثلاث": 3, "تلات": 3,
  "اربعه": 4, "اربعة": 4, "أربعة": 4, "اربع": 4, "أربع": 4,
  "خمسه": 5, "خمسة": 5, "خمس": 5,
  "سته": 6, "ستة": 6, "ست": 6,
  "سبعه": 7, "سبعة": 7, "سبع": 7,
  "تمانيه": 8, "تمانية": 8, "ثمانية": 8, "تمان": 8,
  "تسعه": 9, "تسعة": 9, "تسع": 9,
  "عشره": 10, "عشرة": 10, "عشر": 10,
  // ١١–١٥ (أكتر من كده الناس بتكتب رقم)
  "حداشر": 11, "احداشر": 11, "أحد عشر": 11,
  "اتناشر": 12, "اطناشر": 12, "اثنا عشر": 12,
  "تلتاشر": 13, "ثلاثة عشر": 13,
  "اربعتاشر": 14, "أربعة عشر": 14,
  "خمستاشر": 15, "خمسة عشر": 15,
};

/** مفاتيح الأعداد مرتّبة بالطول التنازلي — شوف التحذير فوق. */
const WORD_NUMBER_KEYS = Object.keys(WORD_NUMBERS).sort((a, b) => b.length - a.length);

/* --------------------------------------------------------------------------
   ٢) كلمات الامتحان والوقت
   -------------------------------------------------------------------------- */

/** لازم واحدة من دي تكون في الجملة، وإلا مش نية امتحان. */
const EXAM_WORDS = [
  "امتحان", "إمتحان", "اختبار", "الاختبار", "الامتحان", "الإمتحان",
  "امتحانات", "الامتحانات", "كويز", "quiz", "exam", "test",
  "ميدتيرم", "midterm", "فاينال", "final", "انترفيو", "interview",
  "مقابلة", "تسليم", "deadline", "ديدلاين", "بروجكت", "مشروع",
];

/** كلمات بتلغي الكشف — سؤال عن الامتحان مش إعلان عن موعده. */
const NEGATIVE_MARKERS = [
  "امبارح", "إمبارح", "الامتحان اللي فات", "خلص", "خلصت", "عملت الامتحان",
  "نجحت", "رسبت", "كان عندي", "كنت عندي", "ازاي", "إزاي", "ايه هو", "إيه هو",
];

/* --------------------------------------------------------------------------
   ٣) أيام الأسبوع — «امتحاني الخميس»

   ده أصعب حالة: «الخميس» معناها الخميس الجاي، واللي بيحدد كام يوم فاضل هو
   النهاردة إيه. بناخد التاريخ كـ parameter مش من Date.now() عشان الدالة
   تفضل خالصة.
   -------------------------------------------------------------------------- */

/** ترتيب JS: الأحد = 0. */
const WEEKDAYS: Record<string, number> = {
  "الاحد": 0, "الأحد": 0, "احد": 0,
  "الاتنين": 1, "الإتنين": 1, "الاثنين": 1, "اتنين الجاي": 1,
  "التلات": 2, "الثلاثاء": 2, "التلاتا": 2,
  "الاربع": 3, "الأربع": 3, "الاربعاء": 3, "الأربعاء": 3, "الاربعا": 3,
  "الخميس": 4,
  "الجمعه": 5, "الجمعة": 5,
  "السبت": 6,
};

const WEEKDAY_KEYS = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length);

/* --------------------------------------------------------------------------
   ٤) الكاشف
   -------------------------------------------------------------------------- */

/** بيشيل التشكيل والتطويل عشان «إمتِحان» تساوي «امتحان». */
function stripDiacritics(text: string): string {
  return text.replace(/[ً-ْـٰ]/g, "");
}

/** بيوحّد الألف والهاء/التاء عشان المقارنة تنجح على كل الإملاءات. */
function loosen(text: string): string {
  return stripDiacritics(text)
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

/**
 * بيقرا جملة ويطلّع نية الامتحان لو موجودة.
 *
 * @param raw     نص المستخدم زي ما هو.
 * @param today   تاريخ النهاردة — بيتمرر عشان الدالة تفضل خالصة وتتختبر.
 *                لازم يكون بداية اليوم المحلي (نستخدم اليوم بس مش الساعة).
 */
export function detectExamIntent(raw: string, today: Date = new Date()): ExamIntent | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;

  // بنقص النص عشان مانعملش regex على مقال كامل لو المستخدم لزق ملف
  const text = loosen(normalizeDigits(raw.slice(0, 500).toLowerCase()));

  // (أ) لازم فيه كلمة امتحان
  const hasExamWord = EXAM_WORDS.some((w) => text.includes(loosen(w)));
  if (!hasExamWord) return null;

  // (ب) ولا تكون جملة عن امتحان فات
  if (NEGATIVE_MARKERS.some((w) => text.includes(loosen(w)))) return null;

  const subject = extractSubject(raw);

  // (ج) «بعد N يوم» — الشكل الأساسي والأوضح
  //     بناخد الرقم اللي **بعد** كلمة بعد بس، عشان «امتحان ٢ بعد ٣ أيام»
  //     ماتطلعش ٢.
  const afterNumber = text.match(/بعد\s+(\d{1,2})\s*(يوم|ايام|يومين|اسبوع|اسابيع|شهر)?/);
  if (afterNumber) {
    const n = parseInt(afterNumber[1], 10);
    const unit = afterNumber[2] ?? "يوم";
    const days = unit.startsWith("اسبوع") || unit.startsWith("اسابيع") ? n * 7 : unit === "شهر" ? n * 30 : n;
    if (isSaneDayCount(days)) {
      return { daysUntil: days, subject, matchedPhrase: afterNumber[0].trim() };
    }
  }

  // (د) «بعد تلات أيام» — نفس الشكل بس العدد كلام
  const afterWord = text.match(/بعد\s+([^\s]+(?:\s+عشر)?)\s*(يوم|ايام|اسبوع|اسابيع)?/);
  if (afterWord) {
    const wordNum = matchWordNumber(afterWord[1]);
    if (wordNum !== null) {
      const unit = afterWord[2] ?? "يوم";
      const days = unit.startsWith("اسبوع") || unit.startsWith("اسابيع") ? wordNum * 7 : wordNum;
      if (isSaneDayCount(days)) {
        return { daysUntil: days, subject, matchedPhrase: afterWord[0].trim() };
      }
    }
  }

  // (د٢) «بعد اسبوع» — وحدة زمن من غير رقم قدامها
  //
  // ⚠️ الحالة دي بتفلت من (د) لأن الـ regex بتاعتها بتاخد أول كلمة بعد
  // «بعد» كعدد، فـ «اسبوع» بتروح لـ matchWordNumber وبترجع null. والناس
  // بتكتب كده كتير («امتحاني بعد اسبوع») — أكتر من «بعد ٧ أيام».
  //
  // وماينفعش نحط «اسبوع: ٧» في WORD_NUMBERS، لأن ساعتها «بعد اسبوعين»
  // هتتقرا عدد=٢ ووحدة=يوم = يومين بدل أسبوعين.
  const bareUnit = text.match(/بعد\s+(اسبوعين|اسابيع|اسبوع|شهرين|شهر|يومين|يوم)(?:\s|$|[.,!؟])/);
  if (bareUnit) {
    const UNIT_DAYS: Record<string, number> = {
      "يوم": 1, "يومين": 2,
      "اسبوع": 7, "اسبوعين": 14, "اسابيع": 21,
      "شهر": 30, "شهرين": 60,
    };
    const days = UNIT_DAYS[bareUnit[1]];
    if (days !== undefined && isSaneDayCount(days)) {
      return { daysUntil: days, subject, matchedPhrase: bareUnit[0].trim() };
    }
  }

  // (هـ) «يومين» لوحدها بدون «بعد» — «عندي امتحان كمان يومين»
  const bareDuration = text.match(/(?:كمان|فاضل|باقي|في|خلال)\s+(يومين|\d{1,2}\s*(?:يوم|ايام)|[^\s]+\s+(?:يوم|ايام))/);
  if (bareDuration) {
    const days = parseLooseDuration(bareDuration[1]);
    if (days !== null && isSaneDayCount(days)) {
      return { daysUntil: days, subject, matchedPhrase: bareDuration[0].trim() };
    }
  }

  // (و) الكلمات النسبية
  const relative = matchRelativeDay(text);
  if (relative) {
    return { daysUntil: relative.days, subject, matchedPhrase: relative.phrase };
  }

  // (ز) يوم في الأسبوع — «امتحاني الخميس»
  const weekday = matchWeekday(text, today);
  if (weekday) {
    return { daysUntil: weekday.days, subject, matchedPhrase: weekday.phrase };
  }

  return null;
}

/** المدة معقولة؟ فوق الشهر يبقى تراك عادي مش طوارئ. */
function isSaneDayCount(days: number): boolean {
  return Number.isFinite(days) && days >= MIN_EXAM_DAYS && days <= MAX_EXAM_DAYS;
}

/** بيلاقي عدد مكتوب كلام جوه شظية. */
function matchWordNumber(fragment: string): number | null {
  const f = loosen(fragment);
  for (const key of WORD_NUMBER_KEYS) {
    if (f === loosen(key) || f.startsWith(loosen(key))) return WORD_NUMBERS[key];
  }
  return null;
}

/** «يومين» أو «3 ايام» أو «تلات ايام» → رقم. */
function parseLooseDuration(fragment: string): number | null {
  const f = loosen(normalizeDigits(fragment));
  if (f.includes("يومين")) return 2;
  const digits = f.match(/(\d{1,2})/);
  if (digits) return parseInt(digits[1], 10);
  const words = f.replace(/(يوم|ايام)/g, "").trim();
  return matchWordNumber(words);
}

/** الكلمات النسبية: النهاردة / بكرة / بعد بكرة / الأسبوع الجاي. */
function matchRelativeDay(text: string): { days: number; phrase: string } | null {
  // الترتيب مهم: «بعد بكرة» قبل «بكرة»
  const table: [string[], number][] = [
    [["بعد بكرة", "بعد بكره", "بعد غد", "بعدها بيوم"], 2],
    [["بكرة", "بكره", "غدا", "غدًا", "غد"], 1],
    [["النهاردة", "النهارده", "اليوم", "دلوقتي حالا"], 0],
    [["الاسبوع الجاي", "الاسبوع القادم", "اسبوع جاي", "الاسبوع الجديد"], 7],
    [["اخر الاسبوع", "نهاية الاسبوع"], 5],
  ];
  for (const [phrases, days] of table) {
    for (const p of phrases) {
      if (text.includes(loosen(p))) return { days, phrase: p };
    }
  }
  return null;
}

/**
 * «الخميس» → كام يوم من النهاردة لأقرب خميس جاي.
 *
 * لو النهاردة خميس والمستخدم قال «الخميس»، بنفترض **الأسبوع الجاي** (٧ يوم)
 * مش النهاردة — لأن اللي عنده امتحان النهاردة بيقول «النهاردة» مش اسم اليوم.
 */
function matchWeekday(text: string, today: Date): { days: number; phrase: string } | null {
  for (const key of WEEKDAY_KEYS) {
    if (!text.includes(loosen(key))) continue;
    const target = WEEKDAYS[key];
    const current = today.getDay();
    let diff = target - current;
    if (diff <= 0) diff += 7;
    return { days: diff, phrase: key };
  }
  return null;
}

/* --------------------------------------------------------------------------
   ٥) المادة

   بنجرّب نطلّعها من «امتحان <مادة>» أو «في <مادة>». لو مالقيناش، بنرجّع
   null والواجهة بتسأل المستخدم — أحسن من إننا نخمّن غلط ونبني خطة
   لمادة تانية خالص.
   -------------------------------------------------------------------------- */

/** كلمات مابتصلحش تبقى اسم مادة لو جت بعد «امتحان». */
const SUBJECT_STOPWORDS = [
  "بعد", "كمان", "في", "فى", "يوم", "يومين", "ايام", "أيام", "الاسبوع", "الأسبوع",
  "بكرة", "بكره", "النهاردة", "النهارده", "غدا", "الجاي", "القادم", "قريب",
  "جاي", "عندي", "عندى", "ليا", "معايا", "هيكون", "هو", "دلوقتي", "خلال",
  "الخميس", "الجمعة", "الجمعه", "السبت", "الاحد", "الأحد", "الاتنين", "الإتنين",
  "التلات", "الثلاثاء", "الاربع", "الأربع", "الاربعاء", "الأربعاء", "شهر",
];

/**
 * بيحاول يطلّع اسم المادة من الجملة.
 * بيرجّع النص الأصلي (مش المنعّم) عشان يتعرض للمستخدم بشكله الصح.
 */
export function extractSubject(raw: string): string | null {
  const text = raw.slice(0, 500);

  // «امتحان الرياضيات» / «اختبار OOP» — الكلمة اللي بعد كلمة الامتحان
  const afterExam = text.match(
    /(?:امتحان|إمتحان|اختبار|كويز|quiz|exam|test|ميدتيرم|فاينال)\s+([^\s،.؟!]+(?:\s+[^\s،.؟!]+)?)/i
  );
  if (afterExam) {
    const cleaned = cleanSubject(afterExam[1]);
    if (cleaned) return cleaned;
  }

  // «امتحان بعد ٣ أيام في الفيزياء» — بعد «في»
  const afterIn = text.match(/\s(?:في|فى|بمادة|مادة)\s+([^\s،.؟!]+(?:\s+[^\s،.؟!]+)?)/i);
  if (afterIn) {
    const cleaned = cleanSubject(afterIn[1]);
    if (cleaned) return cleaned;
  }

  return null;
}

/** بيشيل الكلمات الوظيفية من بداية الشظية ويتأكد إن اللي فضل اسم فعلي. */
function cleanSubject(fragment: string): string | null {
  const words = fragment
    .trim()
    .split(/\s+/)
    .filter((w) => {
      const l = loosen(normalizeDigits(w));
      if (!l) return false;
      if (/^\d+$/.test(l)) return false; // رقم لوحده مش مادة
      return !SUBJECT_STOPWORDS.some((s) => l === loosen(s));
    });

  if (words.length === 0) return null;
  const joined = words.join(" ").trim();
  // حرف واحد أو حرفين مش اسم مادة (غالباً بقايا حرف جر)
  if (joined.length < 2) return null;
  return joined;
}

/* --------------------------------------------------------------------------
   ٦) شكل الخطة

   عدد الأيام بيحدد الشكل. القاعدة اللي المستخدم طلبها بالحرف:
     آخر يوم = Quiz شامل، واللي قبله = مراجعة، والباقي محتوى.

   بنحسب ده هنا **قبل** ما نكلم الموديل، وبنبعتله الشكل جاهز — عشان
   مايرتّبش الأيام بمزاجه ويحصل إن المراجعة تيجي في النص.
   -------------------------------------------------------------------------- */

export type DayKind = "content" | "review" | "quiz";

/**
 * بيرجّع نوع كل يوم في الخطة.
 *
 * @param totalDays عدد أيام الخطة (١ = الامتحان بكرة، فيوم واحد بس).
 */
export function planShape(totalDays: number): DayKind[] {
  const n = Math.max(1, Math.min(MAX_EXAM_DAYS, Math.floor(totalDays)));

  // يوم واحد: مفيش رفاهية تقسيم — مراجعة سريعة وكويز في نفس اليوم
  if (n === 1) return ["quiz"];
  // يومين: محتوى + كويز
  if (n === 2) return ["content", "quiz"];
  // ٣ وأكتر: آخر يوم كويز، اللي قبله مراجعة، والباقي محتوى
  const shape: DayKind[] = Array(n).fill("content");
  shape[n - 1] = "quiz";
  shape[n - 2] = "review";

  // الخطط الطويلة (٨ أيام وأكتر) محتاجة مراجعة في النص كمان، وإلا أول
  // يومين بيتنسوا خلاص قبل الامتحان
  if (n >= 8) shape[Math.floor((n - 2) / 2)] = "review";

  return shape;
}

/** اسم عربي لكل نوع — بيتعرض في الكارت وبيتبعت للموديل. */
export const DAY_KIND_LABEL: Record<DayKind, string> = {
  content: "محتوى جديد",
  review: "مراجعة",
  quiz: "اختبار شامل",
};
