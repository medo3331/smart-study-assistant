"use client";

interface MagicOrbProps {
  level: number;
  /** Optional aria label override; defaults to LV badge text. */
  ariaLabel?: string;
}

/**
 * MagicOrb — glass glowing sphere (Phase 2)
 *
 * تصميم زجاجي مضيء يعتمد بالكامل على متغيرات الثيم:
 * --accent / --accent-highlight / --on-marker
 * بدون أي لون hard-coded.
 *
 * - radial gradient + highlight علوي يساري
 * - outer glow ناعم
 * - breathing 3.6s (opacity + blur + shadow)
 * - 6 particles تدور 24s linear
 * - LV badge أسفل الكرة
 * - يحترم prefers-reduced-motion عبر CSS
 */
export function MagicOrb({ level, ariaLabel }: MagicOrbProps) {
  return (
    <div
      className="magic-orb-wrap"
      role="img"
      aria-label={ariaLabel ?? `صورة حسابك — المستوى ${level}`}
    >
      {/* Glow خلفي يتنفس */}
      <span aria-hidden className="magic-orb-glow" />

      {/* مدار الجسيمات */}
      <span aria-hidden className="magic-orb-orbit">
        <span className="magic-orb-dot" style={{ ["--angle" as string]: "0deg" } as React.CSSProperties} />
        <span className="magic-orb-dot" style={{ ["--angle" as string]: "60deg" } as React.CSSProperties} />
        <span className="magic-orb-dot" style={{ ["--angle" as string]: "120deg" } as React.CSSProperties} />
        <span className="magic-orb-dot" style={{ ["--angle" as string]: "180deg" } as React.CSSProperties} />
        <span className="magic-orb-dot" style={{ ["--angle" as string]: "240deg" } as React.CSSProperties} />
        <span className="magic-orb-dot" style={{ ["--angle" as string]: "300deg" } as React.CSSProperties} />
      </span>

      {/* الكرة الزجاجية */}
      <div className="magic-orb-core" aria-hidden>
        <span className="magic-orb-highlight" />
        <span className="magic-orb-inner" />
      </div>

      {/* شارة المستوى */}
      <span className="magic-orb-badge" dir="ltr">
        LV {level}
      </span>
    </div>
  );
}

/** Alias للتوافق — نفس الملف كان يصدّر HeroAvatar كـ dead code. */
export function HeroAvatar({ initial: _initial, displayName }: { initial: string; displayName: string }) {
  // fallback بسيط لو استُخدم في مكان قديم — يعرض Orb بمستوى 1
  void _initial;
  void displayName;
  return <MagicOrb level={1} />;
}

export default MagicOrb;
