'use client';

import styles from './Roles.module.css';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

export default function Roles() {
  const { t, locale } = useLanguage();
  const roles = [
    { icon: '🎓', title: t.role1_title, desc: t.role1_desc, features: [t.role1_f1, t.role1_f2, t.role1_f3] },
    { icon: '💼', title: t.role2_title, desc: t.role2_desc, features: [t.role2_f1, t.role2_f2, t.role2_f3] },
    { icon: '🚀', title: t.role3_title, desc: t.role3_desc, features: [t.role3_f1, t.role3_f2, t.role3_f3] },
  ];
  return (
    <section dir="rtl" id="how" className={styles.block}>
      <div className={styles.head}>
        <h2>{t.roles_title_a} <span className={styles.hl}>{t.roles_title_b}</span></h2>
        <p>{t.roles_lede}</p>
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
            <div className={styles.roleLink}>{t.role_explore} {locale === 'ar' ? '←' : '→'}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
