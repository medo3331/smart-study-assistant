'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

export function StudyOutcomes() {
  const { t } = useLanguage();
  const outcomes = [
    { title: t.outcome1_title, desc: t.outcome1_desc },
    { title: t.outcome2_title, desc: t.outcome2_desc },
    { title: t.outcome3_title, desc: t.outcome3_desc },
  ];

  return (
    <section className="band outcomes" aria-labelledby="outcomes-title">
      <div className="outcomes-shell">
        <div className="outcomes-copy">
          <p className="eyebrow">{t.outcomes_eyebrow}</p>
          <h2 id="outcomes-title" className="h2 measure-tight">
            {t.outcomes_title}
          </h2>
          <p className="muted hint outcomes-lede">{t.outcomes_lede}</p>
          <Link href="/demo" className="btn btn-marker">
            {t.outcomes_cta}
          </Link>
        </div>

        <ol className="outcome-list">
          {outcomes.map((outcome, index) => (
            <li key={outcome.title} className="outcome-card">
              <span className="outcome-index tnum">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="h3">{outcome.title}</h3>
                <p className="muted small hint">{outcome.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
