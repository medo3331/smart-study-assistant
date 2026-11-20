'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import styles from './ExamShowcase.module.css';

/**
 * ═══════════════════════════════════════════════════════════════
 * عرض ميزة الامتحانات — سكرينات بتتحرك ورا بعض
 * ═══════════════════════════════════════════════════════════════
 *
 * ليه سكرينات **مرسومة** مش صور؟
 * ① بتفضل حادّة على أي شاشة وretina من غير أصول صور.
 * ② بتتغيّر مع نسخة التصميم — صورة قديمة بتكذب على الطالب.
 * ③ مافيش طلب شبكة إضافي على اللاندينج (مهم لـLCP).
 *
 * الحركة: تبديل تلقائي كل ~4.2 ثانية مع توقّف عند المرور/التركيز،
 * واحترام `prefers-reduced-motion` (مفيش تبديل تلقائي خالص).
 */

const AUTOPLAY_MS = 4200;

export default function ExamShowcase() {
  const { t } = useLanguage();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const steps = [
    { title: t.examsh_step1_title, desc: t.examsh_step1_desc },
    { title: t.examsh_step2_title, desc: t.examsh_step2_desc },
    { title: t.examsh_step3_title, desc: t.examsh_step3_desc },
    { title: t.examsh_step4_title, desc: t.examsh_step4_desc },
  ];
  const count = steps.length;

  useEffect(() => {
    if (paused) return;
    // ♿ حركة أقل = مفيش تبديل تلقائي (الطالب بيختار بنفسه).
    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const id = window.setInterval(() => {
      // بلاش نحرّك السكرين والتاب مخفي (توفير بطارية + مفيش قفزات).
      if (document.hidden) return;
      setActive((current) => (current + 1) % count);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [paused, count]);

  const go = (next: number) => setActive(((next % count) + count) % count);

  return (
    <section
      dir="rtl"
      id="exam-showcase"
      className={styles.section}
      aria-labelledby="exam-showcase-title"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <ScrollReveal className={styles.head}>
        <p className={styles.eyebrow}>{t.examsh_eyebrow}</p>
        <h2 id="exam-showcase-title">
          {t.examsh_title_a} <span className={styles.hl}>{t.examsh_title_b}</span>
        </h2>
        <p className={styles.lede}>{t.examsh_lede}</p>
      </ScrollReveal>

      <div className={styles.layout}>
        {/* الخطوات — أزرار بتتحكم في السكرين */}
        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <li key={step.title}>
              <button
                type="button"
                onClick={() => go(index)}
                aria-current={index === active ? 'step' : undefined}
                className={`${styles.step} ${index === active ? styles.stepActive : ''}`}
              >
                <span className={styles.num} aria-hidden>
                  {index + 1}
                </span>
                <span>
                  <span className={styles.stepTitle}>{step.title}</span>
                  <span className={styles.stepDesc}>{step.desc}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>

        {/* السكرين */}
        <div className={styles.stage}>
          <div className={styles.frame}>
            <div className={styles.chrome} aria-hidden>
              <span />
              <span />
              <span />
            </div>
            <div className={styles.screens}>
              {[<UploadScreen key="s1" />, <ShapeScreen key="s2" />, <QuestionScreen key="s3" />, <ResultScreen key="s4" />].map(
                (screen, index) => (
                  <div
                    key={index}
                    className={`${styles.screen} ${index === active ? styles.screenActive : ''}`}
                    aria-hidden={index !== active}
                  >
                    {screen}
                  </div>
                ),
              )}
            </div>
          </div>

          <div className={styles.controls}>
            <button
              type="button"
              onClick={() => go(active - 1)}
              className={styles.nav}
              aria-label={t.examsh_prev}
            >
              ›
            </button>
            <div className={styles.dots} aria-label={t.examsh_tab_label}>
              {steps.map((step, index) => (
                <button
                  key={step.title}
                  type="button"
                  onClick={() => go(index)}
                  className={`${styles.dot} ${index === active ? styles.dotActive : ''}`}
                  aria-label={step.title}
                  aria-current={index === active}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => go(active + 1)}
              className={styles.nav}
              aria-label={t.examsh_next}
            >
              ‹
            </button>
          </div>
        </div>
      </div>

      <div className={styles.ctaRow}>
        <a href="/exams?gen=1" className={styles.cta}>
          {t.examsh_cta}
        </a>
      </div>
    </section>
  );
}

/* ───────────────────────── السكرينات ───────────────────────── */

function UploadScreen() {
  return (
    <div className={styles.mock}>
      <p className={styles.mTitle}>١. ارفع محاضرتك</p>
      <p className={styles.mSub}>صوت أو PDF — إحنا بنستخرج النص مرة واحدة.</p>
      <div className={styles.drop}>
        <span className={styles.dropIcon} aria-hidden>
          ⬆
        </span>
        <span>اسحب الملف هنا أو اختار من جهازك</span>
      </div>
      <div className={styles.fileRow}>
        <span className={styles.fileIcon} aria-hidden>
          📄
        </span>
        <span className={styles.fileName}>محاضرة_القلب.pdf</span>
        <span className={styles.fileDone}>تم ✓</span>
      </div>
      <div className={styles.prog} aria-hidden>
        <span className={styles.progFill} style={{ width: '100%' }} />
      </div>
      <p className={styles.mHint}>تم استخراج ٦٩ صفحة وحفظها في مساحة عملك.</p>
    </div>
  );
}

function ShapeScreen() {
  return (
    <div className={styles.mock}>
      <p className={styles.mTitle}>٢. اختار شكل الامتحان</p>
      <p className={styles.mSub}>إنت اللي بتحدد — مفيش نسب مفروضة.</p>

      <p className={styles.mLabel}>أنواع الأسئلة</p>
      <div className={styles.chips}>
        <span className={`${styles.chip} ${styles.chipOn}`}>اختيار من متعدد ✓</span>
        <span className={`${styles.chip} ${styles.chipOn}`}>صح أو خطأ ✓</span>
        <span className={styles.chip}>مقالي</span>
      </div>

      <p className={styles.mLabel}>مستوى الصعوبة</p>
      <div className={styles.chips}>
        <span className={styles.chip}>سهل</span>
        <span className={`${styles.chip} ${styles.chipOn}`}>متوسط ✓</span>
        <span className={styles.chip}>صعب</span>
      </div>

      <p className={styles.mLabel}>عدد الأسئلة</p>
      <div className={styles.slider} aria-hidden>
        <span className={styles.sliderFill} style={{ width: '62%' }} />
        <span className={styles.sliderKnob} style={{ insetInlineStart: '62%' }}>
          12
        </span>
      </div>
    </div>
  );
}

function QuestionScreen() {
  return (
    <div className={styles.mock}>
      <div className={styles.qHead}>
        <span className={styles.qMeta}>سؤال ٥ من ١٢</span>
        <span className={styles.qPill}>اختيار من متعدد</span>
      </div>
      <p className={styles.qText}>أي وصف ينطبق على الصمام الميترالي؟</p>
      <ul className={styles.opts}>
        <li className={styles.opt}>يسمح بالمرور في اتجاه واحد</li>
        <li className={`${styles.opt} ${styles.optOn}`}>
          يمنع الرجوع من البطين للأذين
          <span className={styles.optMark} aria-hidden>
            ✓
          </span>
        </li>
        <li className={styles.opt}>ينقل الدم للرئتين</li>
        <li className={styles.opt}>يفرز هرمونات القلب</li>
      </ul>
      <div className={styles.qFoot}>
        <span className={styles.saveChip}>محفوظ تلقائياً ✓</span>
        <span className={styles.dotsSmall} aria-hidden>
          ● ● ● ○ ○
        </span>
      </div>
    </div>
  );
}

function ResultScreen() {
  const topics = [
    { name: 'الصمامات', percent: 35 },
    { name: 'الدورة الدموية', percent: 62 },
    { name: 'تخطيط القلب', percent: 88 },
  ];
  return (
    <div className={styles.mock}>
      <div className={styles.scoreHead}>
        <span className={styles.score}>٧٣٪</span>
        <span className={styles.scoreMeta}>١١ من ١٥ درجة</span>
      </div>
      <p className={styles.mTitle}>تقييمك حسب أجزاء المحاضرة</p>
      <p className={styles.mSub}>
        أضعف جزء عندك <strong>«الصمامات»</strong> — راجعه تاني قبل الامتحان.
      </p>
      <ul className={styles.bars}>
        {topics.map((topic) => (
          <li key={topic.name} className={styles.barRow}>
            <span className={styles.barName}>{topic.name}</span>
            <span className={styles.bar} aria-hidden>
              <span
                className={`${styles.barFill} ${
                  topic.percent >= 75 ? styles.barGood : topic.percent >= 50 ? styles.barMid : styles.barLow
                }`}
                style={{ width: `${topic.percent}%` }}
              />
            </span>
            <span className={styles.barPct}>{topic.percent}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
