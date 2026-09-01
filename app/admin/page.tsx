import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminRole } from "@/lib/auth-roles";
import { 
  Shield, UserPlus, Zap, Users, Key, CheckCircle, AlertCircle, 
  Bot, BookOpen, ShoppingBag, Activity, Database 
} from "lucide-react";

export default async function AdminControlCenter({
  searchParams,
}: {
  searchParams: { success?: string; error?: string };
}) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const role = await getAdminRole(supabase, user?.id || null, user?.email);

  if (!role) redirect("/dashboard");
  const isOwner = role === "owner";

  // 1. جلب إحصائيات عامة للنظام
  const [{ count: usersCount }, { count: lessonsCount }, { data: recentAiLogs }, { data: adminsList }] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("study_days").select("*", { count: "exact", head: true }),
    supabase.from("ai_agent_generations").select("*").order("created_at", { ascending: false }).limit(5),
    isOwner ? supabase.from("site_admins").select("user_id, role, added_at") : { data: [] }
  ]);

  return (
    <div className="p-6 md:p-10 dir-rtl max-w-7xl mx-auto space-y-8 bg-[var(--app-bg,#090d16)] text-white min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-6 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-3">
            <Shield className="text-amber-400" size={36} />
            مركز الإدارة الشامل (Owner & Admin Console)
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            متحكم النظام الحالي: <span className="text-amber-400 font-bold">{isOwner ? "المالك الرئيسي (Owner)" : "أدمن (Admin)"}</span>
          </p>
        </div>
      </div>

      {/* التنبيهات */}
      {searchParams.success && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-2 text-sm">
          <CheckCircle size={18} /> تم تنفيذ العملية بنجاح!
        </div>
      )}
      {searchParams.error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center gap-2 text-sm">
          <AlertCircle size={18} /> {searchParams.error}
        </div>
      )}

      {/* 1. كروت الإحصائيات السريعة (Live Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-blue-400">
            <Users size={22} />
            <span className="text-xs bg-blue-500/10 px-2 py-1 rounded">إجمالي الطلاب</span>
          </div>
          <p className="text-3xl font-bold">{usersCount || 0}</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-purple-400">
            <BookOpen size={22} />
            <span className="text-xs bg-purple-500/10 px-2 py-1 rounded">الدروس المتاحة</span>
          </div>
          <p className="text-3xl font-bold">{lessonsCount || 0}</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-emerald-400">
            <Bot size={22} />
            <span className="text-xs bg-emerald-500/10 px-2 py-1 rounded">محرك الذكاء الاصطناعي</span>
          </div>
          <p className="text-3xl font-bold">نشط 🟢</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-amber-400">
            <Database size={22} />
            <span className="text-xs bg-amber-500/10 px-2 py-1 rounded">الحالة الأمنية</span>
          </div>
          <p className="text-3xl font-bold">محمية 🛡️</p>
        </div>
      </div>

      {/* 2. قسم المالك المباشر (Owner Exclusive) */}
      {isOwner && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-lg">
              <Key size={20} />
              <h2>تعيين أدمن جديد (Owner Only)</h2>
            </div>
            <p className="text-xs text-slate-400">
              أدخل البريد الإلكتروني للمستخدم لمنحه صلاحيات الأدمن على المنصة.
            </p>

            <form action="/api/admin/manage-roles" method="POST" className="space-y-3 pt-2">
              <input type="hidden" name="action" value="grant" />
              <input
                type="email"
                name="email"
                placeholder="email@example.com"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400"
                required
              />
              <button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition"
              >
                <UserPlus size={16} /> منح صلاحية Admin
              </button>
            </form>
          </section>

          <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-200">
              <Users size={20} className="text-blue-400" /> فريق الأدمنز المعتمد
            </h2>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {adminsList && adminsList.length > 0 ? (
                adminsList.map((item) => (
                  <div key={item.user_id} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 text-xs">
                    <div>
                      <p className="font-mono text-slate-300">{item.user_id}</p>
                      <span className="text-[10px] text-amber-400 font-bold uppercase">{item.role || "admin"}</span>
                    </div>
                    {item.role !== "owner" && (
                      <form action="/api/admin/manage-roles" method="POST">
                        <input type="hidden" name="action" value="revoke" />
                        <input type="hidden" name="userId" value={item.user_id} />
                        <button type="submit" className="text-rose-400 hover:text-rose-300 font-bold px-2 py-1 rounded bg-rose-500/10">سحب</button>
                      </form>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">لا يوجد أدمنز آخرون مضافون حالياً.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {/* 3. شحن الرصيد الفوري للطلاب */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-lg">
          <Zap size={22} />
          <h2>شحن AI Credits للطلاب يدويًا</h2>
        </div>
        <p className="text-xs text-slate-400">
          يمكنك إضافة رصيد مجاني لأي طالب فوراً عبر إضافة الـ User ID الخاص به.
        </p>

        <form action="/api/admin/add-credits" method="POST" className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <input
            type="text"
            name="targetUserId"
            placeholder="User UUID (مثال: 6947e446-1a6a...)"
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-400 font-mono"
            required
          />
          <input
            type="number"
            name="amount"
            placeholder="عدد الـ Credits (مثال: 50)"
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-400"
            min="1"
            required
          />
          <button
            type="submit"
            className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition"
          >
            <Zap size={16} /> إرسال الرصيد
          </button>
        </form>
      </section>

      {/* 4. متابعة سجلات الذكاء الاصطناعي الحية (AI Telemetry Logs) */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-200">
            <Activity size={20} className="text-purple-400" /> أحدث عمليات توليد الـ AI (Logs)
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs text-slate-400">
            <thead className="bg-slate-800/80 text-slate-300 font-bold border-b border-slate-700">
              <tr>
                <th className="p-3">المستخدم</th>
                <th className="p-3">الـ Agent المستعمل</th>
                <th className="p-3">المزود (Provider)</th>
                <th className="p-3">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {recentAiLogs && recentAiLogs.length > 0 ? (
                recentAiLogs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-slate-800/40">
                    <td className="p-3 font-mono text-slate-300">{log.user_id?.substring(0, 8)}...</td>
                    <td className="p-3 text-emerald-400 font-bold">{log.agent || "Magic Tutor"}</td>
                    <td className="p-3 text-blue-400">{log.provider || "Groq"}</td>
                    <td className="p-3">{new Date(log.created_at).toLocaleString("ar-EG")}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-slate-500">لا توجد سجلات AI مسجلة حتى الآن.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}