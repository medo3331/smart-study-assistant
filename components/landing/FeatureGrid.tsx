'use client';

import { Cairo } from 'next/font/google';
import styles from './FeatureGrid.module.css';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '600'],
  display: 'swap',
  variable: '--font-cairo-src',
});

const items = [
  { icon: '🤖', title: 'مساعد ذكاء اصطناعي', desc: 'موجود معاك دايمًا يساعدك في أي حاجة.' },
  { icon: '🧠', title: 'نماذج ذكاء متعددة', desc: 'أفضل نموذج AI مخصص لكل مهمة.' },
  { icon: '📄', title: 'تحليل PDF والمستندات', desc: 'ارفع، حلّل، لخّص، واتعلم أسرع.' },
  { icon: '🛠️', title: 'أدوات ذكية', desc: '+50 أداة تساعدك تزود إنتاجيتك.' },
  { icon: '📈', title: 'تتبع التقدم', desc: 'افضل متحمس وشايف تطورك أول بأول.' },
  { icon: '🏆', title: 'مكافآت وعملات', desc: 'اكسب عملات وافتح مكافآت مع كل إنجاز.' },
];

export default function FeatureGrid() {
  return (
    <section dir="rtl" id="features" className={styles.section}>
      <div className={styles.head}>
        <h2>كل اللي محتاجه، <span className={styles.hl}>في مكان واحد.</span></h2>
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
