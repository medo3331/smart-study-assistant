'use client';

import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import styles from './FeatureGrid.module.css';

export default function FeatureGrid() {
  const { t } = useLanguage();

  /* الأيقونات ثابتة، النصوص من القاموس. */
  const items = [
    { icon: '🤖', title: t.grid1_title, desc: t.grid1_desc },
    { icon: '🧠', title: t.grid2_title, desc: t.grid2_desc },
    { icon: '📄', title: t.grid3_title, desc: t.grid3_desc },
    { icon: '🛠️', title: t.grid4_title, desc: t.grid4_desc },
    { icon: '📈', title: t.grid5_title, desc: t.grid5_desc },
    { icon: '🏆', title: t.grid6_title, desc: t.grid6_desc },
  ];

  return (
    <section id="features" className={styles.section} aria-labelledby="features-heading">
      <ScrollReveal className={styles.head}>
        <h2 id="features-heading">
          {t.grid_title_a} <span className={styles.hl}>{t.grid_title_b}</span>
        </h2>
      </ScrollReveal>
      <div className={styles.grid}>
        {items.map((item, i) => (
          <ScrollReveal key={item.title} delay={(i % 3) * 0.09} y={20} className="reveal-fill">
            <div className={styles.item}>
              <div className={styles.icon} aria-hidden="true">{item.icon}</div>
              <h4>{item.title}</h4>
              <p>{item.desc}</p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}
