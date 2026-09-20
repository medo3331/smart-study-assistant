'use client';

import { motion, useReducedMotion } from 'framer-motion';

interface ScrollRevealProps {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  once?: boolean;
  className?: string;
}

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
