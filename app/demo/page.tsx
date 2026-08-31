'use client';
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */

/**
 * 🎁 صفحة الديمو المفتوحة — الزائر بيجرّب قبل ما يعمل حساب.
 *
 * التدفق: يختار ملف (بتاعه أو الملزمة الجاهزة) ← بيترفع على /api/demo
 * ← شريط مراحل أثناء الانتظار ← النتيجة كاملة ← دعوة للتسجيل.
 *
 * ⚠️ المراحل اللي بتتعرض أثناء الانتظار **تقديرية**: الراوت بيرجّع مرة
 * واحدة في الآخر، مش بيبثّ تقدّم حقيقي. عشان كده مكتوب "بقرا الملف"
 * مش "٣٠٪". الفرق مهم — نسبة مئوية مزيفة كذب صريح، أما وصف المرحلة
 * فده تقدير أمين للي بيحصل فعلاً على السيرفر بالترتيب ده.
 *
 * ⚠️ ميزانية اللون: ضربة .mark واحدة في العنوان بس. النتيجة كلها
 * بتتعلّم بالحبر والحدود — لو كل قسم أخد أصفر الصفحة تبقى حايط أصفر.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { BrandLock } from '@/components/BrandLogo';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { TopControls } from '@/components/TopControls';

const EASE = [0.22, 1, 0.36, 1] as const;

/** لازم يطابق حدود الراوت — بنمنع الرفع بدري بدل ما نستنى رد ٤١٣. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1024 * 1024;

type DemoResult = {
  title: string;
  language: 'ar' | 'en';
  summary: string[];
  flashcards: { q: string; a: string }[];
  quiz: { question: string; choices: string[]; answerIndex: number; why: string };
  plan: { day: number; title: string; desc: string }[];
};

type Phase = 'idle' | 'working' | 'done' | 'error';

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M20 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5V14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function BackArrow({ rtl }: { rtl: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={rtl ? 'M5 12h14M12 5l-7 7 7 7' : 'M19 12H5M12 19l-7-7 7-7'} />
    </svg>
  );
}

export default function DemoPage() {
  const { t } = useLanguage();
  const reduced = useReducedMotion();
  const isRtl = t.dir === 'rtl';

  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [flipped, setFlipped] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const steps = [t.demo_step_read, t.demo_step_think, t.demo_step_build];

  /* المراحل بتتقدّم بالوقت وبتقف عند الأخيرة — الراوت مش بيبثّ تقدّم،
     فالمرحلة الأخيرة بتفضل ظاهرة لحد ما الرد يوصل مهما طال. */
  useEffect(() => {
    if (phase !== 'working') return;
    setStep(0);
          const timers = [
      setTimeout(() => setStep(1), 2200),
      setTimeout(() => setStep(2), 5200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  /* بعد ما النتيجة تظهر، التركيز بينتقل لها. من غير كده مستخدم الكيبورد
     أو قارئ الشاشة يفضل واقف عند الزرار ومش عارف إن فيه حاجة اتغيّرت
     تحت في الصفحة. */
  useEffect(() => {
    if (phase === 'done' && resultRef.current) {
      resultRef.current.focus();
    }
  }, [phase]);

  const validateAndSet = useCallback(
    (next: File) => {
      const isImage = next.type.startsWith('image/');
      const limit = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
      if (next.size > limit) {
        setError(t.demo_err_size);
        setPhase('error');
        return;
      }
      setFile(next);
      setError('');
      setPhase('idle');
    },
    [t]
  );

  async function run(chosen: File) {
    setPhase('working');
    setError('');
    setResult(null);
    setPicked(null);
    setFlipped(null);

    try {
      const body = new FormData();
      body.append('file', chosen);
      const res = await fetch('/api/demo', { method: 'POST', body });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        // الراوت بيرجّع رسايل عربية مفهومة — بنعرضها زي ما هي.
        // الرسالة العامة للحالات اللي مالهاش رسالة (٥٠٠ من البروكسي مثلاً).
        setError(data?.error || t.demo_err_generic);
        setPhase('error');
        return;
      }

      setResult(data.result);
      setPhase('done');
    } catch {
      setError(t.demo_err_network);
      setPhase('error');
    }
  }

  /** الملزمة الجاهزة: بتتحمّل كملف حقيقي وبتمشي في نفس المسار بالظبط. */
  async function runSample() {
    try {
      setPhase('working');
      const res = await fetch('/sample-lecture.txt');
      const blob = await res.blob();
      const sample = new File([blob], 'محاضرة-٤-تعقيد-الخوارزميات.txt', {
        type: 'text/plain',
      });
      setFile(sample);
      await run(sample);
    } catch {
      setError(t.demo_err_network);
      setPhase('error');
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError('');
    setPhase('idle');
    setPicked(null);
    setFlipped(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const working = phase === 'working';

  return (
    <MotionConfig reducedMotion="user">
      <main>
        <div className="page">
          <nav className="nav">
            <BrandLock />
            <div className="row" style={{ gap: '14px' }}>
              <TopControls />
              <Link href="/login" className="btn btn-quiet" style={{ padding: '9px 18px' }}>
                {t.nav_login}
              </Link>
            </div>
          </nav>
        </div>

        <div className="page">
          <section className="band band-top demo-head">
            <Link href="/" className="legal-back">
              <BackArrow rtl={isRtl} />
              {t.demo_back}
            </Link>
            <p className="eyebrow">{t.demo_eyebrow}</p>
            <h1 className="demo-title">
              {t.demo_title_a} <span className="mark">{t.demo_title_mark}</span>
            </h1>
            <p className="lede demo-lede">{t.demo_lede}</p>
          </section>
        </div>

        {/* ---- منطقة الرفع ---- */}
        <div className="page">
          <section className="band band-tight">
            <div
              className={`dropzone${dragging ? ' is-dragging' : ''}${working ? ' is-busy' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!working) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (working) return;
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) validateAndSet(dropped);
              }}
            >
              <span className="dropzone-icon" aria-hidden="true">
                <UploadIcon />
              </span>
              <p className="dropzone-title">{t.demo_drop_title}</p>
              <p className="muted small dropzone-or">
                {t.demo_drop_hint}{' '}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => inputRef.current?.click()}
                  disabled={working}
                >
                  {t.demo_drop_browse}
                </button>
              </p>
              <p className="mono dropzone-formats">{t.demo_drop_formats}</p>

              <input
                ref={inputRef}
                type="file"
                className="sr-only"
                accept=".pdf,.docx,.txt,.md,.csv,image/*"
                onChange={(e) => {
                  const next = e.target.files?.[0];
                  if (next) validateAndSet(next);
                }}
              />
            </div>

            {/* الملف المختار + زرار البدء */}
            {file && phase !== 'done' && (
              <div className="demo-chosen">
                <span className="demo-chosen-badge" aria-hidden="true">
                  <CheckIcon />
                </span>
                <div className="demo-chosen-meta">
                  <p className="demo-chosen-label">{t.demo_file_chosen}</p>
                  <p className="demo-chosen-name" dir="auto">
                    {file.name}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-marker"
                  onClick={() => run(file)}
                  disabled={working}
                >
                  {working ? t.demo_working : t.demo_start}
                </button>
              </div>
            )}

            {/* الملزمة الجاهزة — للزائر اللي مامعهوش ملف دلوقتي */}
            {!file && (
              <p className="muted small demo-sample">
                {t.demo_sample_text}{' '}
                <button
                  type="button"
                  className="linkish"
                  onClick={runSample}
                  disabled={working}
                >
                  {t.demo_sample_cta}
                </button>
              </p>
            )}

            {/* ---- شريط المراحل أثناء الانتظار ---- */}
            {working && (
              <div
                className="demo-steps"
                role="status"
                aria-live="polite"
                aria-label={t.demo_progress_label}
              >
                {steps.map((label, i) => (
                  <div
                    key={label}
                    className={`demo-step${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`}
                  >
                    <span className="demo-step-dot" aria-hidden="true">
                      {i < step ? <CheckIcon /> : <span className="demo-step-pulse" />}
                    </span>
                    <span className="demo-step-label">{label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ---- الخطأ ---- */}
            {phase === 'error' && error && (
              <p className="demo-error" role="alert">
                <span className="demo-error-icon" aria-hidden="true">
                  <XIcon />
                </span>
                {error}
              </p>
            )}
          </section>
        </div>

        {/* ---- النتيجة ---- */}
        <AnimatePresence>
          {phase === 'done' && result && (
            <motion.div
              initial={reduced ? { opacity: 1 } : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
            >
              <div className="page">
                <section className="band">
                  {/* tabIndex={-1} عشان نقدر ننقل التركيز هنا برمجياً بعد
                      ما النتيجة تظهر، من غير ما ندخله في ترتيب الـ tab */}
                  <div ref={resultRef} tabIndex={-1} className="demo-result-head">
                    <p className="eyebrow">{t.demo_result_eyebrow}</p>
                    <h2 className="h2" dir="auto">
                      {result.title}
                    </h2>
                  </div>

                  {/* الملخص */}
                  <div className="sheet-block">
                    <h3 className="h3">{t.demo_result_summary}</h3>
                    <ul className="demo-summary" dir="auto">
                      {result.summary.map((line) => (
                        <li key={line}>
                          <span className="demo-tick" aria-hidden="true">
                            <CheckIcon />
                          </span>
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* كروت المراجعة */}
                  <div className="sheet-block">
                    <h3 className="h3">{t.demo_result_cards}</h3>
                    <p className="muted small" style={{ margin: '4px 0 14px' }}>
                      {t.demo_result_cards_hint}
                    </p>
                    <div className="demo-cards">
                      {result.flashcards.map((card, i) => (
                        <button
                          key={card.q}
                          type="button"
                          className={`demo-card${flipped === i ? ' is-flipped' : ''}`}
                          onClick={() => setFlipped(flipped === i ? null : i)}
                          aria-expanded={flipped === i}
                          dir="auto"
                        >
                          <span className="demo-card-q">{card.q}</span>
                          {flipped === i && <span className="demo-card-a">{card.a}</span>}
                          {flipped !== i && (
                            <span className="demo-card-hint">{t.demo_card_flip}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* سؤال الامتحان */}
                  <div className="sheet-block">
                    <h3 className="h3">{t.demo_result_quiz}</h3>
                    <p className="demo-quiz-q" dir="auto">
                      {result.quiz.question}
                    </p>
                    <div className="demo-choices" role="group" aria-label={result.quiz.question}>
                      {result.quiz.choices.map((choice, i) => {
                        const isAnswer = i === result.quiz.answerIndex;
                        const isPicked = picked === i;
                        const state =
                          picked === null
                            ? ''
                            : isAnswer
                              ? ' is-correct'
                              : isPicked
                                ? ' is-wrong'
                                : ' is-dim';
                        return (
                          <button
                            key={choice}
                            type="button"
                            className={`demo-choice${state}`}
                            onClick={() => setPicked(i)}
                            disabled={picked !== null}
                            dir="auto"
                          >
                            <span className="demo-choice-mark" aria-hidden="true">
                              {picked !== null && isAnswer ? (
                                <CheckIcon />
                              ) : picked !== null && isPicked ? (
                                <XIcon />
                              ) : (
                                String.fromCharCode(65 + i)
                              )}
                            </span>
                            {choice}
                          </button>
                        );
                      })}
                    </div>

                    {picked !== null && (
                      <p
                        className={`demo-verdict${picked === result.quiz.answerIndex ? ' is-correct' : ''}`}
                        role="status"
                      >
                        <strong>
                          {picked === result.quiz.answerIndex
                            ? t.demo_quiz_correct
                            : t.demo_quiz_wrong}
                        </strong>
                        {result.quiz.why && <span dir="auto"> — {result.quiz.why}</span>}
                      </p>
                    )}
                  </div>

                  {/* الخطة */}
                  <div className="sheet-block">
                    <h3 className="h3">{t.demo_result_plan}</h3>
                    <ol className="demo-plan">
                      {result.plan.map((day) => (
                        <li key={day.day} className="demo-plan-day">
                          <span className="demo-plan-num">
                            <span className="demo-plan-num-label">{t.demo_plan_day}</span>
                            <span className="demo-plan-num-value ltr-num">{day.day}</span>
                          </span>
                          <div dir="auto">
                            <p className="demo-plan-title">{day.title}</p>
                            <p className="muted small" style={{ margin: '4px 0 0' }}>
                              {day.desc}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                </section>
              </div>

              {/* ---- الختام ---- */}
              <div className="page">
                <section className="band">
                  <div className="final ruled">
                    <h2 className="h2" style={{ maxWidth: '24ch' }}>
                      {t.demo_cta_title}
                    </h2>
                    <p className="muted demo-cta-lede">{t.demo_cta_lede}</p>
                    <div className="hero-actions" style={{ justifyContent: 'center' }}>
                      <Link href="/#start" className="btn btn-marker">
                        {t.demo_cta_button}
                      </Link>
                      <button type="button" className="btn btn-quiet" onClick={reset}>
                        {t.demo_again}
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </MotionConfig>
  );
}