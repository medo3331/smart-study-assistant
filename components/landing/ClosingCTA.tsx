'use client';

import Link from 'next/link';
import styles from './ClosingCTA.module.css';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

export default function ClosingCTA() {
  const { t } = useLanguage();
  return (
    <section dir="rtl" className={styles.section}>
      <h2 className={styles.title}>
        {t.closing_title_a} <span className={styles.hl}>{t.closing_title_b}</span>
      </h2>
      <div className={styles.btnRow}>
        <Link href="/login?next=/assessment" className={styles.btnPrimary}>
          {t.closing_cta}
        </Link>
        <Link href="/features" className={styles.btnGhost}>
          {t.closing_cta2}
        </Link>
      </div>
    </section>
  );
}
