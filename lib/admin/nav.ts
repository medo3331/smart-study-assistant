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
  icon: "Users" | "CreditCard" | "Layers" | "Cpu" | "Gift" | "ScrollText" | "FolderOpen" | "Settings";
}

export const ADMIN_NAV: AdminNavItem[] = [
  {
    href: "/admin/users",
    label: "المستخدمين",
    description: "بحث، حظر/فك حظر، حالة الذكاء الاصطناعي لكل مستخدم",
    permission: "users.read",
    icon: "Users",
  },
  {
    href: "/admin/subscriptions",
    label: "تفعيل الاشتراكات",
    description: "تفعيل يدوي عبر User Code + حالة الاشتراك الحالية",
    permission: "subscriptions.manage",
    icon: "CreditCard",
  },
  {
    href: "/admin/plans",
    label: "الخطط والحصص",
    description: "حدود الباقات (Free/Pro/Ultra) وإعدادات الفواتير",
    permission: "plans.manage",
    icon: "Layers",
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

