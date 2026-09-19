'use client';

import { motion, useReducedMotion } from 'framer-motion';

interface ScrollRevealProps {
  children: React.ReactNode;
  /** تأخير بالثواني (لترتيب الكروت واحد ورا التاني). */
  delay?: number;
  /** مسافة الانزلاق الرأسي بالبكسل. */
  y?: number;
  /** true = الحركة بتتحط أول ما العنصر يبان بس (الافتراضي). */
  once?: boolean;
  className?: string;
}

/**
 * Scroll-reveal: العنصر fade/slide-in أول ما يدخل الـ viewport أثناء السكرول.
 *
 * - `whileInView` + `viewport: { once: true }` = IntersectionObserver من
 *   جوّه framer-motion — مبيشتغلش كل سكرول ولا بيمسك مستمعين زيادة.
 * - `useReducedMotion` = اللي عنده prefers-reduced-motion في النظام بيقلع
 *   الانزلاق (y = 0) فمابقاش غير fade خفيف — مش سكون تام عشان العنصر
 *   مايبقاش مخبي عن نفسه.
 * - initial بيحدد opacity 0 فقط قبل أول رندر — لا حاجة لحالة JS زيادة.
 */
export function ScrollReveal({
  children,
  delay = 0,
  y = 24,
  once = true,
  className,
}: ScrollRevealProps) {
  const reduceMotion = useReducedMotion();
  const distance = reduceMotion ? 0 : y;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-60px 0px' }}
      transition={{ duration: 0.55, delay: reduceMotion ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
