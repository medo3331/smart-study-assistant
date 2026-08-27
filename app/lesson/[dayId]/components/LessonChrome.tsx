"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";

/* ==========================================================================
   عناصر الهيكل المشتركة لصفحة الدرس — نفس نظام الداشبورد المنفَّذ حرفيًا:
   خلفية ‎#0A0806 · كروت زجاجية ‎#0D0906@70% · حدود white/[0.06]
   دخول متتابع مرة واحدة مع احترام prefers-reduced-motion.
   ========================================================================== */

/** الطبقة الخلفية الثابتة + غلاف الصفحة + طبقة توافق مظلمة للأنماط الورقية القديمة. */
export function LessonShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen" dir="rtl">
      {/* الخلفية: لون صلب + هالتان خفيفتان ثابتتان (بدون أنيميشن) */}
      <div aria-hidden className="fixed inset-0 -z-10 bg-[#0A0806]" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(52% 42% at 85% -4%, rgba(220,76,76,0.13) 0%, transparent 62%), radial-gradient(40% 34% at 6% 100%, rgba(45,212,191,0.07) 0%, transparent 60%)",
        }}
      />
      {/* طبقة التوافق: نفس كلاسات الورقة القديمة (sheet-card/btn/field/tag...)
          بتترسم بألوان النظام الداكن جوّه صفحة الدرس بس — عشان الأقسام
          المحفوظة (شات/مصادر/اختبار/احتفال) تفضل شغالة كما هي بدون إعادة كتابة. */}
      <style>{LESSON_DARK_COMPAT}</style>
      <div className="magicly-lesson">{children}</div>
    </div>
  );
}

/* أنماط التوافق — نطاقها مغلق داخل .magicly-lesson فقط */
const LESSON_DARK_COMPAT = `
.magicly-lesson .sheet-card{background:rgba(13,16,41,.7);border:1px solid rgba(255,255,255,.06);backdrop-filter:blur(20px);box-shadow:0 8px 30px rgba(0,0,0,.35)}
.magicly-lesson .sheet-card-live{border-top:1px solid rgba(220,76,76,.25)}
.magicly-lesson .eyebrow{color:#F5A25C}
.magicly-lesson .h1,.magicly-lesson .h2,.magicly-lesson .h3{color:#fff}
.magicly-lesson .tag{background:rgba(255,255,255,.05);color:#9AA0C0;border:1px solid rgba(255,255,255,.07)}
.magicly-lesson .tag-quiet{background:transparent}
.magicly-lesson .text-ink{color:#E7E9F5}
.magicly-lesson .text-ink-soft{color:#9AA0C0}
.magicly-lesson .bg-paper,.magicly-lesson .bg-paper-2,.magicly-lesson .bg-paper-3{background:rgba(255,255,255,.03)!important;border-color:rgba(255,255,255,.08)}
.magicly-lesson .border-rule{border-color:rgba(255,255,255,.08)}
.magicly-lesson .field{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#E7E9F5}
.magicly-lesson .field::placeholder{color:#9AA0C0}
.magicly-lesson .btn{border-radius:14px;font-weight:600}
.magicly-lesson .btn-quiet{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#9AA0C0}
.magicly-lesson .btn-quiet:hover{background:rgba(255,255,255,.08);color:#E7E9F5}
.magicly-lesson .btn-marker{background:#DC4C4C;border-color:#DC4C4C;color:#fff;box-shadow:0 6px 20px rgba(220,76,76,.35)}
.magicly-lesson .btn-marker:hover{background:#F2745C}
.magicly-lesson .meter{background:rgba(255,255,255,.07)}
.magicly-lesson .meter-fill{background:linear-gradient(to left,#F5A25C,#DC4C4C)}
.magicly-lesson .notice-ok{background:rgba(45,212,191,.1);border:1px solid rgba(45,212,191,.3)}
.magicly-lesson .notice-error{background:rgba(206,90,108,.1);border:1px solid rgba(206,90,108,.35)}
.magicly-lesson .stamp{border-radius:16px}
`;

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  /** خيط بنفسجي رفيع أعلى الكارت — للعناصر الأبرز فقط. */
  glow?: boolean;
}

/** الكارت الزجاجي الموحّد — نفس معاملة كروت الداشبورد. */
export function GlassCard({ children, className, glow }: GlassCardProps) {
  return (
    <div
      className={
        "relative overflow-hidden rounded-[24px] border border-white/[0.06] bg-[#0D0906]/70 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.35)]" +
        (className ? ` ${className}` : "")
      }
    >
      {glow && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(to left, transparent, rgba(220,76,76,0.55), transparent)",
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
