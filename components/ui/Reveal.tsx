"use client";

import { motion } from "framer-motion";

interface RevealProps {
  children: React.ReactNode;
  /** Stagger index — higher = appears later. */
  index?: number;
  className?: string;
  /** Slide distance in px (RTL: enters from the right). */
  y?: number;
}

/**
 * Lightweight staggered fade/slide-in on load. Animation runs once (no repeat).
 * Wrap each section/card in <Reveal index={n}> to cascade them. Respects
 * prefers-reduced-motion through framer-motion's reducedMotion handling.
 */
export function Reveal({ children, index = 0, className, y = 16 }: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: index * 0.08,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
