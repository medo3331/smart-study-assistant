"use client";

/* ==========================================================================
   ماجيك — الشخصية
   مرسوم SVG بالإيد، مش صورة. سببين: (١) يتلوّن مع قلم الثيم و data-theme
   لوحده لأن كل لون هنا currentColor أو توكن، (٢) يفضل حادّ في أي حجم
   ومايزوّدش بايت واحد على التحميل.

   نية الرسم: مش روبوت SaaS لامع. ده "طلاّب" صغير مرسوم بقلم على هامش
   الملزمة — خطوط خارجية بلون الحبر، وحشوة بلون الورق، والقلم الملوّن
   بيظهر في حاجتين بس: الشاشة/الوش وسنّ القلم اللي في إيده.

   الحجم بيتحكم من بره بـ className (w-* h-*)، والـ viewBox مربّع
   عشان يفضل متمركز في أي حجم.
   ========================================================================== */

interface MagicMascotProps {
  /** كلاس Tailwind للحجم — المفروض تبعت w/h */
  className?: string;
  /** لون القلم للشاشة وسنّ القلم — كلاس نص من Tailwind (text-amber-500 مثلاً) */
  accentClassName?: string;
  /** بيرفع الإيد ويهزّ الرأس بشكل خفيف — بيتشغّل لما يكون فيه مهام */
  waving?: boolean;
}

export function MagicMascot({
  className = "w-16 h-16",
  accentClassName = "text-amber-500",
  waving = false,
}: MagicMascotProps) {
  return (
    <svg
      viewBox="0 0 96 96"
      className={className}
      role="img"
      aria-label="ماجيك، مساعد المذاكرة"
      fill="none"
      // الخطوط كلها بترث لون الحبر من الأب، فالرسمة بتقلب مع الثيم لوحدها
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* ---- ضل خفيف تحته: بيثبّته على الورقة بدل ما يبقى طاير ---- */}
      <ellipse cx="48" cy="88" rx="24" ry="3.5" fill="var(--shade)" stroke="none" />

      {/* ---- الهوائي ---- */}
      <line x1="48" y1="18" x2="48" y2="26" />
      <circle cx="48" cy="15" r="3.5" fill="var(--paper-2)" />

      {/* ---- الرأس: مربّع بزوايا مدوّرة، الورق جوّه والحبر برّه ---- */}
      <rect x="24" y="26" width="48" height="38" rx="12" fill="var(--paper-2)" />

      {/* الشاشة: هي دي بقعة لون القلم الأولى */}
      <rect
        x="31"
        y="33"
        width="34"
        height="22"
        rx="7"
        className={accentClassName}
        fill="currentColor"
        stroke="none"
      />

      {/* عينين + بُقعتين لمعة. الحبر جوّه الشاشة عشان يفضل مقروء
          في الثيم الفاتح والغامق. */}
      <circle cx="41" cy="43" r="3.2" fill="currentColor" stroke="none" />
      <circle cx="55" cy="43" r="3.2" fill="currentColor" stroke="none" />
      <circle cx="42.2" cy="41.8" r="1" fill="var(--paper-2)" stroke="none" />
      <circle cx="56.2" cy="41.8" r="1" fill="var(--paper-2)" stroke="none" />

      {/* بسمة صغيرة */}
      <path d="M42 49.5c2 2.2 10 2.2 12 0" strokeWidth={2} />

      {/* الودان */}
      <path d="M24 40h-4v9h4M72 40h4v9h-4" />

      {/* ---- الجسم: ورقة مطويّة — إشارة إنه من نفس الملزمة ---- */}
      <path d="M32 64h32a6 6 0 0 1 6 6v10a4 4 0 0 1-4 4H30a4 4 0 0 1-4-4V70a6 6 0 0 1 6-6z" fill="var(--paper-2)" />

      {/* سطرين على الصدر — سطور الكشكول */}
      <line x1="34" y1="72" x2="62" y2="72" strokeWidth={1.6} stroke="var(--rule-strong)" />
      <line x1="34" y1="78" x2="54" y2="78" strokeWidth={1.6} stroke="var(--rule-strong)" />

      {/* ---- الإيد الشمال: بتحمل قلم، وسنّه هو بقعة اللون التانية ---- */}
      <g className={waving ? "magic-wave" : undefined} style={{ transformOrigin: "26px 70px" }}>
        <line x1="26" y1="70" x2="15" y2="62" />
        <line x1="15" y1="62" x2="11" y2="53" strokeWidth={2.8} />
        <path d="M10.4 50.6l1.2-3.4 1.2 3.4z" className={accentClassName} fill="currentColor" stroke="none" />
      </g>

      {/* ---- الإيد اليمين على الورقة ---- */}
      <line x1="70" y1="70" x2="80" y2="76" />
    </svg>
  );
}
