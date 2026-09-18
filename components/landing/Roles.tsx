'use client';

import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import styles from './Roles.module.css';

export default function Roles() {
  const { t, locale } = useLanguage();

  /* الأيقونات والروابط بتفضل ثابتة، والنصوص كلها من القاموس
     عشان تبان بالإنجليزي لما المستخدم يبدّل اللغة. */
  const roles = [
    {
      icon: '🎓',
      title: t.role1_title,
      desc: t.role1_desc,
      features: [t.role1_f1, t.role1_f2, t.role1_f3],
    },
    {
      icon: '💼',
      title: t.role2_title,
      desc: t.role2_desc,
      features: [t.role2_f1, t.role2_f2, t.role2_f3],
    },
    {
      icon: '🚀',
      title: t.role3_title,
      desc: t.role3_desc,
      features: [t.role3_f1, t.role3_f2, t.role3_f3],
    },
  ];

  return (
    <section id="how" className={styles.block} aria-labelledby="roles-heading">
      <ScrollReveal className={styles.head}>
        <h2 id="roles-heading">
          {t.roles_title_a} <span className={styles.hl}>{t.roles_title_b}</span>
        </h2>
        <p>{t.roles_lede}</p>
      </ScrollReveal>
      <div className={styles.grid}>
        {roles.map((role, i) => (
          <ScrollReveal key={role.title} delay={i * 0.09} className="reveal-fill">
            <div className={styles.roleCard}>
              <div className={styles.roleIcon} aria-hidden="true">{role.icon}</div>
              <h3>{role.title}</h3>
              <p>{role.desc}</p>
              <ul>
                {role.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <div className={styles.roleLink}>
                {t.role_explore}
                {/* السهم «للتقدم» في اتجاه القراءة: شمال في RTL، يمين في LTR */}
                <span aria-hidden="true" className={styles.roleLinkArrow}>
                  {locale === 'ar' ? '←' : '→'}
                </span>
              </div>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}
