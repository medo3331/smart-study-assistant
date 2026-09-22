import { redirect } from "next/navigation";
import { getAdminRole, isOwnerEmail } from "@/lib/auth-roles";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { Shield, Users, ShieldCheck, Zap, Crown, ShoppingBag, Database, Cpu, Activity, Server, UserCog } from "lucide-react";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) redirect("/login");
  if (!isOwnerEmail(user.email ?? null)) redirect("/dashboard");
  const role = await getAdminRole(supabase, user?.id || null, user?.email);
  const isOwner = role === "owner";

  return (
    <div className="min-h-screen bg-[var(--app-bg,#090d16)] text-white dir-rtl">
      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur border-b border-slate-800 px-6 py-3 flex items-center gap-4 overflow-x-auto">
        <a href="/admin" className="text-amber-400 font-extrabold text-lg whitespace-nowrap flex items-center gap-2"><Shield size={20}/> لوحة الأدمن</a>
        <a href="/admin" className="text-xs bg-amber-500/10 text-amber-300 px-2 py-1 rounded hover:bg-amber-500/20 whitespace-nowrap">الرئيسية</a>
        <a href="#users-section" className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded hover:bg-slate-700 whitespace-nowrap">المستخدمين</a>
        <a href="#subscriptions" className="text-xs bg-amber-500/10 text-amber-300 px-2 py-1 rounded hover:bg-amber-500/20 whitespace-nowrap font-bold">الاشتراكات</a>
        <a href="#plans" className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded hover:bg-slate-700 whitespace-nowrap">الخطط</a>
        <a href="#ai-models" className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded hover:bg-slate-700 whitespace-nowrap">نماذج الذكاء</a>
        <a href="#rewards" className="text-xs bg-emerald-500/10 text-emerald-300 px-2 py-1 rounded hover:bg-emerald-500/20 whitespace-nowrap">المكافآت</a>
        <a href="/admin/audit-log" className="text-xs bg-amber-500/10 text-amber-300 px-2 py-1 rounded hover:bg-amber-500/20 whitespace-nowrap">سجل العمليات</a>
      </nav>
      <main className="max-w-7xl mx-auto p-6 md:p-10">
        {children}
      </main>
    </div>
  );
}
