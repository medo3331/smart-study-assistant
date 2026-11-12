import { cn } from "@/lib/cn";

/* ==========================================================================
   🪄 MagiclyLoader — شاشة التحميل الموحّدة

   العلامة نفسها (حرف M + النجمة) من `BrandGlyph`، بس متحرّكة:
   - ضربة القلم بتترسم (SVG path drawing) — أخف من أي JS animation.
   - النجمة بتنبض بعد ما الرسم يخلص.
   - نقطة صغيرة بتلف حوالين العلامة.

   ⚠️ ليه SVG + CSS مش framer-motion: الشاشة دي بتظهر قبل أي محتوى،
   فمش عايزين نحمّل مكتبة أنيميشن عشان حرف واحد. الـ CSS كله في
   `globals.css` تحت `.magicly-loader`، و`prefers-reduced-motion`
   بيوقف الحركة ويسب الرسم ثابت.
   ========================================================================== */

interface MagiclyLoaderProps {
  /** النص تحت العلامة. `null` يخفي السطر خالص. */
  label?: string | null;
  /** مقاس العلامة بالبكسل. */
  size?: number;
  className?: string;
}

export function MagiclyLoader({ label = "بنجهّز حاجتك…", size = 88, className }: MagiclyLoaderProps) {
  return (
    <div
      className={cn("magicly-loader", className)}
      role="status"
      aria-live="polite"
      style={{ ["--magicly-loader-size" as string]: `${size}px` }}
    >
      <span className="magicly-loader-mark" aria-hidden>
        <svg viewBox="0 0 56.87 45" className="magicly-loader-svg">
          <path
            className="magicly-loader-stroke"
            d="M4.15 40.8L4.15 5.8L23.67 22.55L39.47 5.6"
            pathLength={1}
            fill="none"
            stroke="currentColor"
            strokeWidth="8.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            className="magicly-loader-star"
            d="M48.17 0Q48.17 8.65 56.87 8.65Q48.17 8.65 48.17 17.3Q48.17 8.65 39.47 8.65Q48.17 8.65 48.17 0Z"
            fill="currentColor"
          />
        </svg>
        <span className="magicly-loader-dot" />
      </span>
      {label ? <p className="magicly-loader-label">{label}</p> : null}
    </div>
  );
}
