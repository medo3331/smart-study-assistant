'use client';

import { Cairo } from 'next/font/google';
import Link from 'next/link';
import styles from './ClosingCTA.module.css';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '600'],
  display: 'swap',
  variable: '--font-cairo-src',
});

export default function ClosingCTA() {
  return (
    <section dir="rtl" className={styles.section}>
      <h2 className={styles.title}>
        أياً كان اللي بتحاول توصله، <span className={styles.hl}>ماجيكلي بيوصّلك.</span>
      </h2>
      <div className={styles.btnRow}>
        <Link href="/login?next=/assessment" className={styles.btnPrimary}>
          ابدأ الآن
        </Link>
        <Link href="/features" className={styles.btnGhost}>
          استكشف المميزات
        </Link>
      </div>
    </section>
  );
}
