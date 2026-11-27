// ============================================================================
// MAGICLY — Support Diagnostics (Phase 1)
// ============================================================================
// مساعدة لطرح أسئلة تشخيصية منظمة عند حصول معلومات غير كافية.
// الإجابات تُرسل إلى `classifyIssue` بالمشاركة لرفع الثقة التشخيصيّة.
// ============================================================================

import type { SupportDiagnosticQuestion } from "./types";

// مصفوفة أسئلة تشخيصية أولية
export const DIAGNOSTIC_QUESTIONS: SupportDiagnosticQuestion[] = [
  {
    key: "message_summary",
    label: "ما المشكلة التي تواجهك؟",
    question: "ما المشكلة التي تواجهك؟",
    options: [
      "رسالة لا تصل إلى الطالب",
      "رصيد أو كريدت لم يصل كما اتوقع",
      "ارتباط الدرس أو الفيديو لا يعمل",
      "مشكلة تسجيل الدخول",
      "خطأ تقني عام",
      "سؤال عام أو اقتراح",
      "غير ذلك",
    ],
    required: false,
  },
  {
    key: "what_you_tried",
    label: "ماذا جرّبت حتى الآن؟",
    question: "ماذا جرّبت حتى الآن؟",
    options: [
      "دخول النظام",
      "إعادة تحميل الصفحة",
      "اتصال بفريق الدعم",
      "إعادة تشغيل الجهاز",
      "لم أحاول شيئًا",
      "شoptimized: جربت أشياء أخرى",
    ],
    required: false,
  },
  {
    key: "severity",
    label: "مستوى التأثير على الأنشطة",
    question: "ما مدى تأثير المشكلة على أنشطتك؟",
    options: [
      "لا تؤثر على أي نشاط",
      "تؤثر على نشاط واحد",
      "تؤثر على عدة أنشطة",
      "تمنعني من استخدام المنصة",
    ],
    required: true,
  },
];

// قائمة الإجراءات التشخيصية الأولية (قراءة فقط في مرحلة 1)
export const DIAGNOSTIC_ACTIONS: string[] = [
  "أرسل رسالة دعم جديدة",
  "أفتح تذكرة دعم موجودة",
  "أرسل رسالة إلى الإدارة official",
  "اتصل بالدعم عبر الـ chat",
];

// تجميع معلومات التشخيص المستخرجة من إجابات التشخيصية
export function compileDiagnosticContext(
  originalMessage: string,
  answers: Record<string, string> = {}
): string {
  const parts = [originalMessage];
  for (const [key, value] of Object.entries(answers)) {
    if (value) {
      parts.push(`- ${key}: ${value}`);
    }
  }
  return parts.join("\n");
}
