"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Play,
  Clock,
  Zap,
  Layers,
  Bookmark,
  Heart,
  Share2,
} from "lucide-react";
import { GlassCard } from "./LessonChrome";

/* ==========================================================================
   هيرو الدرس: المادة + العنوان + الوصف الحقيقيين + شارات ميتا + CTA ديناميكي
   + إجراءات ثانوية (حفظ/مفضلة/مشاركة) + رسم الخلية التجريدي المعتمد.
   ========================================================================== */

interface LessonHeroProps {
  subject?: string;
  /** عنوان الدرس من study_days.topic. */
  title: string;
  /** وصف الدرس من study_days.description — يُخفى لو فاضي. */
  description?: string;
  /** المكافأة الحقيقية study_days.xp_reward — الشارة تختفي لو null. */
  xpReward?: number | null;
  /** حالة الدرس الفعلية → نص الزر. */
  state: "start" | "continue" | "review";
  onStart: () => void;
  /* الإجراءات الثانوية */
  isSaved: boolean;
  onToggleSave: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onShare: () => void;
}

export function LessonHero({
  subject,
  title,
  description,
  xpReward,
  state,
  onStart,
  isSaved,
  onToggleSave,
  isFavorite,
  onToggleFavorite,
  onShare,
}: LessonHeroProps) {
  const ctaLabel =
    state === "review" ? "راجع الدرس" : state === "continue" ? "تابع الدرس" : "ابدأ الدرس";

  return (
    <GlassCard glow className="p-5 sm:p-7">
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        {/* ---- النص ---- */}
        <div className="min-w-0 flex-1">
          {subject && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(124,92,255,0.28)] bg-[rgba(124,92,255,0.13)] px-3 py-1 text-[11.5px] font-bold text-[#B69CFF]">
              <CellGlyph size={12} />
              {subject}
            </span>
          )}

          <h1 className="mt-3 text-[24px] font-bold leading-[1.6] text-white sm:text-[27px]">
            {title}
          </h1>

          {description && (
            <p className="mt-2 max-w-[52ch] text-[14px] leading-[1.95] text-[#9AA0C0]">
              {description}
            </p>
          )}

          {/* ---- شارات الميتا: بس اللي عنده مصدر حقيقي بيظهر ---- */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <MetaChip tone="violet" icon={<Clock size={14} aria-hidden />}>
              ~<span className="font-mono tnum">20</span> دقيقة
            </MetaChip>
            {xpReward != null && (
              <MetaChip tone="amber" icon={<Zap size={14} aria-hidden />}>
                +<span className="font-mono tnum font-bold">{xpReward}</span> XP
              </MetaChip>
            )}
            <MetaChip tone="teal" icon={<Layers size={14} aria-hidden />}>
              شرح + فيديو
            </MetaChip>
          </div>

          {/* ---- CTA الأساسي البنفسجي (أبدًا مش عنبري) ---- */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <motion.button
              type="button"
              onClick={onStart}
              whileTap={{ scale: 0.97 }}
              className="inline-flex h-[46px] items-center justify-center gap-2 rounded-2xl bg-[#7C5CFF] px-5 text-[14.5px] font-bold text-white shadow-[0_6px_22px_rgba(124,92,255,0.38)] transition-colors hover:bg-[#8E72FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C5CFF]"
            >
              <Play size={17} aria-hidden />
              {ctaLabel}
            </motion.button>

            {/* ---- إجراءات ثانوية بنفس مكتبة الأيقونات ---- */}
            <div className="flex flex-wrap items-center gap-1.5 sm:ms-auto">
              <SecondaryAction
                icon={<Bookmark size={15} aria-hidden />}
                active={isSaved}
                onClick={onToggleSave}
                pressedLabel="محفوظ"
                label="حفظ"
              />
              <SecondaryAction
                icon={<Heart size={15} aria-hidden />}
                active={isFavorite}
                onClick={onToggleFavorite}
                pressedLabel="في المفضلة"
                label="المفضلة"
              />
              <SecondaryAction icon={<Share2 size={15} />} onClick={onShare} label="مشاركة" />
            </div>
          </div>
        </div>

        {/* ---- الرسم التجريدي للخلية (معتمد) — زخرفي بحت ---- */}
        <div
          aria-hidden
          className="mx-auto hidden w-[230px] flex-none md:mx-0 md:block lg:w-[250px]"
        >
          <CellArt />
        </div>
      </div>
    </GlassCard>
  );
}

/* ------------------------------------------------------------------ */

function MetaChip({
  icon,
  tone,
  children,
}: {
  icon: React.ReactNode;
  tone: "amber" | "violet" | "teal";
  children: React.ReactNode;
}) {
  const cls =
    tone === "amber"
      ? "border-white/[0.08] bg-white/[0.04] text-[#FB923C]"
      : tone === "violet"
        ? "border-white/[0.08] bg-white/[0.04] text-[#B69CFF]"
        : "border-white/[0.08] bg-white/[0.04] text-[#2DD4BF]";
  return (
    <span
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] ${cls}`}
    >
      <span className="flex">{icon}</span>
      {children}
    </span>
  );
}

function SecondaryAction({
  icon,
  label,
  pressedLabel,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  pressedLabel?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active ? true : undefined}
      className={
        "inline-flex h-[38px] items-center gap-1.5 rounded-[13px] border px-3 text-[12.5px] font-semibold transition-colors " +
        (active
          ? "border-[rgba(124,92,255,0.35)] bg-[rgba(124,92,255,0.10)] text-[#B69CFF] [&_svg]:fill-[rgba(183,156,255,0.9)] [&_svg]:stroke-[#B69CFF]"
          : "border-white/[0.08] bg-white/[0.03] text-[#9AA0C0] hover:bg-white/[0.07] hover:text-[#E7E9F5]")
      }
    >
      {icon}
      {active && pressedLabel ? pressedLabel : label}
    </button>
  );
}

/** حبة خلية صغيرة للشارة — نفس لغة الرسم الكبير. */
function CellGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="10" cy="10" r="2.6" />
      <path d="M16.5 15.5c-1.2 1-3.4 1.4-5 .8" />
    </svg>
  );
}

/** رسم الخلية المجرد المعتمد — بنفسجي/تيل هادي على خلفية داكنة. */
export function CellArt() {
  return (
    <svg viewBox="0 0 250 250" fill="none" className="h-auto w-full">
      <defs>
        <radialGradient id="lessonCyto" cx="42%" cy="38%" r="75%">
          <stop offset="0%" stopColor="#7C5CFF" stopOpacity=".16" />
          <stop offset="60%" stopColor="#7C5CFF" stopOpacity=".05" />
          <stop offset="100%" stopColor="#7C5CFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lessonNuc" cx="38%" cy="35%" r="80%">
          <stop offset="0%" stopColor="#B69CFF" stopOpacity=".55" />
          <stop offset="100%" stopColor="#7C5CFF" stopOpacity=".18" />
        </radialGradient>
      </defs>
      <ellipse cx="125" cy="125" rx="112" ry="98" stroke="#7C5CFF" strokeOpacity=".45" strokeWidth="1.6" />
      <ellipse cx="125" cy="125" rx="104" ry="90" stroke="#7C5CFF" strokeOpacity=".16" strokeWidth="1" />
      <ellipse cx="125" cy="125" rx="103" ry="89" fill="url(#lessonCyto)" />
      <circle cx="105" cy="102" r="34" fill="url(#lessonNuc)" stroke="#B69CFF" strokeOpacity=".55" strokeWidth="1.4" />
      <circle cx="98" cy="96" r="9" fill="#EDE7FF" fillOpacity=".85" />
      <path d="M92 118c8-7 20-9 27-5" stroke="#EDE7FF" strokeOpacity=".5" strokeWidth="1.4" strokeLinecap="round" />
      <g transform="translate(150 148) rotate(-18)">
        <rect x="-30" y="-13" width="60" height="26" rx="13" stroke="#2DD4BF" strokeOpacity=".6" strokeWidth="1.5" />
        <path d="M-20 -4q6 8 0 16 M-8 -6q7 10 0 20 M4 -6q7 10 0 20 M16 -4q6 8 0 16" stroke="#2DD4BF" strokeOpacity=".45" strokeWidth="1.3" strokeLinecap="round" />
      </g>
      <g transform="translate(168 84) rotate(14)">
        <rect x="-22" y="-10" width="44" height="20" rx="10" stroke="#2DD4BF" strokeOpacity=".45" strokeWidth="1.3" />
        <path d="M-13 -3q5 7 0 14 M-1 -4q6 9 0 18 M10 -3q5 7 0 14" stroke="#2DD4BF" strokeOpacity=".35" strokeWidth="1.2" strokeLinecap="round" />
      </g>
      <g fill="#B69CFF">
        <circle cx="70" cy="165" r="3.2" fillOpacity=".85" />
        <circle cx="83" cy="152" r="2.4" fillOpacity=".55" />
        <circle cx="62" cy="146" r="2.1" fillOpacity=".4" />
        <circle cx="140" cy="60" r="2.8" fillOpacity=".6" />
        <circle cx="128" cy="176" r="2.4" fillOpacity=".5" />
        <circle cx="186" cy="122" r="2.6" fillOpacity=".5" />
        <circle cx="94" cy="196" r="2.2" fillOpacity=".4" />
      </g>
      <path d="M138 120c14 4 24 14 26 26 M144 108c18 6 30 20 33 36 M136 132c10 3 17 10 20 18" stroke="#7C5CFF" strokeOpacity=".3" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
