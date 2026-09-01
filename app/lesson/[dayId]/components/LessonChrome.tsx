"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";

/* ==========================================================================
   عناصر الهيكل المشتركة لصفحة الدرس — نفس نظام الداشبورد المنفَّذ حرفيًا:
   خلفية var(--app-bg) · كروت var(--card-primary) · حدود var(--border) · أكسنت var(--accent)
   ثيم متزامن مع الداشبورد (يقرأ data-theme من :root) + دخول متتابع مرة واحدة
   ========================================================================== */
/** الطبقة الخلفية الثابتة + غلاف الصفحة + طبقة توافق — ثيم موحّد مع الداشبورد. */
export function LessonShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen" dir="rtl">
      {/* الخلفية: var(--app-bg) + هالتان بالأكسنت (ثيم-aware — تتغير مع اختيار المستخدم) */}
      <div aria-hidden className="fixed inset-0 -z-10 bg-[var(--app-bg)]" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(52% 42% at 85% -4%, color-mix(in srgb, var(--accent) 13%, transparent) 0%, transparent 62%), radial-gradient(40% 34% at 6% 100%, color-mix(in srgb, var(--accent-highlight) 7%, transparent) 0%, transparent 60%)",
        }}
      />
      {/* طبقة التوافق: كلاسات الورقة القديمة (sheet-card/btn/field/tag...) بتترسم بمتغيرات الثيم الموحدة — نفس الداشبورد */}
      <style>{LESSON_DARK_COMPAT}</style>
      <div className="magicly-lesson">{children}</div>
    </div>
  );
}

/* أنماط التوافق — نطاقها مغلق داخل .magicly-lesson فقط — ثيم موحّد مع الداشبورد */
const LESSON_DARK_COMPAT = `
.magicly-lesson .sheet-card{background:color-mix(in srgb, var(--card-primary) 85%, transparent);border:1px solid var(--border);backdrop-filter:blur(20px);box-shadow:0 8px 30px var(--shadow)}
.magicly-lesson .sheet-card-live{border-top:1px solid color-mix(in srgb, var(--accent) 25%, transparent)}
.magicly-lesson .eyebrow{color:var(--accent-highlight)}
.magicly-lesson .h1,.magicly-lesson .h2,.magicly-lesson .h3{color:var(--text)}
.magicly-lesson .tag{background:var(--card-secondary);color:var(--muted);border:1px solid var(--border)}
.magicly-lesson .tag-quiet{background:transparent}
.magicly-lesson .text-ink{color:var(--text)}
.magicly-lesson .text-ink-soft{color:var(--muted)}
.magicly-lesson .bg-paper,.magicly-lesson .bg-paper-2,.magicly-lesson .bg-paper-3{background:var(--card-primary)!important;border-color:var(--border)}
.magicly-lesson .border-rule{border-color:var(--border)}
.magicly-lesson .field{background:var(--card-secondary);border:1px solid var(--border);color:var(--text)}
.magicly-lesson .field::placeholder{color:var(--muted)}
.magicly-lesson .btn{border-radius:14px;font-weight:600}
.magicly-lesson .btn-quiet{background:var(--card-secondary);border:1px solid var(--border);color:var(--muted)}
.magicly-lesson .btn-quiet:hover{background:color-mix(in srgb, var(--card-secondary) 85%, var(--text) 8%);color:var(--text)}
.magicly-lesson .btn-marker{background:var(--accent);border-color:var(--accent);color:var(--on-marker);box-shadow:0 6px 20px color-mix(in srgb, var(--accent) 35%, transparent)}
.magicly-lesson .btn-marker:hover{filter:brightness(1.08)}
.magicly-lesson .meter{background:var(--border)}
.magicly-lesson .meter-fill{background:linear-gradient(to left,var(--accent-highlight),var(--accent))}
.magicly-lesson .notice-ok{background:color-mix(in srgb, var(--accent) 10%, transparent);border:1px solid color-mix(in srgb, var(--accent) 30%, transparent)}
.magicly-lesson .notice-error{background:color-mix(in srgb, var(--redpen) 10%, transparent);border:1px solid color-mix(in srgb, var(--redpen) 35%, transparent)}
.magicly-lesson .stamp{border-radius:16px}
`;

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  /** خيط بنفسجي رفيع أعلى الكارت — للعناصر الأبرز فقط. */
  glow?: boolean;
}

/** الكارت الزجاجي الموحّد — نفس معاملة كروت الداشبورد — ثيم-aware. */
export function GlassCard({ children, className, glow }: GlassCardProps) {
  return (
    <div
      className={
        "relative overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--card-primary)]/70 backdrop-blur-xl shadow-[0_8px_30px_var(--shadow)]" +
        (className ? ` ${className}` : "")
      }
    >
      {glow && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(to left, transparent, color-mix(in srgb, var(--accent) 55%, transparent), transparent)",
          }}
        />
      )}
      {children}
    </div>
  );
}

interface RevealProps {
  children: React.ReactNode;
  /** ترتيب الدخول المتتابع. */
  index?: number;
  delay?: number;
  className?: string;
}

/** ظهور واحد (Fade + Slide) بتوقيت متتابع حسب الترتيب. */
export function Reveal({ children, index = 0, delay, className }: RevealProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45,
        delay: delay ?? 0.05 * index,
        ease: [0.22, 0.8, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
