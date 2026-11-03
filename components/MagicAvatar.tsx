"use client";

import React from "react";

export type MagicAvatarState = "idle" | "thinking" | "speaking" | "error";
export type MagicAvatarSize = "sm" | "md" | "lg";

const SIZES: Record<MagicAvatarSize, number> = { sm: 32, md: 48, lg: 72 };

interface MagicAvatarProps {
  state?: MagicAvatarState;
  size?: MagicAvatarSize;
  className?: string;
}

/**
 * Avatar خفيف (SVG + CSS) لشخصية Magic.
 * - idle: تنفس (breathing)
 * - thinking: نبضة (pulse)
 * - speaking: توهج + فم متحرك (جاهز لـ Phase 2، لكن لا يُربط بتدفق صوت فعلي في Phase 1)
 * - error: حالة محايدة
 *
 * يحترم prefers-reduced-motion عبر CSS.
 */
export function MagicAvatar({ state = "idle", size = "md", className = "" }: MagicAvatarProps) {
  const px = SIZES[size];
  return (
    <span
      className={`magic-avatar magic-avatar--${state} ${className}`}
      style={{ width: px, height: px, display: "inline-flex" }}
      aria-hidden="true"
      data-state={state}
      data-size={size}
    >
      <svg viewBox="0 0 64 64" width={px} height={px} xmlns="http://www.w3.org/2000/svg">
        {/* رأس */}
        <circle cx="32" cy="32" r="28" className="magic-avatar__head" />
        {/* حرف م */}
        <text
          x="32"
          y="44"
          textAnchor="middle"
          className="magic-avatar__letter"
          fontSize="34"
          fontWeight="800"
        >
          م
        </text>
        {/* فم (يظهر/يتحرك في speaking) */}
        <path
          d="M22 46 Q32 52 42 46"
          className="magic-avatar__mouth"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <style>{`
        .magic-avatar { position: relative; }
        .magic-avatar__head { fill: #10b981; }
        .magic-avatar__letter { fill: #ffffff; font-family: inherit; }
        .magic-avatar__mouth { stroke: #ffffff; opacity: 0; }

        /* idle: تنفس */
        .magic-avatar--idle .magic-avatar__head {
          animation: magic-breathe 3.2s ease-in-out infinite;
          transform-origin: center;
        }
        /* thinking: نبضة */
        .magic-avatar--thinking .magic-avatar__head {
          animation: magic-pulse 1.1s ease-in-out infinite;
          transform-origin: center;
        }
        /* speaking: توهج + فم */
        .magic-avatar--speaking .magic-avatar__head {
          filter: drop-shadow(0 0 6px rgba(16,185,129,0.6));
        }
        .magic-avatar--speaking .magic-avatar__mouth {
          opacity: 1;
          animation: magic-mouth 0.6s ease-in-out infinite;
        }
        /* error: محايد */
        .magic-avatar--error .magic-avatar__head { fill: #94a3b8; }

        @keyframes magic-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        @keyframes magic-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
        @keyframes magic-mouth {
          0%, 100% { d: path("M22 46 Q32 52 42 46"); }
          50% { d: path("M22 44 Q32 40 42 44"); }
        }

        @media (prefers-reduced-motion: reduce) {
          .magic-avatar--idle .magic-avatar__head,
          .magic-avatar--thinking .magic-avatar__head,
          .magic-avatar--speaking .magic-avatar__mouth {
            animation: none !important;
          }
        }
      `}</style>
    </span>
  );
}

export default MagicAvatar;
