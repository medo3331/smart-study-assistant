import Link from "next/link";
import { Shield } from "lucide-react";
import { getAdminContext } from "@/lib/admin/auth-check";
import { hasPermission } from "@/lib/auth-roles";
import { ADMIN_NAV, getAllowedNavItems } from "@/lib/admin/nav";
import AdminNav from "@/components/admin/AdminNav";

/**
 * 🛡️ غلاف لوحة الأدمن — بوابة السيرفر الحقيقية لكل /admin/*.
 *
 * ١) لازم مستخدم مسجّل غير زائر.
 * ٢) لازم دور صالح: Owner (env allowlist) أو صف في site_admins (admin/دعم).
 * ٣) الروابط بتتفلتر حسب الصلاحيات، وكل صفحة كمان عندها requireAdminPermission
 *    بتاعتها — يعني الوصول المباشر بالرابط مرفوض server-side.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, role, isOwner, permissions, supabase } = await getAdminContext();

  const allowedItems = await getAllowedNavItems({
    isOwner,
    permissions,
    check: (key) => hasPermission(supabase, user.id, user.email ?? null, key),
  });

  const links = [
    { href: "/admin", label: "الرئيسية" },
    ...allowedItems.map((item) => ({ href: item.href, label: item.label })),
  ];

  const roleLabel = isOwner ? "المالك (Owner)" : role === "admin" ? "أدمن (Admin)" : "غير مصرّح";

  return (
    <div className="min-h-screen bg-[var(--app-bg,#090d16)] text-white dir-rtl">
      <nav className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur border-b border-slate-800 px-4 sm:px-6 py-3 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link href="/admin" className="text-amber-400 font-extrabold text-base sm:text-lg flex items-center gap-2">
            <Shield size={20} /> لوحة الأدمن
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-[10px] sm:text-[11px] bg-amber-500/10 text-amber-300 px-2 py-1 rounded whitespace-nowrap">
              {roleLabel}
            </span>
            <Link href="/dashboard" className="text-[10px] sm:text-[11px] bg-slate-800 text-slate-300 px-2 py-1 rounded hover:bg-slate-700 whitespace-nowrap">
              الداشبورد
            </Link>
          </div>
        </div>
        <AdminNav links={links} />
      </nav>
      <main className="max-w-7xl mx-auto p-4 sm:p-6 md:p-10">
        {children}
      </main>
    </div>
  );
}

