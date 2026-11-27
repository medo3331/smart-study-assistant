"use client";

import React from "react";

export type MagicAvatarState = "idle" | "thinking" | "speaking" | "error";
export type MagicAvatarSize = "sm" | "md" | "lg" | "xl";

const SIZES: Record<MagicAvatarSize, number> = { sm: 32, md: 48, lg: 72, xl: 96 };

interface MagicAvatarProps {
  state?: MagicAvatarState;
  size?: MagicAvatarSize;
  className?: string;
}

/**
 * شخصية Magic الكرتونية (ستايل ماسكوت زي دولينجو) — SVG + CSS فقط.
 * - idle: تمايل خفيف + رمش
 * - thinking: ميلان + العيون بتدور وبتفكر + نجمة القبعة بتلمع
 * - speaking: الفم بيتحرك + توهج
 * - error: وجه حزين ومُعتم
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
      <svg viewBox="0 0 64 68" width={px} height={px} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="magic-avatar-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="magic-avatar-hat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#6d28d9" />
          </linearGradient>
        </defs>

        {/* ظل أرضي */}
        <ellipse cx="32" cy="65" rx="15" ry="2.4" fill="#0f172a" opacity="0.1" />

        <g className="magic-avatar__figure">
          {/* الجسم */}
          <path
            className="magic-avatar__body"
            d="M32 13 C 46 13 54 25 54 39 C 54 53 44 61 32 61 C 20 61 10 53 10 39 C 10 25 18 13 32 13 Z"
            fill="url(#magic-avatar-body)"
          />
          {/* البطن الفاتح */}
          <ellipse cx="32" cy="48" rx="12" ry="8.5" fill="#ffffff" opacity="0.18" />
          {/* ذراعين صغيرتين */}
          <ellipse cx="9.5" cy="42" rx="4" ry="6" fill="#059669" transform="rotate(18 9.5 42)" />
          <ellipse cx="54.5" cy="42" rx="4" ry="6" fill="#059669" transform="rotate(-18 54.5 42)" />

          {/* العيون */}
          <g className="magic-avatar__eyes">
            <g className="magic-avatar__eye">
              <ellipse cx="24" cy="35" rx="5.4" ry="6.6" fill="#ffffff" />
              <circle className="magic-avatar__pupil" cx="24.8" cy="36" r="3" fill="#17252b" />
              <circle cx="25.9" cy="33.8" r="1.1" fill="#ffffff" />
            </g>
            <g className="magic-avatar__eye">
              <ellipse cx="40" cy="35" rx="5.4" ry="6.6" fill="#ffffff" />
              <circle className="magic-avatar__pupil" cx="40.8" cy="36" r="3" fill="#17252b" />
              <circle cx="41.9" cy="33.8" r="1.1" fill="#ffffff" />
            </g>
          </g>

          {/* الخدود */}
          <ellipse className="magic-avatar__blush" cx="16.5" cy="43" rx="2.9" ry="1.7" fill="#fb7185" opacity="0.55" />
          <ellipse className="magic-avatar__blush" cx="47.5" cy="43" rx="2.9" ry="1.7" fill="#fb7185" opacity="0.55" />

          {/* الفم: ابتسامة (افتراضي) + قلق (error) */}
          <path
            className="magic-avatar__mouth-smile"
            d="M26 46 Q32 51.5 38 46"
            fill="none"
            stroke="#064e3b"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            className="magic-avatar__mouth-worried"
            d="M27 49 Q32 45 37 49"
            fill="none"
            stroke="#064e3b"
            strokeWidth="2.2"
            strokeLinecap="round"
          />

          {/* قبعة الساحر */}
          <g className="magic-avatar__hat" transform="rotate(-7 32 12)">
            <path d="M20 15.5 Q26 3 32 1.5 Q38 3 44 15.5 Z" fill="url(#magic-avatar-hat)" />
            <ellipse cx="32" cy="15.5" rx="16" ry="4.2" fill="#5b21b6" />
            <path
              className="magic-avatar__star"
              d="M36 5 L37.2 7.8 L40 9 L37.2 10.2 L36 13 L34.8 10.2 L32 9 L34.8 7.8 Z"
              fill="#fde047"
            />
          </g>

          {/* لمعان صغير جنب القبعة */}
          <path
            className="magic-avatar__sparkle"
            d="M13 17 L13.9 19.1 L16 20 L13.9 20.9 L13 23 L12.1 20.9 L10 20 L12.1 19.1 Z"
            fill="#fde047"
          />
        </g>

        <style>{`
          .magic-avatar { position: relative; }
          .magic-avatar__figure { transform-origin: 32px 40px; }
          .magic-avatar__eye { transform-box: fill-box; transform-origin: center; }
          .magic-avatar__pupil { transform-box: fill-box; transform-origin: center; }
          .magic-avatar__star, .magic-avatar__sparkle { transform-box: fill-box; transform-origin: center; }
          .magic-avatar__mouth-worried { opacity: 0; }
          .magic-avatar__mouth-smile { transform-box: fill-box; transform-origin: center; }

          /* idle: تمايل + رمش */
          .magic-avatar--idle .magic-avatar__figure {
            animation: magic-bob 3.6s ease-in-out infinite;
          }
          .magic-avatar--idle .magic-avatar__eye {
            animation: magic-blink 4.4s ease-in-out infinite;
          }

          /* thinking: ميلان + العيون تدور + النجمة تلمع */
          .magic-avatar--thinking .magic-avatar__figure {
            animation: magic-tilt 1.8s ease-in-out infinite;
          }
          .magic-avatar--thinking .magic-avatar__pupil {
            animation: magic-look 1.3s ease-in-out infinite alternate;
          }
          .magic-avatar--thinking .magic-avatar__star {
            animation: magic-glow 1s ease-in-out infinite;
          }
          .magic-avatar--thinking .magic-avatar__sparkle {
            animation: magic-glow 1.4s ease-in-out infinite;
          }

          /* speaking: فم بيتحرك + توهج */
          .magic-avatar--speaking .magic-avatar__figure {
            filter: drop-shadow(0 0 6px rgba(16, 185, 129, 0.55));
          }
          .magic-avatar--speaking .magic-avatar__mouth-smile {
            animation: magic-talk 0.55s ease-in-out infinite;
          }
          .magic-avatar--speaking .magic-avatar__star {
            animation: magic-glow 1.2s ease-in-out infinite;
          }

          /* error: وجه حزين + معتم */
          .magic-avatar--error .magic-avatar__figure {
            filter: grayscale(0.85);
            opacity: 0.85;
          }
          .magic-avatar--error .magic-avatar__mouth-smile { opacity: 0; }
          .magic-avatar--error .magic-avatar__mouth-worried { opacity: 1; }

          @keyframes magic-bob {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-1.6px); }
          }
          @keyframes magic-blink {
            0%, 91%, 100% { transform: scaleY(1); }
            94% { transform: scaleY(0.08); }
            97% { transform: scaleY(1); }
          }
          @keyframes magic-tilt {
            0%, 100% { transform: rotate(-3deg); }
            50% { transform: rotate(3deg); }
          }
          @keyframes magic-look {
            0% { transform: translate(0, -1px); }
            50% { transform: translate(-1.4px, -0.6px); }
            100% { transform: translate(1.4px, -0.6px); }
          }
          @keyframes magic-glow {
            0%, 100% { opacity: 0.55; transform: scale(0.85); }
            50% { opacity: 1; transform: scale(1.18); }
          }
          @keyframes magic-talk {
            0%, 100% { transform: scaleY(1); }
            50% { transform: scaleY(0.45); }
          }

          @media (prefers-reduced-motion: reduce) {
            .magic-avatar--idle .magic-avatar__figure,
            .magic-avatar--idle .magic-avatar__eye,
            .magic-avatar--thinking .magic-avatar__figure,
            .magic-avatar--thinking .magic-avatar__pupil,
            .magic-avatar--thinking .magic-avatar__star,
            .magic-avatar--thinking .magic-avatar__sparkle,
            .magic-avatar--speaking .magic-avatar__mouth-smile,
            .magic-avatar--speaking .magic-avatar__star {
              animation: none !important;
            }
          }
        `}</style>
      </svg>
    </span>
  );
}

export default MagicAvatar;
