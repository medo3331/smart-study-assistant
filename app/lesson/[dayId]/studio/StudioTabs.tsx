"use client";

import { useLessonStudio, type StudioTab } from "./LessonStudioProvider";

/* ==========================================================================
   StudioTabs — شريط التابات: علوي (ديسكتوب + موبايل scrollable)
   + Bottom Action Bar ثابت على الموبايل (< lg) بخمس أيقونات + زر AI عائم.
   ========================================================================== */

export const STUDIO_TABS: { id: StudioTab; label: string; icon: string }[] = [
  { id: "learn", label: "الشرح", icon: "📖" },
  { id: "video", label: "الفيديو", icon: "🎬" },
  { id: "notes", label: "النوتة", icon: "📝" },
  { id: "practice", label: "التطبيق", icon: "🧪" },
  { id: "tutor", label: "مساعد الدرس", icon: "✨" },
];

export function StudioTabsBar() {
  const { activeTab, setActiveTab } = useLessonStudio();

  return (
    <nav
      aria-label="تابات الاستوديو"
      className="flex items-center gap-1 overflow-x-auto bg-[var(--card-primary)]/70 backdrop-blur-xl border border-[var(--border)] rounded-2xl p-1.5"
      dir="rtl"
    >
      {STUDIO_TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-[12.5px] font-bold transition ${
              active
                ? "bg-ink text-paper-2"
                : "text-ink-soft hover:text-ink hover:bg-[var(--card-secondary)]"
            }`}
          >
            <span aria-hidden>{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

/** Bottom Action Bar — موبايل بس (< lg): خمس أيقونات + زر AI عائم فوقه. */
export function StudioBottomBar() {
  const { activeTab, setActiveTab } = useLessonStudio();

  return (
    <>
      {/* زر الـ AI العائم — فوق الـ bar */}
      <button
        onClick={() => setActiveTab("tutor")}
        aria-label="افتح مساعد الدرس"
        className={`lg:hidden fixed bottom-[4.5rem] left-4 z-[60] h-12 w-12 rounded-full shadow-[0_8px_24px_var(--shadow)] border flex items-center justify-center text-lg transition ${
          activeTab === "tutor"
            ? "bg-[var(--accent)] text-[var(--on-marker)] border-[var(--accent)]"
            : "bg-[var(--card-primary)] border-[var(--border)] text-ink"
        }`}
      >
        ✨
      </button>

      <nav
        aria-label="تنقل سريع"
        className="lg:hidden fixed inset-x-0 bottom-0 z-[55] border-t border-[var(--border)] bg-[var(--card-primary)]/95 backdrop-blur-xl"
        dir="rtl"
      >
        <div className="flex items-stretch justify-around">
          {STUDIO_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold transition ${
                  active ? "text-[var(--accent-highlight)]" : "text-ink-soft"
                }`}
              >
                <span aria-hidden className="text-base leading-none">{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
