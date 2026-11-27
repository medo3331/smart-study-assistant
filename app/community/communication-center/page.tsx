import SupportSection from "@/components/communication/SupportSection";

export default function CommunicationCenterPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-3 py-5 text-ink sm:px-5 sm:py-8" dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-ink">مركز التواصل الموحد</h1>
        <p className="mt-1 text-sm text-ink-soft">مركز التواصل الموحد — الدردشة، الإشعارات، الدعم، والتواصل الإداري في مكان واحد.</p>
      </div>

      <div className="grid min-h-[800px] grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="lg:col-span-3 lg:col-start-2">
          <SupportSection />
        </aside>
      </div>
    </main>
  );
}
