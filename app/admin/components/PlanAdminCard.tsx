import { readBillingSettings } from "@/app/plans/actions";

export default async function PlanAdminCard() {
  const s = await readBillingSettings();
  const freeOn = s.freePeriodEnabled === true;
  const payOff = s.paymentsEnabled === false;

  return (
    <div dir="rtl" className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-5 mb-6 shadow-lg">
      <h3 className="font-extrabold text-lg text-[#F0E6D2] mb-4">إعدادات الفواتير / الخطط</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border border-[#2A3050] bg-[#0D1029] p-3">
          <p className="text-xs text-[#7A8298] mb-1">الفترة المجانية</p>
          <p className={`font-extrabold text-base ${freeOn ? "text-emerald-400" : "text-red-400"}`}>{freeOn ? "مفعّلة" : "معطّلة"}</p>
        </div>
        <div className="rounded-xl border border-[#2A3050] bg-[#0D1029] p-3">
          <p className="text-xs text-[#7A8298] mb-1">الدفع / الاشتراك</p>
          <p className={`font-extrabold text-base ${payOff ? "text-emerald-400" : "text-amber-400"}`}>{payOff ? "معطّل (آمن)" : "مفعّل"}</p>
        </div>
      </div>
      <p className="text-xs text-[#7A8298] leading-relaxed">المصدر: {s.source === "db" ? "قاعدة البيانات" : "افتراضي آمن (لم تُحمّل الإعدادات بعد)"}. لا يتم تغيير أي قيمة من المتصفح.</p>
    </div>
  );
}
