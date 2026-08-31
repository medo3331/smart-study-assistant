'use client';
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */
/* eslint-disable react-hooks/exhaustive-deps -- see exhaustive-deps note; will address with useCallback in follow-up */
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { useReducedMotion } from '@/lib/useReducedMotion';

function ClipIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.8 1.8 0 0 1-2.6-2.6l7.3-7.3" />
    </svg>
  );
}

export function AnimatedChatDemo() {
  const { t } = useLanguage();
  const reducedMotion = useReducedMotion();

  const pairs = useMemo(
    () => [
      { q: t.demo_q1, a: t.demo_a1 },
      { q: t.demo_q2, a: t.demo_a2 },
    ],
    [t]
  );

  const [pairIndex, setPairIndex] = useState(0);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [showQuestion, setShowQuestion] = useState(false);

  const current = pairs[pairIndex % pairs.length];

  useEffect(() => {
    // لو المستخدم طالب تقليل الحركة: نعرض الجواب كامل من غير كتابة ولا تبديل
    if (reducedMotion) {
      setShowQuestion(true);
                  setTypedAnswer(current.a);
      return;
    }

    setTypedAnswer('');
    setShowQuestion(false);

    const showQuestionTimer = setTimeout(() => setShowQuestion(true), 400);

    let typingInterval: ReturnType<typeof setInterval>;
    const startTypingTimer = setTimeout(() => {
      let charIndex = 0;
      typingInterval = setInterval(() => {
        charIndex += 1;
        setTypedAnswer(current.a.slice(0, charIndex));
        if (charIndex >= current.a.length) clearInterval(typingInterval);
      }, 20);
    }, 1200);

    const nextPairTimer = setTimeout(
      () => setPairIndex((prev) => (prev + 1) % pairs.length),
      1200 + current.a.length * 20 + 2600
    );

    return () => {
      clearTimeout(showQuestionTimer);
      clearTimeout(startTypingTimer);
      clearTimeout(nextPairTimer);
      clearInterval(typingInterval);
    };
  }, [current, reducedMotion]);

  const isTyping = typedAnswer.length < current.a.length;

  return (
    <div
      className="card card-lift ruled"
      style={{ padding: 'clamp(16px, 2.5vw, 22px)', minHeight: '250px' }}
    >
      {/* الملف المرفوع — هو أصل الحكاية، فمستحق يبان فوق */}
      <div
        className="row mono muted"
        style={{
          gap: '7px',
          display: 'inline-flex',
          padding: '6px 11px',
          marginBottom: '18px',
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--r-sm)',
          maxWidth: '100%',
        }}
      >
        <ClipIcon />
        <span
          style={{
            direction: 'ltr',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {t.demo_file}
        </span>
      </div>

      {/* سؤال الطالب */}
      <p
        style={{
          margin: '0 0 12px',
          marginInlineEnd: 'auto',
          maxWidth: '88%',
          padding: '10px 14px',
          background: 'var(--ink)',
          color: 'var(--paper)',
          borderRadius: 'var(--r-md) var(--r-md) var(--r-md) 3px',
          fontSize: 'var(--t-sm)',
          lineHeight: 1.6,
          opacity: showQuestion ? 1 : 0,
          transform: showQuestion ? 'translateY(0)' : 'translateY(6px)',
          transition: 'opacity 0.35s ease, transform 0.35s ease',
        }}
      >
        {current.q}
      </p>

      {/* رد المعلم — على الورق نفسه، مش في فقاعة.
          من غير aria-live: نص بيتكتب حرف حرف يخلي قارئ الشاشة يعيد كل حرف */}
      <p
        style={{
          margin: 0,
          marginInlineStart: 'auto',
          maxWidth: '94%',
          fontSize: 'var(--t-sm)',
          lineHeight: 1.75,
          color: 'var(--ink)',
          minHeight: '1.75em',
        }}
      >
        {typedAnswer}
        {isTyping && (
          <span
            aria-hidden="true"
            style={{ color: 'var(--redpen)', fontWeight: 700 }}
          >
            ▍
          </span>
        )}
      </p>
    </div>
  );
}