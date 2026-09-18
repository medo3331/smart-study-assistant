'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Playfair_Display } from 'next/font/google';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import styles from './Capabilities.module.css';
import PreviewCard from './PreviewCard';

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: '700',
  style: ['italic'],
  display: 'swap',
  variable: '--font-playfair-display-src',
});

/* معرّفات التابات ثابتة (بيتحفظ بيها الـ state)، والنصوص كلها من القاموس. */
const TAB_IDS = ['learn', 'search', 'create', 'solve', 'plan'] as const;
type TabId = (typeof TAB_IDS)[number];

const labelKeys: Record<TabId, 'cap_learn_label' | 'cap_search_label' | 'cap_create_label' | 'cap_solve_label' | 'cap_plan_label'> = {
  learn: 'cap_learn_label',
  search: 'cap_search_label',
  create: 'cap_create_label',
  solve: 'cap_solve_label',
  plan: 'cap_plan_label',
};

/* ⚠️ المسارات دي لازم تفضل حقيقية: /learning /search /create /solve /plan
   مش موجودة في المشروع، فاتوجّهنا للمسارات الموجودة فعلاً عشان مايبقاش
   فيه لينك بيودّي ٤٠٤. لو اتعملت الصفحات دي لاحقاً نحدّث الـ href. */
const tabHrefs: Record<TabId, string> = {
  learn: '/features',
  search: '/dashboard',
  create: '/faq',
  solve: '/worship',
  plan: '/lesson',
};

export default function Capabilities() {
  const { t } = useLanguage();
  const [active, setActive] = useState<TabId>('learn');

  /* المحتوى كله من القاموس — التاب النشط بيحدد أي مجموعة مفاتيح بتتنفع. */
  const tabContent: Record<TabId, { title: string; desc: string; items: string[]; cta: string }> = {
    learn: {
      title: t.cap_learn_title,
      desc: t.cap_learn_desc,
      items: [t.cap_learn_i1, t.cap_learn_i2, t.cap_learn_i3],
      cta: t.cap_learn_cta,
    },
    search: {
      title: t.cap_search_title,
      desc: t.cap_search_desc,
      items: [t.cap_search_i1, t.cap_search_i2, t.cap_search_i3],
      cta: t.cap_search_cta,
    },
    create: {
      title: t.cap_create_title,
      desc: t.cap_create_desc,
      items: [t.cap_create_i1, t.cap_create_i2, t.cap_create_i3],
      cta: t.cap_create_cta,
    },
    solve: {
      title: t.cap_solve_title,
      desc: t.cap_solve_desc,
      items: [t.cap_solve_i1, t.cap_solve_i2, t.cap_solve_i3],
      cta: t.cap_solve_cta,
    },
    plan: {
      title: t.cap_plan_title,
      desc: t.cap_plan_desc,
      items: [t.cap_plan_i1, t.cap_plan_i2, t.cap_plan_i3],
      cta: t.cap_plan_cta,
    },
  };

  const content = tabContent[active];
  const href = tabHrefs[active];

  return (
    <section id="capabilities" className={styles.block} aria-labelledby="capabilities-heading">
      <ScrollReveal className={styles.head}>
        <h2 id="capabilities-heading">
          {t.caps_title_a} <span className={styles.hl}>{t.caps_title_b}</span> {t.caps_title_c}
        </h2>
      </ScrollReveal>
      <ScrollReveal delay={0.08}>
        <div className={styles.tabbar}>
          {TAB_IDS.map((id) => (
            <button
              key={id}
              className={`${styles.tab} ${active === id ? styles.activeTab : ''}`}
              onClick={() => setActive(id)}
            >
              {t[labelKeys[id]]}
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
      </ScrollReveal>
    </section>
  );
}
