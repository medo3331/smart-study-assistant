/**
 * 🧭 مصدر واحد لصفحات لوحة الأدمن — يُستخدم في:
 *   ١. قائمة التنقل (app/admin/layout.tsx)
 *   ٢. "التنقل السريع" في الصفحة الرئيسية (app/admin/page.tsx)
 *   ٣. enforce الصلاحية على مستوى كل صفحة عبر requireAdminPermission()
 *
 * ⚠️ الصلاحية المطلوبة هنا هي **نفس مفاتيح** lib/auth-roles.ts — مفيش نظام
 * صلاحيات موازي. أي صفحة جديدة لازم تتضاف هنا وتستدعي الحارس في السيرفر،
 * وإلا هتفضل مكشوفة لأي أدمن مسجّل.
 */

import type { AdminPermissionKey } from "@/lib/auth-roles";

export interface AdminNavItem {
  /** المسار الفعلي (Link داخلي — ممنوع #anchor كبديل عن صفحة) */
  href: string;
  /** الاسم الظاهر في القائمة */
  label: string;
  /** وصف مختصر للكارت في الصفحة الرئيسية */
  description: string;
  /** الصلاحية اللي لازمها لدخول الصفحة (server-side) */
  permission: AdminPermissionKey;
  /** أيقونة lucide (اسم المكوّن) */
  icon: "Users" | "CreditCard" | "Layers" | "Cpu" | "Gift" | "ScrollText" | "FolderOpen" | "Settings" | "Megaphone" | "LifeBuoy" | "ShieldAlert";
}

export const ADMIN_NAV: AdminNavItem[] = [
  {
    href: "/admin/subscriptions",
    label: "مركز المستخدمين",
    description: "الملف والخطة والدفع والتصنيف والمشاكل والإجراءات من مكان واحد + طلبات دفع الاشتراكات",
    permission: "users.read",
    icon: "Users",
  },
  {
    href: "/admin/subscription-requests",
    label: "طلبات دفع الاشتراكات",
    description: "طلبات الاشتراك بالدفع اليدوي: بيانات المستخدم، تعديل الطلب، محادثة الدعم، قبول/رفض",
    permission: "subscriptions.manage",
    icon: "CreditCard",
  },
  {
    href: "/admin/purchase-requests",
    label: "طلبات شراء الكريدت",
    description: "كل طلبات المتجر: حزم الكريدت والاشتراكات — مراجعة الدفع والقبول/الرفض",
    permission: "subscriptions.manage",
    icon: "CreditCard",
  },
  {
    href: "/admin/users",
    label: "إدارة المستخدمين",
    description: "بحث كل المسجلين بالترقيم + حظر/فك حظر + مراقبة الذكاء الاصطناعي",
    permission: "users.read",
    icon: "Users",
  },
  {
    href: "/admin/plans",
    label: "الخطط والحصص",
    description: "حدود الباقات (Free/Pro/Ultra) وإعدادات الفواتير",
    permission: "plans.manage",
    icon: "Layers",
  },
  {
    href: "/admin/grants",
    label: "منح الكريدت",
    description: "التزامات الكريدت: منح يدوي، فلاتر، وما ينتهي خلال 7 أيام",
    permission: "credits.manage",
    icon: "CreditCard",
  },
  {
    href: "/admin/models",
    label: "نماذج الذكاء الاصطناعي",
    description: "تفعيل/تعطيل النماذج، الأولوية، حدود الاستخدام، حالة المزوّدين",
    permission: "models.manage",
    icon: "Cpu",
  },
  {
    href: "/admin/rewards",
    label: "المكافآت",
    description: "إصدار مكافآت، سجل الفائزين، الأكثر نشاطًا",
    permission: "rewards.manage",
    icon: "Gift",
  },
  {
    href: "/admin/audit-log",
    label: "سجل العمليات",
    description: "كل العمليات الحساسة: المُنفِّذ، الإجراء، المورد، النتيجة",
    permission: "audit.read",
    icon: "ScrollText",
  },
  {
    href: "/admin/files",
    label: "إدارة الملفات",
    description: "عرض/تصنيف/حذف ملفات المستخدمين (Phase 4.7)",
    permission: "files.moderate",
    icon: "FolderOpen",
  },
  {
    href: "/admin/settings",
    label: "الإعدادات",
    description: "إدارة الأدمنز وحالة النظام",
    permission: "admins.manage",
    icon: "Settings",
  },
  {
    href: "/admin/ai-usage",
    label: "استخدام الذكاء الاصطناعي",
    description: "تقرير Shadow لاستخدام AI (ai_usage_events) — قراءة فقط",
    permission: "audit.read",
    icon: "ScrollText",
  },
  {
    href: "/admin/runtime-errors",
    label: "أخطاء Runtime",
    description: "مراقبة أخطاء الإنتاج (قراءة فقط)",
    permission: "audit.read",
    icon: "ScrollText",
  },
  {
    href: "/admin/announcements",
    label: "الإعلانات",
    description: "إنشاء وتعديل وحذف إعلانات المستخدمين (metadata + scheduling)",
    permission: "announcements.manage",
    icon: "Megaphone",
  },
  {
    href: "/admin/testimonials",
    label: "آراء المستخدمين",
    description: "مراجعة تقييمات المنصة والموافقة على نشرها",
    permission: "announcements.manage",
    icon: "ScrollText",
  },
  {
    href: "/admin/announcement-emails",
    label: "إرسال إعلان بالبريد",
    description: "حملات بريد يدوية للإعلانات — اختيار مستلمين، مراجعة، تأكيد",
    permission: "announcements.manage",
    icon: "Megaphone",
  },
  {
    href: "/admin/support",
    label: "الدعم",
    description: "صندوق بريد الدعم والتذاكر",
    permission: "support.manage",
    icon: "LifeBuoy",
  },
  {
    href: "/admin/ai-overview",
    label: "نظرة عامة AI",
    description: "ملخص طلبات AI و entitlements (قراءة فقط)",
    permission: "audit.read",
    icon: "Cpu",
  },
  {
    href: "/admin/ai-costs",
    label: "تكاليف AI",
    description: "CREDIT_COSTS per operation (قراءة فقط)",
    permission: "plans.manage",
    icon: "Cpu",
  },
  {
    href: "/admin/users/analytics",
    label: "تحليلات المستخدمين",
    description: "اسم، إيميل، باقة، وعمليات AI لكل مستخدم",
    permission: "users.read",
    icon: "Users",
  },
  {
    href: "/admin/db-backup",
    label: "نسخة قاعدة البيانات",
    description: "تصدير جداول قاعدة البيانات (JSON) — للمالك فقط",
    permission: "admins.manage",
    icon: "Settings",
  },
  {
    href: "/admin/analytics",
    label: "تحليلات المنصة",
    description: "مؤشرات الاشتراكات والاستخدام ونشاط المستخدمين",
    permission: "users.read",
    icon: "ScrollText",
  },
  {
    href: "/admin/alerts",
    label: "التنبيهات",
    description: "مراقبة أعطال مزوّدي الذكاء الاصطناعي",
    permission: "users.read",
    icon: "ScrollText",
  },
  {
    href: "/admin/ai-telemetry",
    label: "مراقبة AI التقنية",
    description: "تفصيل المحاولات حسب المزوّد والنموذج والحالة",
    permission: "users.read",
    icon: "Cpu",
  },
  {
    href: "/admin/messaging",
    label: "الرسائل والإعلانات",
    description: "إرسال إعلانات أو رسائل للمستخدمين",
    permission: "announcements.manage",
    icon: "Megaphone",
  },
  {
    href: "/admin/payments",
    label: "الدفعات اليدوية",
    description: "تسجيل الدفعات اليدوية وسجلها الكامل",
    permission: "subscriptions.manage",
    icon: "CreditCard",
  },
  {
    href: "/admin/community/moderation",
    label: "إشراف المجتمع",
    description: "تقارير المجتمع والعقوبات والاعتراضات والكلمات الممنوعة وفريق الإشراف",
    permission: "community.moderate",
    icon: "ShieldAlert",
  },
];

/** المسار الرئيسي — متاح لأي أدمن (قراءة فقط) */
export const ADMIN_HOME_PERMISSION: AdminPermissionKey = "users.read";

/**
 * فلترة عناصر التنقل حسب صلاحيات الدور — منطق واحد يستخدمه layout والصفحة
 * الرئيسية. الفحص الفعلي عبر hasPermission الموجودة في auth-roles.ts.
 */
export async function getAllowedNavItems(args: {
  isOwner: boolean;
  permissions: AdminPermissionKey[];
  check: (key: AdminPermissionKey) => Promise<boolean>;
}): Promise<AdminNavItem[]> {
  const results = await Promise.all(
    ADMIN_NAV.map(async (item) => {
      if (args.isOwner || args.permissions.includes(item.permission)) return { item, ok: true };
      return { item, ok: await args.check(item.permission) };
    })
  );
  return results.filter((r) => r.ok).map((r) => r.item);
}

