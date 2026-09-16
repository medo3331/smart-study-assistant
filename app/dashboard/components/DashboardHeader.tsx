"use client";

/**
 * DashboardHeader — lightweight greeting.
 * Uses the REAL displayName from profiles (via railAccountFromUser).
 * No huge gradients, no images, no fake Guest/User fallback beyond "مستخدم".
 * Mobile-first, accessible, respects prefers-reduced-motion via parent.
 */
export function DashboardHeader({ displayName }: { displayName: string }) {
  // Guard: never show Guest/User literals — if caller passes empty, fallback to "مستخدم"
  const name = displayName?.trim() ? displayName.trim() : "مستخدم";
  return (
    <header className="px-1 sm:px-0" aria-label="ترحيب">
      <h1 className="text-xl sm:text-2xl font-bold leading-tight" style={{ color: "var(--text)" }}>
        أهلاً، {name} 👋
      </h1>
      <p className="mt-1.5 text-sm leading-6" style={{ color: "var(--muted)" }}>
        جاهز تكمل رحلتك اليوم؟
      </p>
    </header>
  );
}
