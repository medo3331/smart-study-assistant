import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Shield } from "lucide-react";

export default async function AuditLogPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) redirect("/login");

  // Read audit log — simple read, no complex filtering for Phase 0
  const { data: auditLogs, error } = await supabase
    .from("audit_log")
    .select("id, actor_email, action, resource_type, resource_id, timestamp, result")
    .order("timestamp", { ascending: false })
    .limit(50);

  return (
    <div className="p-6 md:p-10 dir-rtl max-w-7xl mx-auto space-y-6 bg-[var(--app-bg,#090d16)] text-white min-h-screen">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <Shield className="text-amber-400" size={28} />
        <h1 className="text-2xl font-extrabold">سجل العمليات — Audit Log</h1>
        <span className="text-xs bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded">حساس</span>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-x-auto shadow-xl">
        <table className="w-full text-xs text-slate-300">
          <thead className="bg-slate-950 text-amber-300 text-[10px] uppercase tracking-wider">
            <tr>
              <th className="p-3 text-right">المُنفِّذ</th>
              <th className="p-3 text-right">الإجراء</th>
              <th className="p-3 text-right">المورد</th>
              <th className="p-3 text-right">التفاصيل</th>
              <th className="p-3 text-right">التاريخ</th>
              <th className="p-3 text-right">النتيجة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {error ? (
              <tr><td colSpan={6} className="p-4 text-center text-rose-400">خطأ في جلب السجل: {error.message}</td></tr>
            ) : !auditLogs || auditLogs.length === 0 ? (
              <tr><td colSpan={6} className="p-4 text-center text-slate-500">لا توجد سجلات حساسة مسجلة.</td></tr>
            ) : (
              auditLogs.map((log: any) => (
                <tr key={log.id} className="hover:bg-slate-800/30">
                  <td className="p-3 font-mono text-[10px] text-slate-400">{log.actor_email || "—"}</td>
                  <td className="p-3 font-bold text-amber-300 font-mono text-[10px]">{log.action}</td>
                  <td className="p-3 text-slate-500 font-mono text-[10px]">{log.resource_type}:{log.resource_id?.slice(0, 8) || "—"}</td>
                  <td className="p-3 text-[10px] text-slate-400">{log.details ? (typeof log.details === "string" ? JSON.parse(log.details)?.reason || JSON.parse(log.details)?.plan_key || "..." : JSON.stringify(log.details).slice(0, 40)) : "—"}</td>
                  <td className="p-3 text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleString("ar-EG")}</td>
                  <td className="p-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${log.result === "PASS" ? "bg-emerald-500/10 text-emerald-300" : log.result === "BLOCKED" ? "bg-rose-500/10 text-rose-300" : "bg-amber-500/10 text-amber-300"}`}>{log.result}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
