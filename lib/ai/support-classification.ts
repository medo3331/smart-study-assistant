// ============================================================================
// MAGICLY — Support Classification (Phase 1)
// ============================================================================
// تصنيف مشكلة الطالب إلى فئات منظمة وموثقة بالثقة والخطورة.
// لا ينتج تشخيصًا مؤكدًا عندما تكون البيانات غير كافية.
//
// التصميم:
//   - `classifyIssue` يأخذ رسالة خام + أي سياق متاح ويُرجع مصفوفة مصنّفة.
//   - النموذج المُستدعى (في المرحلة 2) يُرجع JSON صارم يمكن التحقق منه.
//   - في هذه المرحلة لا يوجد اتصال فعلي بالنموذج: مُنظّم مكتوب بالكود
//     يحاكي مسار التصنيف، مع كود قابل للتوسيع عند الاتصال بمزود AI.
// ============================================================================

import type {
  SupportClassification,
  SupportSubCategory,
  SupportDiagnosticQuestion,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// قاموس التصنيفات الأولي (Phase 1)
// ─────────────────────────────────────────────────────────────────────────────

export const SUPPORT_CATEGORIES = {
  account: {
    labelAr: "الحساب",
    subCategories: {
      login: "مشاكل تسجيل الدخول",
      password: "نسيان كلمة المرور",
      verification: "مشاكل التحقق",
      profile: "مشاكل الملف الشخصي",
    },
    confidenceDefaults: {
      login: 0.8,
      password: 0.7,
      verification: 0.7,
      profile: 0.6,
    },
  },
  subscriptions: {
    labelAr: "الاشتراكات",
    subCategories: {
      activation: "تفعيل الاشتراك",
      expiration: "انتهاء الاشتراك",
      statusMismatch: "تشوّش حالة الاشتراك",
    },
    confidenceDefaults: {
      activation: 0.8,
      expiration: 0.7,
      statusMismatch: 0.6,
    },
  },
  credits: {
    labelAr: "كريدت Magic",
    subCategories: {
      missingPurchased: "كريدت مشتري لم يصل",
      incorrectDeduction: "خصم غير صحيح",
      aiOperationFailed: "فشل عملية AI",
    },
    confidenceDefaults: {
      missingPurchased: 0.75,
      incorrectDeduction: 0.7,
      aiOperationFailed: 0.6,
    },
  },
  coins: {
    labelAr: "مكافآت",
    subCategories: {
      lessonRewards: "مكافآت الدروس",
      adRewards: "مكافآت الإعلانات",
      storeTransactions: "معاملات المتجر",
    },
    confidenceDefaults: {
      lessonRewards: 0.7,
      adRewards: 0.65,
      storeTransactions: 0.7,
    },
  },
  lessons: {
    labelAr: "الدروس والمحتوى",
    subCategories: {
      lessonAccess: "وصول الدرس",
      videoProblems: "مشاكل الفيديو",
      quizProblems: "مشاكل الاختبار",
      contentLoading: "تحميل المحتوى",
    },
    confidenceDefaults: {
      lessonAccess: 0.75,
      videoProblems: 0.8,
      quizProblems: 0.7,
      contentLoading: 0.7,
    },
  },
  aiTools: {
    labelAr: "أدوات AI",
    subCategories: {
      generationFailure: "فشل التوليد",
      unexpectedErrors: "أخطاء غير متوقعة",
      usageIssues: "مشاكل في استخدام AI",
    },
    confidenceDefaults: {
      generationFailure: 0.7,
      unexpectedErrors: 0.6,
      usageIssues: 0.7,
    },
  },
  files: {
    labelAr: "الملفات",
    subCategories: {
      uploadFailure: "فشل الرفع",
      pdfProcessing: "معالجة PDF",
      fileAccess: "وصول الملف",
    },
    confidenceDefaults: {
      uploadFailure: 0.75,
      pdfProcessing: 0.75,
      fileAccess: 0.7,
    },
  },
  community: {
    labelAr: "المجتمع والمراسلة",
    subCategories: {
      messageDelivery: "وصول الرسالة",
      messageRequests: "طلبات المراسلة",
      blocking: "حظر",
      conversationAccess: "وصول المحادثة",
    },
    confidenceDefaults: {
      messageDelivery: 0.7,
      messageRequests: 0.75,
      blocking: 0.6,
      conversationAccess: 0.65,
    },
  },
  technical: {
    labelAr: "مشاكل تقنية",
    subCategories: {
      performance: "بطء",
      brokenPages: "صفحات لا تعمل",
      general: "أخطاء عامة",
    },
    confidenceDefaults: {
      performance: 0.65,
      brokenPages: 0.7,
      general: 0.6,
    },
  },
  complaints: {
    labelAr: "شكاوى واقتراحات",
    subCategories: {
      ux: "تجربة المستخدم",
      featureRequests: "اقتراحات التطوير",
      generalComplaints: "شكاوى عامة",
    },
    confidenceDefaults: {
      ux: 0.6,
      featureRequests: 0.6,
      generalComplaints: 0.5,
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// فهرس كلمات مفتاحية → تصنيفات (بتوافق مع الأعراض الشائعة لطلاب المرحلة 1)
// ─────────────────────────────────────────────────────────────────────────────

const KEYWORD_MAP: Array<{
  category: keyof typeof SUPPORT_CATEGORIES;
  subcategory: SupportSubCategory;
  keywords: string[];
  defaultConfidence: number;
}> = [
  // Credits
  { category: "credits", subcategory: "missingPurchased", keywords: [
    "كريدت", "credits", "رصيد", "ما وصل", "تخصم", "خصم",
  ], defaultConfidence: 0.75 },
  // Lesson rewards / coins
  { category: "coins", subcategory: "lessonRewards", keywords: [
    "مكافأة", "reward", "عملة", "coin", "درس", "مكافآت الدروس",
  ], defaultConfidence: 0.7 },
  // Login
  { category: "account", subcategory: "login", keywords: [
    "تسجيل الدخول", "login", "دخول", "دخول إلى", "أدخل", "لا أستطيع", "ما أستطيع", "حسابي",
  ], defaultConfidence: 0.8 },
  // Subscriptions
  { category: "subscriptions", subcategory: "statusMismatch", keywords: [
    "بemann", "Pro", "Ultra", "اشتراك", "اشتراك مبطّل",
  ], defaultConfidence: 0.6 },
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. تصنيف بسيط قائم على القاموس (بدون ذكاء) — خلفية لمرحلة 2
// ─────────────────────────────────────────────────────────────────────────────

/**
 * تصنيف أولي قائم على تعابير منتشرة. يُرجع أفضل التطابق فحسب،
 * مع كود ثقة وراثبة — إذا كان المنهج أقل من عتبة، لا نعلن تأكيداً.
 */
export function classifyByDictionary(
  text: string,
  options: { strict?: boolean } = {}
): SupportClassification {
  const lower = text.toLowerCase();
  let best: {
    category: keyof typeof SUPPORT_CATEGORIES;
    subcategory: SupportSubCategory;
    confidence: number;
    matched: string[];
  } | null = null;

  for (const entry of KEYWORD_MAP) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        if (!best || entry.defaultConfidence > best.confidence) {
          best = {
            category: entry.category,
            subcategory: entry.subcategory,
            confidence: entry.defaultConfidence,
            matched: [kw],
          };
        } else if (entry.defaultConfidence === best.confidence) {
          best.matched.push(kw);
        }
        break; // نأخذ أول توافق في الكاتيجوري، لكن نقلق عن الترتيب
      }
    }
  }

  if (!best) {
    // تصنيف عام للرسائل غير المطابقة — مجرد توقع
    return {
      category: "complaints",
      subcategory: "generalComplaints",
      shortProblemSummary: "رسالة دعم عامة غير مصنفة",
      confidenceScore: 0.3,
      severity: "low",
      missingInformation: ["التفاصيل المحددة للمشكلة", "البيانات المطلوبة"],
      recommendedNextStep: "سؤال توضيحي بسيط أو تحويل للموظف",
      suggestedKnowledgeArticleIds: [],
      requiresHuman: false,
      escalationReason: "صنف عام بخطورة منخفضة",
    };
  }

  const confidence =
    options.strict !== false ? Math.min(best.confidence, 0.95) : best.confidence;

  return {
    category: best.category,
    subcategory: best.subcategory,
    shortProblemSummary: `مشكلة ${best.subcategory} تصريفيًا`,
    confidenceScore: confidence,
    severity: mapConfidenceToSeverity(confidence),
    missingInformation: confidence < 0.5
      ? ["تفاصيل إضافية عن الأعراض", "ما حاولت حتى الآن"]
      : [],
    recommendedNextStep: confidence < 0.5
      ? "طلب توضيحي بسيط ثم إعادة التصنيف"
      : "حلّ مصدري أو خطة إرشادية",
    suggestedKnowledgeArticleIds: [],
    requiresHuman: confidence < 0.5,
    escalationReason: confidence < 0.5
      ? "انخفاض الثقة — غير مؤكد"
      : "مطابق للجميع",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. التصنيف البنية (القدرة المطلوبة في النهاية، مع إخراج صارم)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * دالة تصنيف تجريبية تخرج شكل `SupportClassification` (مع ذلك،
 * في Phase 1 لا توجد مكالمة فعليّة للنموذج). سيعمل هذا الملف كدليل
 * واجهة لتطوير classifyIssue في المرحلة 2.
 */
export function classifyIssue(
  text: string,
  context?: {
    /** معرف التذكرة لوضع سياق سريع */
    ticketId?: string;
    /** لغة الرسالة (ar | en) */
    language?: "ar" | "en";
  }
): SupportClassification {
  // في Phase 1، نستخدم القاموس البسيط كخلفية وسيطة.
  // المرحلة 2 ستستبدل هذا بدعوة نموذج حقيقية، مع التأكد من حصولها.
  const base = classifyByDictionary(text);

  // إذا كانت السائقة خاضعة أو مستلمة، لا تتوهج القيم.
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. التحقق من شكل الإخراج (schema validation)
// ─────────────────────────────────────────────────────────────────────────────

export function validateClassification(
  classification: unknown
): classification is SupportClassification {
  if (typeof classification !== "object" || classification === null) {
    return false;
  }

  const c = classification as Record<string, unknown>;

  const requiredStringFields = [
    "category", "subcategory", "shortProblemSummary",
    "recommendedNextStep", "escalationReason",
  ];
  const requiredNumberFields = ["confidenceScore"];
  const requiredArrayFields = ["missingInformation", "suggestedKnowledgeArticleIds"];

  // سلسلة مطلوبة
  for (const field of requiredStringFields) {
    if (typeof c[field] !== "string") return false;
  }
  // رقم مطلوب
  if (typeof c["confidenceScore"] !== "number") return false;
  if (!Number.isFinite(c["confidenceScore"] as number)) return false;
  // مصفوفة مطلوبة
  for (const field of requiredArrayFields) {
    if (!Array.isArray(c[field])) return false;
  }
  // الحقول الإضافية الخاصة
  if (typeof c["severity"] !== "string") return false;
  if (typeof c["requiresHuman"] !== "boolean") return false;
  if (typeof c["category"] !== "string") return false;
  if (typeof c["subcategory"] !== "string") return false;

  // التحقق من أن الفئة موجودة
  if (!SUPPORT_CATEGORIES[c.category as keyof typeof SUPPORT_CATEGORIES]) {
    return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. مساعدة
// ─────────────────────────────────────────────────────────────────────────────

function mapConfidenceToSeverity(confidence: number): "low" | "medium" | "high" {
  if (confidence >= 0.75) return "low";
  if (confidence >= 0.5) return "medium";
  return "high";
}

/**
 * بناءً على مستوى الفئة والمحتوى، نسأل أسئلة تشخيصية منظمة.
 * تُرجع مصفوفة بيضوية يمكن عرضها في واجهة الطالب.
 */
export function suggestDiagnosticQuestions(
  classification: SupportClassification,
  originalMessage: string
): SupportDiagnosticQuestion[] {
  const base: SupportDiagnosticQuestion[] = [
    {
      key: "what_happened",
      label: "ماذا حدث؟",
      question: "صف المشكلة بالكلمات الخاصة بك (ما رأيت، ما دخلت بالخطأ).",
      options: [
        "رسالة لا تصل إلى الطالب",
        "رصيد or credits لم يصل",
        "ارتباط يخص الدرس أو الفيديو لا يعمل",
        "مشكلة تسجيل الدخول",
        "خطأ تقني عام",
        "سؤال عام أو اقتراح",
        "غير ذلك",
      ],
      required: false,
    },
    {
      key: "what_have_you_tried",
      label: "ماذا جرّبت؟",
      question: "ماذا جرّبت حتى الآن لمعالجة هذه المشكلة؟",
      options: [
        "تم التسجيل",
        "إعادة تحميل الصفحة",
        "الاتصال بفريق الدعم",
        "إعادة تشغيل الجهاز",
        "لم أحاول شيئًا",
        "شoptimized: جربت أشياء أخرى",
      ],
      required: false,
    },
  ];

  return base;
}
