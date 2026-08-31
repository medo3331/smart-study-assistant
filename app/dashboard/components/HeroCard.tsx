"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { MagicOrb } from "./HeroAvatar";
import {
  Play,
  Sparkles,
  ShoppingBag,
  Flame,
  Clock,
  GraduationCap,
} from "lucide-react";

interface HeroCardProps {
  /** الاسم الحقيقي من الجلسة (زائر للحسابات المجهولة) — زي القايمة بالظبط. */
  displayName: string;
  /** سطر مكانك في الخطة — جاهز من الصفحة (headerSubtitle). */
  subtitle: string;
  level: number;
  streak: number;
  /** نسبة إنجاز الخطة الحقيقية ٠–١٠٠. */
  planProgressPct: number;
  completedSteps: number;
  totalSteps: number;
  onContinue: () => void;
  onOpenAiAssistant: () => void;
}

/**
 * بطاقة الترحيب — الهيرو الجديد للداشبورد.
 *
 * نظام التصميم الموحّد: خلفية داكنة #0D1029 بشفافية وبلاور، حدود شعرة،
 * البنفسجي #7C5CFF للإجراءات والتقدّم، والعنبري #FB923C للسلسلة والمستوى
 * فقط. الأيقونات Lucide بمقاس واحد (16) ووزن بصري موحّد.
 *
 * كل الأرقام حقيقية من حالة الصفحة (profiles/study_days) — مفيش أي رقم
 * مزيف، والأنيميشن مرة واحدة مع احترام prefers-reduced-motion.
 */
export function HeroCard({
  displayName,
  subtitle,
  level,
  streak,
  planProgressPct,
  completedSteps,
  totalSteps,
  onContinue,
  onOpenAiAssistant,
}: HeroCardProps) {
  const reduceMotion = useReducedMotion();
  const hasPlan = totalSteps > 0;

  return (
    <motion.section
      aria-label="الترحيب والحالة"
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 0.8, 0.36, 1] }}
      className="relative overflow-hidden rounded-[24px] border backdrop-blur-xl p-5 sm:p-6"
      style={{
        backgroundColor: "var(--card-primary)",
        borderColor: "var(--rule)",
        boxShadow: "0 8px 30px var(--shade)",
      }}
    >
      {/* غسلة متدرجة واحدة هادية جدًا — نفس أسلوب hero-wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 90% at 85% 0%, color-mix(in srgb, var(--accent) 8%, transparent) 0%, transparent 70%)",
        }}
      />

      <div className="relative flex flex-col gap-5">
        {/* ---- الأفاتار المداري + الترحيب ---- */}
        <div className="flex items-center gap-4 sm:gap-5">
          <MagicOrb level={level} />

          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-snug" style={{ color: "var(--text)" }}>
              أهلاً بك مجددًا، {displayName} 👋
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{subtitle}</p>

            {/* ---- القراءات الحقيقية تحت الترحيب ---- */}
            <div className="mt-3 flex flex-wrap gap-2">
              <Readout
                icon={<Flame size={15} aria-hidden />}
                tone="amber"
                label="السلسلة"
                value={streak}
                unit="يوم"
              />
              <Readout
                icon={<Clock size={15} aria-hidden />}
                tone="violet"
                label="تقدّم الخطة"
                value={planProgressPct}
                unit="%"
                dirLtr
              />
              {hasPlan && (
                <Readout
                  icon={<GraduationCap size={15} aria-hidden />}
                  tone="teal"
                  label="الخطوات"
                  value={completedSteps}
                  unit={`من ${totalSteps}`}
                />
              )}
            </div>
          </div>
        </div>

        <div className="h-px" style={{ backgroundColor: "var(--rule)" }} aria-hidden />

        {/* ---- الإجراءات السريعة: ٤ حبات بنفس الطول والوزن ---- */}
        {/* العبادات pill removed (Phase 4): dedicated Worship banner → QuranSection is primary gateway. */}
        <div className="flex flex-wrap gap-2">
          <ActionPill onClick={onContinue} icon={<Play size={16} aria-hidden />}>
            أكمل التعلّم
          </ActionPill>
          <ActionPill onClick={onOpenAiAssistant} icon={<Sparkles size={16} aria-hidden />}>
            المساعد الذكي
          </ActionPill>
          <ActionPill href="/shop" icon={<ShoppingBag size={16} aria-hidden />}>
            المتجر
          </ActionPill>
        </div>
      </div>
    </motion.section>
  );
}

/* ------------------------------------------------------------------ */

function Readout({
  icon,
  tone,
  label,
  value,
  unit,
  dirLtr,
}: {
  icon: React.ReactNode;
  tone: "amber" | "violet" | "teal";
  label: string;
  value: number | string;
  unit?: string;
  dirLtr?: boolean;
}) {
  const toneColor =
    tone === "amber" ? "var(--accent)" : tone === "teal" ? "var(--accent-highlight)" : "var(--accent)";
  return (
    <span
      className="inline-flex h-[34px] items-center gap-2 rounded-full border px-3 text-xs"
      style={{ borderColor: "var(--rule)", backgroundColor: "var(--card-secondary)", color: "var(--muted)" }}
    >
      <span className="flex" style={{ color: toneColor }} aria-hidden>
        {icon}
      </span>
      {label}
      <b className="font-mono text-sm font-bold" style={{ color: toneColor }} dir={dirLtr ? "ltr" : undefined}>
        {value}
      </b>
      {unit && <span>{unit}</span>}
    </span>
  );
}

function ActionPill({
  children,
  icon,
  onClick,
  href,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const baseStyle: React.CSSProperties = {
    borderColor: "var(--rule)",
    backgroundColor: "var(--card-secondary)",
    color: "var(--text)",
  };
  const cls =
    "inline-flex h-10 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition-colors hover:brightness-110 motion-press";
  const inner = (
    <>
      <span className="flex" style={{ color: "var(--accent-highlight)" }} aria-hidden>
        {icon}
      </span>
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} style={baseStyle}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} style={baseStyle}>
      {inner}
    </button>
  );
}
