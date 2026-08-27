"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  Play,
  Sparkles,
  MoonStar,
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
      className="relative overflow-hidden rounded-[24px] border border-white/[0.06] bg-[#0D0906]/70 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.35)] p-5 sm:p-6"
    >
      {/* غسلة متدرجة واحدة هادية جدًا — نفس أسلوب hero-wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 90% at 85% 0%, rgba(220,76,76,0.08) 0%, transparent 70%)",
        }}
      />

      <div className="relative flex flex-col gap-5">
        {/* ---- الأفاتار المداري + الترحيب ---- */}
        <div className="flex items-center gap-4 sm:gap-5">
          {/* العنصر المميز: قرص بنفسجي متوهج + نقطة عنبرية تدور (الستريك)
              + شارة المستوى — كلها قراءات حقيقية مش زخرفة. */}
          <div
            className="relative shrink-0"
            style={{ width: 128, height: 128 }}
            role="img"
            aria-label={`صورة حسابك — المستوى ${level}`}
          >
            <motion.div
              className="absolute inset-0"
              animate={reduceMotion ? undefined : { rotate: 360 }}
              transition={{ duration: 9, ease: "linear", repeat: Infinity }}
              style={{ transformOrigin: "center" }}
              aria-hidden
            >
              <span
                className="absolute left-1/2 top-1/2 rounded-full bg-[#FB923C]"
                style={{
                  width: 11,
                  height: 11,
                  margin: "-5.5px",
                  boxShadow: "0 0 12px #FB923C",
                  transform: "translateY(-52px)",
                }}
              />
            </motion.div>

            <div
              className="relative z-10 flex items-center justify-center overflow-hidden rounded-full font-display font-extrabold text-white"
              style={{
                width: 92,
                height: 92,
                margin: "18px auto 0",
                background: "linear-gradient(160deg, #DC4C4C 0%, #F2745C 100%)",
                boxShadow:
                  "0 0 0 3px rgba(220,76,76,0.5), 0 0 28px rgba(220,76,76,0.55)",
              }}
            >
              <span className="text-[32px] leading-none pt-1">
                {displayName.trim().charAt(0).toUpperCase() || "؟"}
              </span>
            </div>

            <span
              className="absolute bottom-1.5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[#FB923C] font-mono text-[11px] font-bold text-[#231402] whitespace-nowrap"
              style={{
                padding: "2px 10px",
                boxShadow: "0 0 14px rgba(251,146,60,0.6)",
              }}
              dir="ltr"
            >
              LV {level}
            </span>
          </div>

          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white leading-snug">
              أهلاً بك مجددًا، {displayName} 👋
            </h1>
            <p className="mt-1 text-sm text-[#9AA0C0]">{subtitle}</p>

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

        <div className="h-px bg-white/[0.06]" aria-hidden />

        {/* ---- الإجراءات السريعة: ٤ حبات بنفس الطول والوزن ---- */}
        <div className="flex flex-wrap gap-2">
          <ActionPill onClick={onContinue} icon={<Play size={16} aria-hidden />}>
            أكمل التعلّم
          </ActionPill>
          <ActionPill onClick={onOpenAiAssistant} icon={<Sparkles size={16} aria-hidden />}>
            المساعد الذكي
          </ActionPill>
          <ActionPill href="/worship" icon={<MoonStar size={16} aria-hidden />}>
            العبادات
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
  const toneText =
    tone === "amber" ? "text-[#FB923C]" : tone === "teal" ? "text-[#2DD4BF]" : "text-[#B69CFF]";
  return (
    <span className="inline-flex h-[34px] items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 text-xs text-[#9AA0C0]">
      <span className={`flex ${toneText}`} aria-hidden>
        {icon}
      </span>
      {label}
      <b className={`font-mono text-sm font-bold ${toneText}`} dir={dirLtr ? "ltr" : undefined}>
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
  const cls =
    "inline-flex h-10 items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-semibold text-[#E7E9F5] transition-colors hover:bg-white/[0.08] hover:border-[#DC4C4C]/35 active:scale-[0.97]";
  const inner = (
    <>
      <span className="flex text-[#F2745C]" aria-hidden>
        {icon}
      </span>
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
