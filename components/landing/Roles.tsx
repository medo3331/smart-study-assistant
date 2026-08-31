'use client';

import styles from './Roles.module.css';

const roles = [
  {
    icon: '🎓',
    title: 'طالب',
    desc: 'شريكك في المذاكرة — يشرحلك، يذكّرك، ويختبرك.',
    features: ['ملخصات ذكية', 'مساعد ذكاء اصطناعي', 'اختبارات وبطاقات مراجعة'],
  },
  {
    icon: '💼',
    title: 'خريج',
    desc: 'ابني مهاراتك ووصّل لفرصتك المهنية بخطوات واضحة.',
    features: ['إعداد السيرة الذاتية', 'إرشاد مهني', 'تدريب مقابلات'],
  },
  {
    icon: '🚀',
    title: 'فريلانسر',
    desc: 'نظّم شغلك وعملاءك ونمّي مشروعك الحر.',
    features: ['مولّد عروض الأسعار', 'إدارة مشاريع', 'مساعد كتابة ذكي'],
  },
];

export default function Roles() {
  return (
    <section dir="rtl" id="how" className={styles.block}>
      <div className={styles.head}>
        <h2>منصة واحدة. <span className={styles.hl}>لكل مسارك.</span></h2>
        <p>ماجيكلي بيتكيف حسب مين إنت — مش نفس التجربة للجميع.</p>
      </div>
      <div className={styles.grid}>
        {roles.map((role) => (
          <div key={role.title} className={styles.roleCard}>
            <div className={styles.roleIcon}>{role.icon}</div>
            <h3>{role.title}</h3>
            <p>{role.desc}</p>
            <ul>
              {role.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <div className={styles.roleLink}>استكشف ←</div>
          </div>
        ))}
      </div>
    </section>
  );
}
