/* شاشة تحميل /lectures — العلامة المتحرّكة + هياكل كروت المحاضرات.
   سيرفر كومبوننت (زي app/loading.tsx) فمفيش hooks ولا نص مترجم. */
import { MagiclyLoader } from "@/components/ui/MagiclyLoader";

export default function LecturesLoading() {
  return (
    <main className="page" aria-busy="true" aria-live="polite">
      <section className="band band-top">
        <div className="row" style={{ gap: "10px", marginBottom: "18px" }}>
          <span style={{ width: "22px", height: "2px", background: "var(--redpen)" }} />
          <span className="skel skel-line" style={{ width: "92px", height: "11px" }} />
        </div>

        <div className="stack" style={{ gap: "14px", maxWidth: "22ch" }}>
          <span className="skel skel-title" style={{ display: "block", width: "100%" }} />
          <span className="skel skel-title" style={{ display: "block", width: "58%" }} />
        </div>

        <MagiclyLoader label="بنجهّز محاضراتك…" />

        <div className="grid gap-4" aria-hidden>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="sheet-card p-5 animate-pulse space-y-3">
              <div className="h-4 w-1/2 rounded-full bg-paper-3" />
              <div className="h-2.5 w-1/3 rounded-full bg-paper-3" />
              <div className="h-10 w-full rounded-[var(--r-sm)] bg-paper-3" />
            </div>
          ))}
        </div>

        <span className="sr-only">جاري التحميل…</span>
      </section>
    </main>
  );
}
