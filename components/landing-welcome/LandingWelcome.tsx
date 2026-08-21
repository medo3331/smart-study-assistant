'use client';

import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import styles from './LandingWelcome.module.css';

const STORAGE_KEY = 'magicly_welcome_seen';
const SLIDE_DURATION = 4500;
const SWIPE_THRESHOLD = 48;

const slides = [
  {
    emoji: '👋',
    title: 'نورتنا',
    description: 'حاسس إن المذاكرة تقيلة؟ تايه ومش عارف تبدأ منين؟\nصديقك ماجيكلي معاك، متقلقش.',
    tone: 'light',
  },
  {
    emoji: '📚',
    title: 'افهم',
    description: 'ارفع محاضراتك، وماجيكلي يشرحها بالطريقة اللي تريحك — عملي، مرئي، أو أكاديمي.',
    tone: 'navy',
  },
  {
    emoji: '✍️',
    title: 'ذاكر',
    description: 'اختبر نفسك، اعمل ملخص، راجع، واسأل ماجيك عن أي حاجة وقفت معاك.',
    tone: 'light',
  },
  {
    emoji: '🗂️',
    title: 'نظّم',
    description: 'خطط وقتك، تابع تقدمك، وعندك وضع الطوارئ 🚨 لو دخلت زنقة الكلاب😁.',
    tone: 'rose',
  },
  {
    emoji: '🏆',
    title: 'عندنا مسابقات أسبوعية واوقات للتسلية عشان متحسش بملل',
    description: 'اكسب XP وكوينز وانت بتذاكر، اتنافس مع أصحابك في الصدارة، وافتح حاجات جديدة في المتجر.',
    tone: 'navy',
  },
  {
    emoji: '✨',
    title: 'جاهز تبدأ تذاكر أذكى؟',
    description: 'جرّب ماجيكلي بطريقتك، وخلي أول خطوة أسهل.',
    tone: 'light',
    cta: true,
  },
] as const;

type Direction = 1 | -1;

const slideVariants = {
  enter: (direction: Direction) => ({ opacity: 0, x: direction * 20 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: Direction) => ({ opacity: 0, x: direction * -20 }),
};

export function LandingWelcome() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [direction, setDirection] = useState<Direction>(1);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();

  const close = () => setOpen(false);

  const openTour = () => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDirection(1);
    setActiveSlide(0);
    setOpen(true);
  };

  const goNext = () => {
    setDirection(1);
    setActiveSlide((current) => Math.min(current + 1, slides.length - 1));
  };

  const goPrevious = () => {
    setDirection(-1);
    setActiveSlide((current) => Math.max(current - 1, 0));
  };

  // لا نقرأ localStorage قبل الـ hydration حتى لا يختلف أول رندر عن السيرفر.
  useEffect(() => {
    setMounted(true);

    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) {
        restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setOpen(true);
        window.localStorage.setItem(STORAGE_KEY, 'true');
      }
    } catch {
      // تظل القصة قابلة للفتح يدوياً في المتصفحات التي تمنع التخزين المحلي.
    }
  }, []);

  // كل سلايد غير أخير تمكث 4.5 ثانية. الختامية تظل ظاهرة ليختار الزائر بنفسه.
  useEffect(() => {
    if (!open || activeSlide === slides.length - 1) return;

    const timer = window.setTimeout(goNext, SLIDE_DURATION);
    return () => window.clearTimeout(timer);
  }, [activeSlide, open]);

  useEffect(() => {
    if (!open) {
      restoreFocusRef.current?.focus();
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrevious();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const onTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    const startX = touchStartX.current;
    const endX = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (startX === null || endX === undefined || Math.abs(endX - startX) < SWIPE_THRESHOLD) return;

    // منطقيًا في RTL: سحب يمين = إلى الأمام، وسحب يسار = إلى الخلف.
    if (endX > startX) goNext();
    else goPrevious();
  };

  if (!mounted) return null;

  const current = slides[activeSlide];

  return (
    <>
      <button
        type="button"
        className={`btn btn-quiet btn-compact ${styles.trigger}`}
        onClick={openTour}
        aria-label="عرّفني على ماجيكلي"
      >
        <span aria-hidden="true">؟</span>
        <span className={styles.triggerLabel}>عرّفني على ماجيكلي</span>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className={styles.overlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.18 }}
            >
              <motion.section
                ref={dialogRef}
                className={`${styles.modal} ${styles[`tone${current.tone[0].toUpperCase()}${current.tone.slice(1)}`]}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="magicly-welcome-title"
                aria-describedby="magicly-welcome-description"
                dir="rtl"
                initial={reducedMotion ? false : { opacity: 0, y: 14, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
                transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                onTouchStart={(event) => {
                  touchStartX.current = event.touches[0]?.clientX ?? null;
                }}
                onTouchEnd={onTouchEnd}
              >
                <div className={styles.progress} aria-label={`السلايد ${activeSlide + 1} من ${slides.length}`}>
                  {slides.map((_, index) => (
                    <span key={index} className={index < activeSlide || activeSlide === slides.length - 1 ? styles.progressDone : undefined}>
                      {index === activeSlide && activeSlide !== slides.length - 1 && (
                        <motion.i
                          key={activeSlide}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: SLIDE_DURATION / 1000, ease: 'linear' }}
                          style={{ transformOrigin: 'right' }}
                        />
                      )}
                    </span>
                  ))}
                </div>

                <button ref={closeButtonRef} type="button" className={styles.close} onClick={close} aria-label="إغلاق الترحيب">
                  <span aria-hidden="true">×</span>
                </button>
                <button type="button" className={styles.skip} onClick={close}>تخطي</button>

                <button type="button" className={`${styles.tapZone} ${styles.tapPrevious}`} onClick={goPrevious} tabIndex={-1} aria-label="السلايد السابق" />
                <button type="button" className={`${styles.tapZone} ${styles.tapNext}`} onClick={goNext} tabIndex={-1} aria-label="السلايد التالي" />

                <div className={styles.slideViewport}>
                  <AnimatePresence mode="wait" custom={direction}>
                    <motion.article
                      key={activeSlide}
                      custom={direction}
                      variants={slideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className={styles.slide}
                    >
                      <span className={styles.emoji} aria-hidden="true">{current.emoji}</span>
                      <p className={styles.counter}>{activeSlide + 1} / {slides.length}</p>
                      <h2 id="magicly-welcome-title" className={styles.title}>{current.title}</h2>
                      <p id="magicly-welcome-description" className={styles.description}>{current.description}</p>

                      {'cta' in current && current.cta && (
                        <Link href="/demo" className={`btn btn-marker ${styles.cta}`} onClick={close}>
                          جرّب من غير حساب
                        </Link>
                      )}
                    </motion.article>
                  </AnimatePresence>
                </div>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
