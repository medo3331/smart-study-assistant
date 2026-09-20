'use client';

import styles from './FeatureGrid.module.css';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

export default function FeatureGrid() {
  const { t } = useLanguage();
  const items = [
    { icon: '🤖', title: t.grid1_title, desc: t.grid1_desc }, { icon: '🧠', title: t.grid2_title, desc: t.grid2_desc },
    { icon: '📄', title: t.grid3_title, desc: t.grid3_desc }, { icon: '🛠️', title: t.grid4_title, desc: t.grid4_desc },
    { icon: '📈', title: t.grid5_title, desc: t.grid5_desc }, { icon: '🏆', title: t.grid6_title, desc: t.grid6_desc },
  ];
  return (
    <section dir="rtl" id="features" className={styles.section}>
      <div className={styles.head}>
        <h2>{t.grid_title_a} <span className={styles.hl}>{t.grid_title_b}</span></h2>
      </div>
      <div className={styles.grid}>
        {items.map((item) => (
          <div key={item.title} className={styles.item}>
            <div className={styles.icon}>{item.icon}</div>
            <h4>{item.title}</h4>
            <p>{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
