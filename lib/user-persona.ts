// 👤 محورين: الشخصية (ليه بيتعلم) والمجال (إيه العالم اللي بيتعلم فيه).
//
// ده الملف الوحيد اللي بيعرف إيه اللي يتغير بالمحورين. قبل كده كان
// getUiText مكرر ٣ مرات (theme-helpers.ts و dashboard/page.tsx و
// assessment/page.tsx بنسخة getStepPrefix). التكرار ده اتوحّد هنا.
//
// ⚠️ قاعدة صيانة: تأثير المحورين بيتوقف عند تلات حاجات بس —
//    ١. النصوص (UiText) — من الشخصية
//    ٢. سطور بتتحقن في برومبت الـ AI — من الشخصية والمستوى والمجال
//    ٣. ليستة الموارد والاقتراحات — من المجال (× الشخصية للاقتراحات)
// ممنوع مسارات كود منفصلة لكل شخصية أو مجال، وإلا كل باج هنصلحه ١٨ مرة.

import type {
  CategoryType,
  Persona,
  StudentLevel,
  UiText,
} from "@/app/dashboard/components/types";
import type { Dictionary } from "@/lib/i18n/dictionaries";

// isolatedModules مفعّل، فإعادة تصدير الأنواع لازم تكون export type
export type { CategoryType, Persona, StudentLevel, UiText };

// ---------------------------------------------------------------------------
// ١. بيانات العرض: أسماء وأوصاف الشخصيات والمستويات
// ---------------------------------------------------------------------------

export interface PersonaMeta {
  id: Persona;
  emoji: string;
  /** مفتاح الترجمة في قاموس الـ i18n — النص نفسه مش هنا.
   *  النوع `keyof Dictionary` معناه إن أي مفتاح ناقص من القاموس = خطأ في tsc
   *  مش نص فاضي في الواجهة. */
  labelKey: keyof Dictionary;
  descKey: keyof Dictionary;
}

export const PERSONAS: PersonaMeta[] = [
  { id: "student", emoji: "🎓", labelKey: "personaStudent", descKey: "personaStudentDesc" },
  { id: "grad", emoji: "💼", labelKey: "personaGrad", descKey: "personaGradDesc" },
  { id: "freelancer", emoji: "🧑‍💻", labelKey: "personaFreelancer", descKey: "personaFreelancerDesc" },
];

export interface StudentLevelMeta {
  id: StudentLevel;
  labelKey: keyof Dictionary;
}

// المستوى بيظهر للـ persona = "student" بس
export const STUDENT_LEVELS: StudentLevelMeta[] = [
  { id: "prep", labelKey: "levelPrep" },
  { id: "high", labelKey: "levelHigh" },
  { id: "uni", labelKey: "levelUni" },
  { id: "masters", labelKey: "levelMasters" },
];

export const DEFAULT_PERSONA: Persona = "student";

// ---------------------------------------------------------------------------
// ١-ب. المجال والتراك: المحور التاني — إيه اللي بتتعلمه
//
// ⚠️ دول محورين مش واحد:
//   - المجال (field): برمجة، طب، لغات... — بيحدّد عالم المستخدم
//   - التراك (subject): الحاجة المحددة جوه المجال، وبتتخزن في profiles.subject
//
// والاقتراحات بتتحدّد بـ **المجال × الشخصية** مع بعض. ده مقصود: خريج طب
// محتاج «حالات إكلينيكية» وطالب طب محتاج «تشريح» — نفس المجال، احتياج مختلف.
// قبل كده كانت ليستة واحدة ثابتة (٦ تراكات برمجة) مش بتتغير بأي اختيار،
// فالخريج كان بيشوف نفس اللي الطالب بيشوفه بالظبط.
//
// الليستة بتقترح مش بتحصر — الحقل الحر جنبها لسه شغّال، فأي حد مجاله
// مش في الستة يكتب اللي هو عايزه ومحدش بيقف قصاده.
// ---------------------------------------------------------------------------

export type FieldId =
  | "programming"
  | "medical"
  | "languages"
  | "business"
  | "school"
  | "design";

export interface FieldMeta {
  id: FieldId;
  emoji: string;
  labelKey: keyof Dictionary;
  /** سطر بيتحقن في برومبت الـ AI يوصّف عالم المستخدم */
  promptLine: string;
  /** الاقتراحات مضروبة في الشخصية — التراك نص حر بيروح لـ profiles.subject */
  tracks: Record<Persona, string[]>;
  /** موارد المجال — مواقع حقيقية معروفة، مش لينكات مولّدة */
  resources: PersonaResource[];
}

export const FIELDS: FieldMeta[] = [
  {
    id: "programming",
    emoji: "💻",
    labelKey: "fieldProgramming",
    promptLine: "مجاله البرمجة والتكنولوجيا، فاستخدم أمثلة كود واقعية.",
    tracks: {
      student: ["أساسيات البرمجة", "Python", "JavaScript", "HTML و CSS", "هياكل البيانات", "قواعد البيانات"],
      grad: ["مقابلات تقنية", "الخوارزميات", "React", "مشروع تخرج", "Git و GitHub", "بناء بورتفوليو"],
      freelancer: ["React", "Next.js", "WordPress", "التعامل مع APIs", "تسليم مشروع لعميل", "تسعير الشغل"],
    },
    resources: [
      { label: "توثيق MDN", url: "https://developer.mozilla.org", emoji: "📘" },
      { label: "freeCodeCamp", url: "https://www.freecodecamp.org", emoji: "🎯" },
      { label: "Roadmap.sh", url: "https://roadmap.sh", emoji: "🗺️" },
    ],
  },
  {
    id: "medical",
    emoji: "🩺",
    labelKey: "fieldMedical",
    promptLine: "مجاله طبي، فاستخدم المصطلح اللاتيني جنب العربي واربط بالحالات.",
    tracks: {
      student: ["تشريح", "فسيولوجي", "فارماكولوجي", "باثولوجي", "كيمياء حيوية", "ميكروبيولوجي"],
      grad: ["حالات إكلينيكية", "امتحانات الزمالة", "USMLE", "مقابلات النيابة", "قراءة الأشعة", "البحث العلمي"],
      freelancer: ["المحتوى الطبي", "الترجمة الطبية", "التغذية العلاجية", "التوعية الصحية", "مراجعة الأدبيات", "استشارات أونلاين"],
    },
    resources: [
      { label: "PubMed", url: "https://pubmed.ncbi.nlm.nih.gov", emoji: "🔬" },
      { label: "Osmosis", url: "https://www.osmosis.org", emoji: "🧠" },
      { label: "Khan Academy", url: "https://www.khanacademy.org", emoji: "📗" },
    ],
  },
  {
    id: "languages",
    emoji: "🗣️",
    labelKey: "fieldLanguages",
    promptLine: "مجاله تعلّم لغة، فركّز على الاستخدام والنطق مش القواعد المجردة.",
    tracks: {
      student: ["إنجليزي من الصفر", "قواعد اللغة", "الكلمات الشائعة", "الاستماع", "النطق", "القراءة"],
      grad: ["IELTS", "TOEFL", "إنجليزي المقابلات", "كتابة الـ CV", "المراسلات الرسمية", "العرض والتقديم"],
      freelancer: ["الترجمة", "كتابة المحتوى", "إنجليزي التعامل مع العملاء", "التفريغ الصوتي", "التدقيق اللغوي", "لغة تانية"],
    },
    resources: [
      { label: "Duolingo", url: "https://www.duolingo.com", emoji: "🦉" },
      { label: "BBC Learning English", url: "https://www.bbc.co.uk/learningenglish", emoji: "🎧" },
      { label: "Anki", url: "https://apps.ankiweb.net", emoji: "🃏" },
    ],
  },
  {
    id: "business",
    emoji: "📈",
    labelKey: "fieldBusiness",
    promptLine: "مجاله إدارة وأعمال، فاربط كل مفهوم بقرار أو رقم في شركة حقيقية.",
    tracks: {
      student: ["مبادئ الإدارة", "المحاسبة", "الاقتصاد", "التسويق", "الإحصاء", "دراسة الجدوى"],
      grad: ["Excel المتقدم", "تحليل البيانات", "مقابلات الشركات", "إدارة المشاريع", "Power BI", "بناء الـ CV"],
      freelancer: ["التسويق الرقمي", "إعلانات السوشيال", "السيو", "إدارة العملاء", "كتابة الإعلانات", "التسعير والعروض"],
    },
    resources: [
      { label: "Coursera", url: "https://www.coursera.org", emoji: "🎓" },
      { label: "Harvard Business Review", url: "https://hbr.org", emoji: "📊" },
      { label: "Khan Academy", url: "https://www.khanacademy.org", emoji: "📗" },
    ],
  },
  {
    id: "school",
    emoji: "📚",
    labelKey: "fieldSchool",
    promptLine: "مجاله منهج دراسي، فاربط الشرح بالكتاب وأسئلة الامتحانات.",
    tracks: {
      student: ["رياضيات", "فيزياء", "كيمياء", "أحياء", "لغة عربية", "تاريخ وجغرافيا"],
      grad: ["اختبارات القدرات", "مهارات الجامعة", "مراجعة نهائية", "مهارات البحث", "اللغة الأكاديمية", "تنسيق الجامعات"],
      freelancer: ["الدروس الخصوصية", "شرح أونلاين", "إعداد المذكرات", "المحتوى التعليمي", "التصحيح", "إدارة مجموعات"],
    },
    resources: [
      { label: "Khan Academy", url: "https://www.khanacademy.org", emoji: "📗" },
      { label: "ويكيبيديا", url: "https://ar.wikipedia.org", emoji: "🌐" },
      { label: "Quizlet", url: "https://quizlet.com", emoji: "🃏" },
    ],
  },
  {
    id: "design",
    emoji: "🎨",
    labelKey: "fieldDesign",
    promptLine: "مجاله تصميم، فاشرح بالبصر: قبل وبعد، ومثال يتشاف مش يتوصف.",
    tracks: {
      student: ["أساسيات التصميم", "نظرية الألوان", "Photoshop", "Illustrator", "التايبوجرافي", "Figma"],
      grad: ["بناء بورتفوليو", "UI/UX", "دراسات حالة", "مقابلات التصميم", "Design System", "البروتوتايب"],
      freelancer: ["هوية بصرية", "تصميم سوشيال ميديا", "تسعير التصميم", "Motion Graphics", "التعامل مع التعديلات", "تسليم الملفات"],
    },
    resources: [
      { label: "Figma", url: "https://www.figma.com", emoji: "🎛️" },
      { label: "Behance", url: "https://www.behance.net", emoji: "🖼️" },
      { label: "Dribbble", url: "https://dribbble.com", emoji: "🏀" },
    ],
  },
];

export const DEFAULT_FIELD: FieldId = "programming";

export function isField(value: unknown): value is FieldId {
  return FIELDS.some((f) => f.id === value);
}

export function getField(field?: FieldId | null): FieldMeta {
  return FIELDS.find((f) => f.id === field) ?? FIELDS[0];
}

/** الاقتراحات = المجال × الشخصية. ده قلب الإصلاح: قبل كده كانت ثابتة. */
export function getTracks(field?: FieldId | null, persona?: Persona): string[] {
  return getField(field).tracks[persona ?? DEFAULT_PERSONA];
}

export function isPersona(value: unknown): value is Persona {
  return value === "student" || value === "grad" || value === "freelancer";
}

export function isStudentLevel(value: unknown): value is StudentLevel {
  return value === "prep" || value === "high" || value === "uni" || value === "masters";
}

// ---------------------------------------------------------------------------
// ٢. النصوص الديناميكية (UiText)
//
// محورين بيأثروا على النصوص:
//   - الشخصية (persona): وحدة التقدم واسم النقاط ونبرة الزراير
//   - المجال (category): موروث من النسخة القديمة، لسه بيستخدمه المستخدمين الحاليين
// الشخصية أقوى: لو فيها نص، بتكسب. لو مفيش، نرجع لنص المجال.
// ---------------------------------------------------------------------------

const CATEGORY_TEXT: Record<"work" | "skill" | "self" | "academic", UiText> = {
  work: {
    sectionTitle: "مراحل التنفيذ",
    stepPrefix: "المرحلة",
    emergencyBtn: "وضع التسليم السريع",
    xpTitle: "نقاط الإنتاجية",
    aiDiscussBtn: "استشارة ماجيك",
    taskDescPrefix: "مهمة تنفيذية وخطة عمل لـ",
  },
  skill: {
    sectionTitle: "خطوات الإتقان",
    stepPrefix: "الخطوة",
    emergencyBtn: "وضع المعسكر المكثف",
    xpTitle: "نقاط الإتقان",
    aiDiscussBtn: "اسأل ماجيك",
    taskDescPrefix: "تطبيق عملي وتمرين لـ",
  },
  self: {
    sectionTitle: "برنامج التطوير",
    stepPrefix: "هدف اليوم",
    emergencyBtn: "وضع التحدي الأقصى",
    xpTitle: "نقاط الالتزام",
    aiDiscussBtn: "اسأل ماجيك",
    taskDescPrefix: "عادة وتطوير شخصي لـ",
  },
  academic: {
    sectionTitle: "خطة المذاكرة",
    stepPrefix: "الدرس",
    emergencyBtn: "وضع ما قبل الامتحان",
    xpTitle: "نقاط المذاكرة",
    aiDiscussBtn: "اسأل ماجيك",
    taskDescPrefix: "شرح وتطبيقات عملية شاملة لـ",
  },
};

function categoryKey(category?: CategoryType): keyof typeof CATEGORY_TEXT {
  switch (category) {
    case "عمل ومشاريع":
      return "work";
    case "تعلم مهارة":
      return "skill";
    case "تطوير شخصي":
      return "self";
    default:
      return "academic";
  }
}

// الطالب بياخد نصوص المجال زي ما هي (ده كان الديفولت الأصلي)،
// فمفيش override ليه — عشان كده student مش موجود في الماب دي.
const PERSONA_TEXT: Partial<Record<Persona, UiText>> = {
  grad: {
    sectionTitle: "مسار الاستعداد",
    stepPrefix: "المشروع",
    emergencyBtn: "وضع ما قبل المقابلة",
    xpTitle: "جاهزية المقابلة",
    aiDiscussBtn: "تدرّب مع ماجيك",
    taskDescPrefix: "قطعة بورتفوليو وأسئلة مقابلات في",
  },
  freelancer: {
    sectionTitle: "تاسكات الشغل",
    stepPrefix: "التاسك",
    emergencyBtn: "وضع التسليم قبل الديدلاين",
    xpTitle: "نقاط التسليم",
    aiDiscussBtn: "راجع مع ماجيك",
    taskDescPrefix: "حاجة تنفع تتسلّم للعميل في",
  },
};

/** النصوص الموحّدة. الشخصية أولاً، وبعدين المجال. */
export function getUiText(category?: CategoryType, persona?: Persona): UiText {
  return PERSONA_TEXT[persona ?? DEFAULT_PERSONA] ?? CATEGORY_TEXT[categoryKey(category)];
}

/** بادئة الخطوة لوحدها — بتستخدمها assessment و generateDays. */
export function getStepPrefix(category?: CategoryType, persona?: Persona): string {
  return getUiText(category, persona).stepPrefix;
}

// ---------------------------------------------------------------------------
// ٣. نبرة الـ AI: سطر واحد بيتحقن في البرومبت. مش أكتر.
//
// ⚠️ النبرة دي عن **ليه** بيتعلم مش **إيه** اللي بيتعلمه، فلازم تفضل
// محايدة للمجال. سطر المجال بيتضاف جنبها من FIELDS[].promptLine.
// ---------------------------------------------------------------------------

const PERSONA_PROMPT: Record<Persona, string> = {
  student:
    "المستخدم طالب بيذاكر. اشرح زي معلّم: فكّك المفهوم من الأول، استخدم أمثلة بسيطة، وركّز إنه يفهم قبل إنه يحفظ.",
  grad:
    "المستخدم خريج بيستعد لسوق الشغل. اتكلم زي مدرّب: اربط كل حاجة بسؤال مقابلة أو حاجة تتحط في الـ CV، وقول له الغلطات اللي بتضيّع الترشيح.",
  freelancer:
    "المستخدم شغال فري لانس وعنده شغلانة لعميل. اتكلم زي زميل خبير: حل عملي وسريع، أقصر طريق يخلص صح، وحذّره من اللي بيكسر التسليم.",
};

/** سطر النبرة اللي بيتحقن في برومبت الـ AI. */
export function getPersonaPromptLine(persona?: Persona): string {
  return PERSONA_PROMPT[persona ?? DEFAULT_PERSONA];
}

/** سياق المستوى — بيضيف سطر للطالب بس، لأن إعدادي مش زي ماستر. */
const LEVEL_PROMPT: Record<StudentLevel, string> = {
  prep: "مستواه إعدادي، فخلي اللغة سهلة جداً ومتفترضش خلفية رياضيات متقدمة.",
  high: "مستواه ثانوي، فاربط الشرح بالمنهج والامتحانات.",
  uni: "مستواه جامعي، فينفع تستخدم مصطلحات أكاديمية وتشير للتوثيق الرسمي.",
  masters: "مستواه ماستر أو دراسات عليا، فادخل في العمق والتفاصيل النظرية والأوراق البحثية.",
};

export function getLevelPromptLine(level?: StudentLevel | null): string {
  return level ? LEVEL_PROMPT[level] : "";
}

/** البرومبت الكامل لسياق المستخدم — نبرة الشخصية + المستوى + عالم المجال.
 *  الترتيب مقصود: مين هو، بعدين مستواه، بعدين مجاله. */
export function buildPersonaContext(
  persona?: Persona,
  level?: StudentLevel | null,
  field?: FieldId | null,
): string {
  const lines = [getPersonaPromptLine(persona)];
  if (persona === "student" || persona === undefined) {
    const levelLine = getLevelPromptLine(level);
    if (levelLine) lines.push(levelLine);
  }
  if (field) lines.push(getField(field).promptLine);
  return lines.join(" ");
}

// ---------------------------------------------------------------------------
// ٤. الموارد: بتتبع **المجال** مش الشخصية
//
// كانت قبل كده Record<Persona, …> بلينكات برمجة بس (MDN / LeetCode /
// Stack Overflow) — يعني طالب طب كان هياخد توثيق MDN. المجال هو المحور
// الصح هنا: مصادر الطب مصادر الطب، سواء اللي بيقراها طالب أو خريج.
// ---------------------------------------------------------------------------

export interface PersonaResource {
  label: string;
  url: string;
  emoji: string;
}

export function getFieldResources(field?: FieldId | null): PersonaResource[] {
  return getField(field).resources;
}

// ---------------------------------------------------------------------------
// ٥. الاختيار المعلّق (قبل التسجيل)
//
// المستخدم بيختار الشخصية والمستوى والمادة في اللاندينج، وده بيحصل قبل
// ما يكون عنده حساب أصلاً. فمفيش صف في الداتابيز نكتب فيه. localStorage
// هو الجسر: نخزّن هنا، نوديه /login?next=/assessment، وبعد الدخول
// الـ assessment بياخد الاختيار من هنا ومش بيسأل تاني.
// ---------------------------------------------------------------------------

export interface PendingChoice {
  persona: Persona;
  studentLevel: StudentLevel | null;
  field: FieldId;
  subject: string;
}

const PENDING_KEY = "pendingChoice";

/** الاختيار مكتمل؟ الطالب لازم مستوى، والكل لازم مجال وتراك. */
export function isChoiceComplete(choice: Partial<PendingChoice>): boolean {
  if (!choice.persona || !choice.field || !choice.subject?.trim()) return false;
  if (choice.persona === "student" && !choice.studentLevel) return false;
  return true;
}

export function savePendingChoice(choice: PendingChoice): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(choice));
  } catch {
    // الستوريج ممكن يكون مقفول (تصفح خفي) — الاختيار بيتسأل تاني وخلاص
  }
}

/** بيرجع null لو مفيش اختيار أو لو المخزّن باين. الـ guards بتحمي من داتا قديمة. */
export function readPendingChoice(): PendingChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (!isPersona(obj.persona)) return null;
    if (typeof obj.subject !== "string" || !obj.subject.trim()) return null;
    const level = isStudentLevel(obj.studentLevel) ? obj.studentLevel : null;
    if (obj.persona === "student" && !level) return null;
    // اختيار متخزّن من قبل ما محور المجال يتعمل مش هيبقى فيه field. مش سبب
    // نرمي الاختيار كله — الليستة القديمة كانت برمجة بالكامل، فالديفولت صح ليه.
    const field = isField(obj.field) ? obj.field : DEFAULT_FIELD;
    return { persona: obj.persona, studentLevel: level, field, subject: obj.subject };
  } catch {
    return null;
  }
}

export function clearPendingChoice(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // مش مشكلة
  }
}
