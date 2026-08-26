"use client";

import React from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

/* ==========================================================================
   صورة الحساب المتحركة في الترويسة (الهيرو)
   مهاجَرة من مفهوم AvatarOrbit في magicly (feat/dashboard-premium-saas)
   ومُعاد بناؤها على معمارية المشروع الحالي:

   - الحرف في النص ثابت وواضح دايماً — مش بيلف.
   - حلقة مدار أساسية بتلف ببطء وعليها نقطتين متوهجتين.
   - حلقة ثانية متقطعة بتلف بالعكس أهدى بكثير.
   - توهّج محيطي ناعم بنفسجي/أزرق (هوية ماجيكلي الليلية).
   - دخول: الحجم من ٠٫٩٢ لـ ١ ثم المدار يظهر، وبعدها طفاوة خفيفة مستمرة.
   - مع prefers-reduced-motion: كل ده بيقف — صورة ثابتة بدون حركة.
   ========================================================================== */

interface HeroAvatarProps {
  /** الحرف الأول من اسم المستخدم. */
  initial: string;
  displayName: string;
}

export function HeroAvatar({ initial, displayName }: HeroAvatarProps) {
  const reduced = useReducedMotion();

  return (
    // الغلاف الخارجي: الطفاوة الهادية بعد الدخول (واحدة بس — مش طبقتين حركة)
    <motion.div
      className="relative shrink-0"
      initial={reduced ? false : { scale: 0.92, opacity: 0 }}
      animate={reduced ? { scale: 1, opacity: 1 } : { scale: 1, opacity: 1 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <motion.div
        animate={reduced ? undefined : { y: [0, -3, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="relative"
      >
        <div className="hero-avatar h-28 w-28 sm:h-32 sm:w-32" aria-hidden={false}>
          {/* التوهّج المحيطي */}
          <span aria-hidden className="hero-avatar-glow" />

          {/* الحلقة الثانوية المتقطعة — بتلف بالعكس ببطء شديد */}
          <motion.span
            aria-hidden
            className="hero-avatar-ring"
            animate={reduced ? undefined : { rotate: -360 }}
            transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
          />

          {/* حلقة المدار الأساسية + النقطتين — بتفضل تدور بهدوء */}
          <motion.span
            aria-hidden
            className="hero-avatar-orbit"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1, ...(reduced ? {} : { rotate: 360 }) }}
            transition={
              reduced
                ? { duration: 0.3, delay: 0.15 }
                : { opacity: { duration: 0.5, delay: 0.18 }, rotate: { duration: 16, repeat: Infinity, ease: "linear", delay: 0.18 } }
            }
          >
            <span className="hero-avatar-dot" />
            <span className="hero-avatar-dot hero-avatar-dot--b" />
          </motion.span>

          {/* القرص المركزي: الحرف نفسه — ثابت ومقروء */}
          <motion.div
            role="img"
            aria-label={`صورة حساب ${displayName}`}
            className="hero-avatar-disc"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.08 }}
          >
            <span className="font-display font-extrabold text-4xl sm:text-5xl leading-none select-none">
              {initial}
            </span>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
