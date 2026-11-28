import { MagiclyLoader } from "@/components/ui/MagiclyLoader";

/* شاشة تحميل مسارات /dashboard — هوية M⚡: الشعار فقط، بلا مدة انتظار ثابتة
   (بتظهر أثناء التحميل الحقيقي وبتختفي بجاهزية المحتوى). */
export default function DashboardLoading() {
  return (
    <main className="page" aria-busy="true" aria-live="polite">
      <section className="band band-top">
        <MagiclyLoader label="بنجهّز مساحتك…" />

        <div className="grid gap-4" aria-hidden>
          <div className="sheet-card p-5 animate-pulse space-y-3">
            <div className="h-4 w-1/2 rounded-full bg-paper-3" />
            <div className="h-2.5 w-1/3 rounded-full bg-paper-3" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="sheet-card p-5 animate-pulse space-y-3">
                <div className="h-4 w-2/3 rounded-full bg-paper-3" />
                <div className="h-10 w-full rounded-[var(--r-sm)] bg-paper-3" />
              </div>
            ))}
          </div>
        </div>

        <span className="sr-only">جاري التحميل…</span>
      </section>
    </main>
  );
}
