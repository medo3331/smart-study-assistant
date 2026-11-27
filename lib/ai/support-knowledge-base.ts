// ============================================================================
// MAGICLY — Support Knowledge Base (Phase 1)
// ============================================================================
// واجهة للوصول إلى مقالات المعرفة المنشورة.
// قواعد:
//   - تُرجع فقط المقالات بـ `status = 'published'`.
//   - لا تعرض مقالات draft أو archived.
//   - لا تعيد بيانات إدارية أو حساسة (مثلاً: creator معرفات).
//   - البحث عبر مصطلحات (sematic search مستقبلاً).
//   - مقالات draft تظل متاحه فقط للمؤمنين.
// ============================================================================

import type { KnowledgeArticle, KnowledgeSearchQuery, KnowledgeSearchResult } from "./types";

// --- مصفوفة تجريبية --- تودّع المقالات الموجودة والمعتمدة مؤقتاً ---
const KNOWN_ARTICLES: KnowledgeArticle[] = [
  {
    id: "__demo_001__",
    slug: "missing-credits",
    title: "ما وصل رصيدك المُشتري",
    body: "سجّل الدخول، وتحقق من حالة العملية. إذا خرجت من نطاق بعدّ، اتصل بفريق الدعم.",
    category: "credits",
    subcategory: "missingPurchased",
    problemDescription: "الطالب قال أن رصيده لم يصل بعد.",
    symptoms: [
      "لا يظهر الرصيد في الإحصائيات",
      "الإشعار يقول بالعملية ناجحة",
    ],
    searchKeywords: ["credits", "رصيد", "ما وصل", "مدفوع", "رفع"],
    diagnosticQuestions: [
      { key: "transaction_status", label: "حالة المعاملة", question: "حالة المعاملة", options: ["مكتملة", "ملغية", "قيد المعالجة"], required: false },
    ],
    approvedSolution: "قم بفحص حالة المعاملة. في حال تم تفعيلها، يتم تحديث الرصيد تلقائياً في عنق الدعم بفضل النظام.",
    resolutionSteps: [
      "انتقل إلى صفحة رصيدك",
      "تحقق من حالة العملية",
      "اتصل بدعم إذا لم تكن مرئية",
    ],
    allowedActionKey: "read_transaction_status",
    verificationSteps: "تأكد من أن المبلغ المُدفع يطابق المبلغ المتوقع عبر سجل المعاملات.",
    escalationConditions: "إذا لم تُظهر العملية أي حقل، أو استمر الرصيد غير موجود لـ 24 ساعة.",
    sourceType: "admin_provided",
    requiredStaffRole: "support.manage",
    status: "published" as const,
    version: 1,
    createdBy: "admin",
    reviewedBy: null,
    publishedAt: new Date(Date.now() - 10000).toISOString(),
    archivedAt: null,
    sourceNote: "Initial verified article",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "__demo_002__",
    slug: "login-problems",
    title: "صعوبات تسجيل الدخول",
    body: "يمكنك تسجيل الدخول عبر البريد الإلكتروني أو رقم الهوية البروفايل. إذا نسيت كلمة المرور، استخدم زر إعادة التعيين.",
    category: "account",
    subcategory: "login",
    problemDescription: "لا يمكن للمستخدم تسجيل الدخول.",
    symptoms: [
      "زر تسجيل الدخول معطل",
      "خطأ 'Invalid credentials'",
    ],
    searchKeywords: ["login", "دخول", "تسجيل", "كلمة المرور", "password"],
    diagnosticQuestions: [
      { key: "auth_method", label: "طريقة تسجيل الدخول", question: "طريقة تسجيل الدخول", options: ["البريد الإلكتروني", "رقم الهوية", "اختبار دخول"], required: false },
    ],
    approvedSolution: "استخدم زر 'نسيت كلمة المرور'، تحقق من البريد الإلكتروني، وأعد المحاولة.",
    resolutionSteps: [
      "أدخل بريدك الإلكتروني للدخول",
      "اضغط 'نسيت كلمة المرور'",
      "تحقق من صندوق البريد",
    ],
    allowedActionKey: "send_password_reset",
    verificationSteps: "عند تسجيل الدخول، تُسلّم أوامر غير مسموح بها كغير مسموح به.",
    escalationConditions: "إذا لم تعمل خطوة إعادة تعيين كلمة مرور لمدة تزيد عن 24 ساعة.",
    sourceType: "admin_provided",
    requiredStaffRole: "support.manage",
    status: "published" as const,
    version: 1,
    createdBy: "admin",
    reviewedBy: null,
    publishedAt: new Date(Date.now() - 3600000).toISOString(),
    archivedAt: null,
    sourceNote: "Initial verified article",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "__demo_003__",
    slug: "lesson-rewards",
    title: "مكافآت الدروس والعملات",
    body: "تُمنح مكافآت العملات تلقائياً عند إتمام الدرس والاختبار القصير.",
    category: "coins",
    subcategory: "lessonRewards",
    problemDescription: "لم تظهر مكافأة الدرس في رصيد العملات.",
    symptoms: ["عدم احتساب العملات بعد الدرس"],
    searchKeywords: ["coins", "عملات", "مكافأة", "درس", "نقاط"],
    diagnosticQuestions: [
      { key: "lesson_completed", label: "حالة إتمام الدرس", question: "هل ظهرت شاشة اكتمال الدرس؟", options: ["نعم", "لا"], required: false },
    ],
    approvedSolution: "تحقق من إكمال جميع أسئلة المراجعة بالكامل للدرس.",
    resolutionSteps: ["أعد فتح صفحة الدرس", "تأكد من الضغط على زر إنهاء"],
    allowedActionKey: "verify_lesson_completion",
    verificationSteps: "فحص سجل إتمام الدروس في قاعدة البيانات.",
    escalationConditions: "إذا تم إنهاء الدرس ولم تضف العملات بعد ساعة.",
    sourceType: "admin_provided",
    requiredStaffRole: "support.manage",
    status: "published" as const,
    version: 1,
    createdBy: "admin",
    reviewedBy: null,
    publishedAt: new Date(Date.now() - 7200000).toISOString(),
    archivedAt: null,
    sourceNote: "Initial verified article",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "__demo_004__",
    slug: "subscription-status",
    title: "تحديث حالة الاشتراك",
    body: "يتم تفعيل الاشتراك فور تأكيد الدفع عبر بوابة الدفع الإلكتروني.",
    category: "subscriptions",
    subcategory: "statusMismatch",
    problemDescription: "الاشتراك غير مفعّل بعد الدفع.",
    symptoms: ["ظهور الخطة المجانية رغم الدفع"],
    searchKeywords: ["اشتراك", "خطة", "pro", "دفع", "ترقية"],
    diagnosticQuestions: [
      { key: "payment_receipt", label: "إيصال الدفع", question: "هل استلمت إيصال الدفع عبر البريد؟", options: ["نعم", "لا"], required: false },
    ],
    approvedSolution: "سجل الخروج ثم أعد تسجيل الدخول لتحديث جلسة المستخدم.",
    resolutionSteps: ["سجل الخروج", "أعد تسجيل الدخول", "تأكد من الخطة في الملف الشخصي"],
    allowedActionKey: "refresh_subscription_cache",
    verificationSteps: "فحص جدول subscriptions عبر معرف المستخدم.",
    escalationConditions: "إذا مر أكثر من 30 دقيقة على عملية دفع ناجحة ولم تتفعل.",
    sourceType: "admin_provided",
    requiredStaffRole: "support.manage",
    status: "published" as const,
    version: 1,
    createdBy: "admin",
    reviewedBy: null,
    publishedAt: new Date(Date.now() - 10800000).toISOString(),
    archivedAt: null,
    sourceNote: "Initial verified article",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "__demo_005__",
    slug: "video-playback",
    title: "مشاكل تشغيل فيديوهات الدروس",
    body: "إذا تعذر تشغيل الفيديو، تأكد من اتصال الإنترنت أو استخدم المشغل البديل.",
    category: "technical",
    subcategory: "videoProblems",
    problemDescription: "الفيديو لا يفتح أو يتوقف باستمرار.",
    symptoms: ["شاشة سوداء في المشغل", "خطأ في تحميل المصدر"],
    searchKeywords: ["فيديو", "مشغل", "يوتيوب", "تشغيل", "خطأ"],
    diagnosticQuestions: [
      { key: "browser_type", label: "نوع المتصفح", question: "ما هو المتصفح المستخدم؟", options: ["Chrome", "Safari", "Firefox", "تطبيق الهاتف"], required: false },
    ],
    approvedSolution: "امسح ذاكرة التخزين المؤقت للمتصفح وجرب جودة عرض أقل.",
    resolutionSteps: ["تحديث الصفحة", "مسح Cache المتصفح", "التبديل إلى شبكة أخرى"],
    allowedActionKey: null,
    verificationSteps: "تجربة فتح رابط الفيديو مباشرة للتأكد من توفره.",
    escalationConditions: "إذا كان الفيديو محذوفاً من المصدر.",
    sourceType: "admin_provided",
    requiredStaffRole: "support.manage",
    status: "published" as const,
    version: 1,
    createdBy: "admin",
    reviewedBy: null,
    publishedAt: new Date(Date.now() - 14400000).toISOString(),
    archivedAt: null,
    sourceNote: "Initial verified article",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// --- حالة ذاكرة تجريبية لهذه العملية (القاعدة الفعلية على Supabase لاحقاً) ---
const publishedCache = new Map<string, KnowledgeArticle>();

// دمج المقالات التاريخية في ذاكرة التخزين المؤقت
for (const article of KNOWN_ARTICLES) {
  publishedCache.set(article.id, article);
}

export function searchKnowledgeArticles(
  query: KnowledgeSearchQuery
): KnowledgeSearchResult {
  const { terms, category, limit = 5 } = query;

  // تفسير المصطلحات: كلمة واحدة أو قائمة مجمعة
  const termsArray = Array.isArray(terms) ? terms : [terms];

  const matches = new Map<string, KnowledgeArticle>();

  for (const term of termsArray) {
    const lower = term.toLowerCase();

    for (const [id, article] of publishedCache.entries()) {
      // لا نعرض مقالات draft
      if (article.status !== "published") continue;

      // التعرف على الفئة الفرعية
      if (category && article.category !== category) continue;

      // البحث في العنوان والجسم والكلمات المفتاحية
      const haystack = [
        article.title,
        article.body,
        article.problemDescription,
        article.approvedSolution,
        ...(article.searchKeywords || []),
        ...(article.symptoms || []),
      ].join(" ").toLowerCase();

      if (haystack.includes(lower)) {
        matches.set(id, article);
      }
    }
  }

  const results = Array.from(matches.values()).slice(0, limit);

  return {
    results,
    query,
  };
}

/**
 * حالة knowledge مستوفاة من الناحية الشكل.
 */
export interface GetPublishedArticlesResult {
  articles: KnowledgeArticle[];
  hasNext: boolean;
  nextCursor: string | null;
}

/**
 * استرجاع المقالات المنشورة مع اتجاه pagination.
 */
export async function getPublishedArticles(
  cursor?: string,
  limit = 10
): Promise<GetPublishedArticlesResult> {
  const published = Array.from(publishedCache.values())
    .filter((a) => a.status === "published")
    .sort((a, b) => {
      const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return timeB - timeA;
    });

  const start = cursor ? published.findIndex((a) => a.id === cursor) + 1 : 0;
  const page = published.slice(start, start + limit);

  return {
    articles: page,
    hasNext: start + limit < published.length,
    nextCursor: page.length > 0 ? page[page.length - 1].id : null,
  };
}

/**
 * معالجة مقالة draft: مقال AI مُقترح دائماً draft.
 */
export function createDraftArticle(
  input: Omit<
    KnowledgeArticle,
    | "id"
    | "status"
    | "version"
    | "createdAt"
    | "updatedAt"
    | "publishedAt"
    | "reviewedBy"
    | "archivedAt"
    | "searchKeywords"
    | "diagnosticQuestions"
    | "sourceNote"
  > & {
    status?: "draft";
    searchKeywords?: string[];
    diagnosticQuestions?: KnowledgeArticle["diagnosticQuestions"];
    sourceNote?: string;
  }
): KnowledgeArticle {
  const now = new Date().toISOString();
  return {
    ...input,
    id: `draft_${Math.random().toString(36).slice(2, 10)}`,
    slug: input.slug ?? `draft-${Math.random().toString(36).slice(2, 8)}`,
    searchKeywords: input.searchKeywords ?? [],
    diagnosticQuestions: input.diagnosticQuestions ?? [],
    sourceNote: input.sourceNote ?? "",
    status: "draft" as const,
    version: 1,
    createdBy: input.createdBy ?? "ai",
    reviewedBy: null,
    publishedAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
