'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import styles from './ClosingCTA.module.css';

export default function ClosingCTA() {
  const { t } = useLanguage();

  return (
    <section className={styles.section} aria-labelledby="closing-heading">
      <ScrollReveal>
        <h2 id="closing-heading" className={styles.title}>
          {t.closing_title_a} <span className={styles.hl}>{t.closing_title_b}</span>
        </h2>
        <div className={styles.btnRow}>
          <Link href="/login?next=/assessment" className={`${styles.btnPrimary} cta-pulse`}>
            {t.closing_cta}
          </Link>
          <Link href="/features" className={styles.btnGhost}>
            {t.closing_cta2}
          </Link>
        </div>
      </ScrollReveal>
    </section>
  );
}
