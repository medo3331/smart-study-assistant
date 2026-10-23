import { requireAdminPermission } from "@/lib/admin/auth-check";
import { fetchRuntimeErrorsReport } from "@/lib/admin/runtime-errors";

export const dynamic = "force-dynamic";

export default async function RuntimeErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; route?: string; category?: string }>;
}) {
  const sp = await searchParams;
  await requireAdminPermission("audit.read");
  const report = await fetchRuntimeErrorsReport(sp);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-amber-300">أخطاء Runtime (مراقبة)</h1>
      {!report.available ? (
        <div className="rounded border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200">
          <p className="font-bold">{report.reason}</p>
          <p>{report.message}</p>
          <p className="text-xs mt-2">هذا ليس "لا توجد أخطاء" — التسجيل غير مفعّل أو غير قابل للقراءة.</p>
        </div>
      ) : (
        <>
          <div className="text-xs text-slate-400">الإجمالي في النطاق: {report.summary.total} (محدود بـ 500)</div>
          <section>
            <h2 className="font-bold mb-2">حسب التصنيف</h2>
            <ul className="text-xs space-y-1">{report.summary.byCategory.map((r) => <li key={r.category}>{r.category}: {r.count}</li>)}</ul>
          </section>
          <section>
            <h2 className="font-bold mb-2">حسب المسار</h2>
            <ul className="text-xs space-y-1">{report.summary.byRoute.map((r) => <li key={r.route}>{r.route}: {r.count}</li>)}</ul>
          </section>
          <section>
            <h2 className="font-bold mb-2">الأخطاء</h2>
            <table className="w-full text-xs"><tbody>
              {report.rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-800 align-top">
                  <td className="font-mono">{r.createdAt}</td>
                  <td>{r.route}</td>
                  <td>{r.category}</td>
                  <td>{r.errorType}</td>
                  <td>{r.traceId}</td>
                  <td>{r.userId ?? "زائر"}</td>
                  <td>{r.message}</td>
                </tr>
              ))}
            </tbody></table>
          </section>
        </>
      )}
    </div>
  );
}
