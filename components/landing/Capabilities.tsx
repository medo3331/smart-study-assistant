'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Playfair_Display } from 'next/font/google';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import styles from './Capabilities.module.css';
import PreviewCard from './PreviewCard';

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: '700',
  style: ['italic'],
  display: 'swap',
  variable: '--font-playfair-display-src',
});

/* ⚠️ المسارات دي لازم تفضل حقيقية: /learning /search /create /solve /plan
   مش موجودة في المشروع، فاتوجّهنا للمسارات الموجودة فعلاً عشان مايبقاش
   فيه لينك بيودّي ٤٠٤. لو اتعملت الصفحات دي لاحقاً نحدّث الـ href. */
const tabHrefs: Record<string, string> = {
  learn: '/features',
  search: '/dashboard',
  create: '/faq',
  solve: '/worship',
  plan: '/lesson',
};

export default function Capabilities() {
  const { t } = useLanguage();
  const [active, setActive] = useState('learn');
  const tabs = [
    { id: 'learn', label: t.cap_learn_label }, { id: 'search', label: t.cap_search_label },
    { id: 'create', label: t.cap_create_label }, { id: 'solve', label: t.cap_solve_label }, { id: 'plan', label: t.cap_plan_label },
  ];
  const tabContent: Record<string, { title: string; desc: string; items: string[]; cta: string }> = {
    learn: { title: t.cap_learn_title, desc: t.cap_learn_desc, items: [t.cap_learn_i1, t.cap_learn_i2, t.cap_learn_i3], cta: t.cap_learn_cta },
    search: { title: t.cap_search_title, desc: t.cap_search_desc, items: [t.cap_search_i1, t.cap_search_i2, t.cap_search_i3], cta: t.cap_search_cta },
    create: { title: t.cap_create_title, desc: t.cap_create_desc, items: [t.cap_create_i1, t.cap_create_i2, t.cap_create_i3], cta: t.cap_create_cta },
    solve: { title: t.cap_solve_title, desc: t.cap_solve_desc, items: [t.cap_solve_i1, t.cap_solve_i2, t.cap_solve_i3], cta: t.cap_solve_cta },
    plan: { title: t.cap_plan_title, desc: t.cap_plan_desc, items: [t.cap_plan_i1, t.cap_plan_i2, t.cap_plan_i3], cta: t.cap_plan_cta },
  };

  const content = tabContent[active];
  const href = tabHrefs[active];

  return (
    <section dir="rtl" id="capabilities" className={styles.block}>
      <div className={styles.head}>
        <h2>{t.caps_title_a} <span className={styles.hl}>{t.caps_title_b}</span> {t.caps_title_c}</h2>
      </div>
      <div className={styles.tabbar}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${active === tab.id ? styles.activeTab : ''}`}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={styles.capability}>
        <div className={styles.capabilityCopy}>
          <h3 style={{ fontFamily: playfair.variable }}>{content.title}</h3>
          <p>{content.desc}</p>
          <ul>
            {content.items.map((item) => (
              <li key={item}>
                <i className={styles.tabBullet} />
                {item}
              </li>
            ))}
          </ul>
          <Link href={href} className={styles.btnPrimary}>
            {content.cta}
          </Link>
        </div>
        <div className={styles.previewCardWrapper}>
          <PreviewCard mode="lesson" />
        </div>
      </div>
    </section>
  );
}
