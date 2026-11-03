import { requireAdminPermission } from "@/lib/admin/auth-check";
import { fetchAiUsageReport } from "@/lib/admin/ai-usage";

export const dynamic = "force-dynamic";

export default async function AiUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; feature?: string; provider?: string; status?: string }>;
}) {
  const sp = await searchParams;
  await requireAdminPermission("audit.read");
  const report = await fetchAiUsageReport(sp);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-amber-300">تقرير استخدام الذكاء الاصطناعي</h1>
      {!report.available ? (
        <div className="rounded border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200">
          <p className="font-bold">{report.reason}</p>
          <p>{report.message}</p>
          <p className="text-xs mt-2">هذا ليس تقرير استخدام صفر — التتبع غير مفعّل أو غير قابل للقراءة.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded bg-slate-800 p-3"><div className="text-xs text-slate-400">إجمالي الأحداث</div><div className="text-xl font-bold">{report.summary.totalEvents}</div></div>
            <div className="rounded bg-slate-800 p-3"><div className="text-xs text-slate-400">ناجحة</div><div className="text-xl font-bold text-emerald-300">{report.summary.completed}</div></div>
            <div className="rounded bg-slate-800 p-3"><div className="text-xs text-slate-400">فاشلة</div><div className="text-xl font-bold text-rose-300">{report.summary.failedTotal}</div></div>
            <div className="rounded bg-slate-800 p-3"><div className="text-xs text-slate-400">المستخدمون</div><div className="text-xl font-bold">{report.summary.usersWithEvents}</div></div>
          </div>
          <div className="text-xs text-slate-400">
            Tokens: prompt {report.summary.promptTokensTotal} (معروف في {report.summary.promptTokensKnown} سجل) · completion {report.summary.completionTokensTotal} (معروف في {report.summary.completionTokensKnown} سجل).{" "}
            {report.summary.latencyAvgMs !== null ? `متوسط زمن الاستجابة: ${report.summary.latencyAvgMs.toFixed(0)} ms (${report.summary.latencySamples} عينة)` : "زمن الاستجابة: Unknown"}
          </div>
          <div className="text-xs text-slate-500">تكلفة الاستخدام غير متوفرة حاليًا؛ لا يوجد تقدير (التكلفة غير متوفرة).</div>

          <section>
            <h2 className="font-bold mb-2">حسب الميزة</h2>
            <table className="w-full text-xs"><tbody>
              {report.byFeature.map((r) => (<tr key={r.key} className="border-t border-slate-800"><td>{r.key}</td><td>{r.events}</td><td>{r.completed}</td><td>{r.failed}</td><td>{r.units}</td></tr>))}
            </tbody></table>
          </section>
          <section>
            <h2 className="font-bold mb-2">حسب المزوّد</h2>
            <table className="w-full text-xs"><tbody>
              {report.byProvider.map((r) => (<tr key={r.key} className="border-t border-slate-800"><td>{r.key}</td><td>{r.events}</td><td>{r.completed}</td><td>{r.failed}</td></tr>))}
            </tbody></table>
          </section>
          <section>
            <h2 className="font-bold mb-2">حسب النموذج</h2>
            <table className="w-full text-xs"><tbody>
              {report.byModel.map((r) => (<tr key={r.key} className="border-t border-slate-800"><td>{r.key}</td><td>{r.events}</td></tr>))}
            </tbody></table>
          </section>
          <section>
            <h2 className="font-bold mb-2">حسب الحالة</h2>
            <table className="w-full text-xs"><tbody>
              {report.byStatus.map((r) => (<tr key={r.status} className="border-t border-slate-800"><td>{r.status}</td><td>{r.events}</td><td>{r.units}</td></tr>))}
            </tbody></table>
          </section>
          <section>
            <h2 className="font-bold mb-2">أعلى المستخدمين (ID فقط)</h2>
            <table className="w-full text-xs"><tbody>
              {report.topUsers.map((u) => (<tr key={u.userId ?? "anon"} className="border-t border-slate-800"><td className="font-mono">{u.userId ?? "مجهول (بدون user_id)"}</td><td>{u.events}</td><td>{u.completed}</td><td>{u.failed}</td><td>{u.units}</td><td>prompt {u.promptTokensTotal} ({u.promptTokensKnown})</td></tr>))}
            </tbody></table>
          </section>
        </>
      )}
    </div>
  );
}
