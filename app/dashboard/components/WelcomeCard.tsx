"use client";

import { ProfileAvatar } from "@/components/ProfileAvatar";

interface WelcomeCardProps {
  initial: string;
  name: string;
  streak: number;
  completedCount: number;
  totalSteps: number;
  isNew: boolean;
  isLagging: boolean;
  avatarUrl?: string | null;
}

const ar = (n: number) => n.toLocaleString("ar-EG");

export function WelcomeCard({
  initial,
  name,
  streak,
  completedCount,
  totalSteps,
  isNew,
  isLagging,
  avatarUrl,
}: WelcomeCardProps) {
  let title: string;
  let subtitle: string;

  if (isNew) {
    title = "أهلاً بيك في Magiclly 👋";
    subtitle = "يلا نبدأ رحلتك — أنشئ خطتك الأولى.";
  } else if (completedCount >= totalSteps && totalSteps > 0) {
    title = "ممتاز! خلصت خطتك كلها 🎉";
    subtitle = "خطة جديدة بتفتح طريق جديد — جاهز تبدأ؟";
  } else if (isLagging) {
    title = "رجعت تاني 👋";
    subtitle = "عندك خطوات مستنياك — نكمّل من وقتها؟";
  } else if (completedCount === 0) {
    title = "أهلاً بيك، جاهز تبدأ؟";
    subtitle = "أول خطوة بتفرّق — خطة مذاكرة مستنياك.";
  } else {
    title = "أهلاً بيك تاني 👋";
    subtitle = "جاهز تكمل رحلتك؟";
  }

  return (
    <section
      aria-label="ترحيب"
      className="dashboard-entrance flex items-center gap-4 rounded-[var(--r-lg)] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4 sm:p-5"
      style={{ animationDelay: "0ms" }}
    >
      <ProfileAvatar initial={initial} name={name} size={64} accountUrl={avatarUrl} />
      <div className="min-w-0 flex-1">
        <h1 className="text-base font-bold leading-snug text-[var(--color-text-primary)] sm:text-lg">
          {title}
        </h1>
        <p className="truncate text-sm font-semibold text-[var(--color-text-primary)] sm:text-base">
          {name}
        </p>
        <p className="text-xs leading-relaxed text-[var(--color-text-muted)] sm:text-sm">
          {subtitle}
        </p>
        {!isNew && totalSteps > 0 && (
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            <span className="tnum">{ar(completedCount)}</span> من{" "}
            <span className="tnum">{ar(totalSteps)}</span> خطوة · سلسلة{" "}
            <span className="tnum">{ar(streak)}</span> يوم
          </p>
        )}
      </div>
    </section>
  );
}
