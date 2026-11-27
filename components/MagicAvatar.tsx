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
 * ماجيك — الشخصية الكرتونية الرسمية لـ Magicly (ستايل ماسكوت كامل).
 * مخلوق أخضر صغير بحوار حيوي: عيون كبيرة بترمش، هوائي بنجمة بتنور، لمعات حواليه.
 * - idle: تمايل + رمش + النجمة بتلمع بهدوء
 * - thinking: بيميل + عيونه بتلف وهو بيفكر + فمه صغير مركّز
 * - speaking: فمه بيتحرك وهو بيتكلم + توهج
 * - error: حزين ومُعتم
 * SVG + CSS فقط — يحترم prefers-reduced-motion.
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
        <defs>
          <linearGradient id="magic-avatar-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6ee7b7" />
            <stop offset="55%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
        </defs>

        {/* ظل أرضي */}
        <ellipse cx="32" cy="61" rx="14" ry="2.2" fill="#0f172a" opacity="0.12" />

        <g className="magic-avatar__figure">
          {/* الرأس/الجسم — تشيبي مستدير */}
          <path
            className="magic-avatar__body"
            d="M32 8 C 47 8 55 20 55 34 C 55 49 45 58 32 58 C 19 58 9 49 9 34 C 9 20 17 8 32 8 Z"
            fill="url(#magic-avatar-body)"
          />
          {/* لمعة أعلى الرأس */}
          <ellipse cx="24" cy="17" rx="9" ry="5" fill="#ffffff" opacity="0.28" transform="rotate(-18 24 17)" />

          {/* هوائي النجمة السحرية */}
          <path
            className="magic-avatar__antenna"
            d="M32 9 Q 30 5.5 33.5 4"
            stroke="#0f766e"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <path
            className="magic-avatar__star"
            d="M34.6 0.6 L35.7 2.6 L37.8 3.6 L35.7 4.6 L34.6 6.6 L33.5 4.6 L31.4 3.6 L33.5 2.6 Z"
            fill="#fbbf24"
          />

          {/* العيون الكبيرة */}
          <g className="magic-avatar__eyes">
            <g className="magic-avatar__eye">
              <ellipse cx="23.5" cy="33" rx="6.2" ry="7.6" fill="#ffffff" />
              <circle className="magic-avatar__pupil" cx="24.2" cy="34.2" r="3.5" fill="#1e293b" />
              <circle cx="25.5" cy="32.6" r="1.35" fill="#ffffff" />
              <circle cx="23" cy="36.3" r="0.7" fill="#ffffff" opacity="0.9" />
            </g>
            <g className="magic-avatar__eye">
              <ellipse cx="40.5" cy="33" rx="6.2" ry="7.6" fill="#ffffff" />
              <circle className="magic-avatar__pupil" cx="41.2" cy="34.2" r="3.5" fill="#1e293b" />
              <circle cx="42.5" cy="32.6" r="1.35" fill="#ffffff" />
              <circle cx="40" cy="36.3" r="0.7" fill="#ffffff" opacity="0.9" />
            </g>
          </g>

          {/* الحواجب */}
          <path
            className="magic-avatar__brow"
            d="M18.5 22.5 Q 23.5 20.5 28 22.5"
            stroke="#065f46"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
          />
          <path
            className="magic-avatar__brow"
            d="M36 22.5 Q 40.5 20.5 45.5 22.5"
            stroke="#065f46"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
          />

          {/* الخدود */}
          <ellipse className="magic-avatar__blush" cx="15.5" cy="41" rx="3.2" ry="2" fill="#fb7185" opacity="0.5" />
          <ellipse className="magic-avatar__blush" cx="48.5" cy="41" rx="3.2" ry="2" fill="#fb7185" opacity="0.5" />

          {/* الفم: مبتسم مفتوح (افتراضي) / صغير مركّز (thinking) / قلقان (error) */}
          <g className="magic-avatar__mouth-happy">
            <path d="M26 43 Q 32 50.5 38 43 Z" fill="#134e4a" />
            <path d="M28.6 44.6 Q 32 47.6 35.4 44.6 Z" fill="#fb7185" />
          </g>
          <path
            className="magic-avatar__mouth-small"
            d="M28 45.5 Q 32 47.5 36 45.5"
            stroke="#134e4a"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <path
            className="magic-avatar__mouth-worried"
            d="M27 47.5 Q 32 43.5 37 47.5"
            stroke="#134e4a"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
          />

          {/* إيدين ورجلين صغيرتين */}
          <ellipse cx="7" cy="40" rx="4" ry="5.5" fill="#0f766e" transform="rotate(24 7 40)" />
          <ellipse cx="57" cy="40" rx="4" ry="5.5" fill="#0f766e" transform="rotate(-24 57 40)" />
          <ellipse cx="24" cy="59.5" rx="5" ry="3" fill="#0f766e" />
          <ellipse cx="40" cy="59.5" rx="5" ry="3" fill="#0f766e" />

          {/* لمعات سحرية حوالين الشخصية */}
          <path
            className="magic-avatar__sparkle"
            d="M11 12 L12 14.2 L14.2 15.2 L12 16.2 L11 18.4 L10 16.2 L7.8 15.2 L10 14.2 Z"
            fill="#fbbf24"
          />
          <path
            className="magic-avatar__sparkle"
            d="M53.5 13 L54.3 14.8 L56.1 15.6 L54.3 16.4 L53.5 18.2 L52.7 16.4 L50.9 15.6 L52.7 14.8 Z"
            fill="#fbbf24"
          />
        </g>

        <style>{`
          .magic-avatar { position: relative; }
          .magic-avatar__figure { transform-origin: 32px 36px; }
          .magic-avatar__eye { transform-box: fill-box; transform-origin: center; }
          .magic-avatar__pupil { transform-box: fill-box; transform-origin: center; }
          .magic-avatar__star, .magic-avatar__sparkle { transform-box: fill-box; transform-origin: center; }
          .magic-avatar__mouth-happy { transform-box: fill-box; transform-origin: center; }
          .magic-avatar__mouth-small, .magic-avatar__mouth-worried { opacity: 0; }

          /* idle: تمايل + رمش + لمعان هادئ */
          .magic-avatar--idle .magic-avatar__figure {
            animation: magic-bob 3.4s ease-in-out infinite;
          }
          .magic-avatar--idle .magic-avatar__eye {
            animation: magic-blink 4.4s ease-in-out infinite;
          }
          .magic-avatar--idle .magic-avatar__star {
            animation: magic-glow 2.6s ease-in-out infinite;
          }
          .magic-avatar--idle .magic-avatar__sparkle {
            animation: magic-twinkle 3.2s ease-in-out infinite;
          }

          /* thinking: ميلان + عيون بتلف + فم صغير مركّز */
          .magic-avatar--thinking .magic-avatar__figure {
            animation: magic-tilt 1.8s ease-in-out infinite;
          }
          .magic-avatar--thinking .magic-avatar__pupil {
            animation: magic-look 1.3s ease-in-out infinite alternate;
          }
          .magic-avatar--thinking .magic-avatar__mouth-happy { opacity: 0; }
          .magic-avatar--thinking .magic-avatar__mouth-small { opacity: 1; }
          .magic-avatar--thinking .magic-avatar__star {
            animation: magic-glow 1s ease-in-out infinite;
          }

          /* speaking: فم بيتحرك + توهج */
          .magic-avatar--speaking .magic-avatar__figure {
            filter: drop-shadow(0 0 6px rgba(16, 185, 129, 0.55));
          }
          .magic-avatar--speaking .magic-avatar__mouth-happy {
            animation: magic-talk 0.55s ease-in-out infinite;
          }
          .magic-avatar--speaking .magic-avatar__star {
            animation: magic-glow 1.2s ease-in-out infinite;
          }

          /* error: حزين ومعتم */
          .magic-avatar--error .magic-avatar__figure {
            filter: grayscale(0.85);
            opacity: 0.85;
          }
          .magic-avatar--error .magic-avatar__mouth-happy { opacity: 0; }
          .magic-avatar--error .magic-avatar__mouth-worried { opacity: 1; }
          .magic-avatar--error .magic-avatar__blush { opacity: 0.2; }

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
            0% { transform: translate(0, -1.2px); }
            50% { transform: translate(-1.5px, -0.6px); }
            100% { transform: translate(1.5px, -0.6px); }
          }
          @keyframes magic-glow {
            0%, 100% { opacity: 0.55; transform: scale(0.85); }
            50% { opacity: 1; transform: scale(1.18); }
          }
          @keyframes magic-twinkle {
            0%, 100% { opacity: 0.3; transform: scale(0.8) rotate(0deg); }
            50% { opacity: 1; transform: scale(1.15) rotate(20deg); }
          }
          @keyframes magic-talk {
            0%, 100% { transform: scaleY(1); }
            50% { transform: scaleY(0.45); }
          }

          @media (prefers-reduced-motion: reduce) {
            .magic-avatar--idle .magic-avatar__figure,
            .magic-avatar--idle .magic-avatar__eye,
            .magic-avatar--idle .magic-avatar__star,
            .magic-avatar--idle .magic-avatar__sparkle,
            .magic-avatar--thinking .magic-avatar__figure,
            .magic-avatar--thinking .magic-avatar__pupil,
            .magic-avatar--thinking .magic-avatar__star,
            .magic-avatar--speaking .magic-avatar__mouth-happy,
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
