'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import MIcon from './MIcon';
import PreviewCard from './PreviewCard';
import { TopControls } from '@/components/TopControls';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import styles from './Hero.module.css';

export default function Hero() {
  const { t } = useLanguage();

  /* نقطة الدخول الحقيقية: الزائر يسجّل الأول، وبعد التسجيل يروح للـwizard
     في /assessment اللي بيجمّع بياناته وهدفه ومذكرته ويبنيله الخطة. */
  const startHref = '/login?next=/assessment';

  /* روابط النافبار: مراسي جوّه اللاندينج نفسها (تنقّل في صفحة واحدة).
     بنفس ترتيب الموكاب: الرئيسية/المميزات/كيف تعمل؟/مساعدة. */
  const NAV_LINKS = [
    { key: 'nav_home', href: '#top' },
    { key: 'nav_features', href: '#features' },
    { key: 'nav_how', href: '#how' },
    { key: 'nav_help', href: '#capabilities' },
  ];

  /* خطوات ٣ — الترتيب بيحدده اتجاه الصفحة: في RTL 1 يمين ← 3 شمال،
     وفي LTR 1 شمال ← 3 يمين (نفس الـ flex، الميرور جاي من dir على <html>). */
  const steps = [
    { id: 1, title: t.hero_step1 },
    { id: 2, title: t.hero_step2 },
    { id: 3, title: t.hero_step3 },
  ];

  /* ترتيب كبسولات الثقة على الصفحة الحالية — نفس الترتيب بالظبط عشان
     AR مايتغيرش. (trust2 ← trust1 ← trust3) */
  const trustPills = [t.trust2, t.trust1, t.trust3];

  /* قائمة الموبايل: على الشاشات الصغيرة اللينكات بتختفي (CSS) ويظهر
     زر الهامبرجر، وده بيفتح لستة تحت النافبار بنفس اللينكات. */
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <section id="top" className={styles.hero}>
      {/* نفس ترتيب الموكاب: أزرار يسار ← لينكات نص ← لوجو يمين (في RTL).
          الأزرار كلها مربوطة بروابط حقيقية عشان تفضل شغّالة (مش ميتة
          زي الموكاب). EN/☀ اتبدّلوا بـ TopControls (لغة+ثيم شغّالين). */}
      <nav className={styles.nav}>
        <div className={styles.navActions}>
          <Link
            href={startHref}
            className={`${styles.btnPrimary} ${styles.navStart} cta-pulse`}
          >
            {t.nav_start}
          </Link>
          <Link href="/login" className={`${styles.btnGhost} ${styles.navSignin}`}>
            {t.nav_login}
          </Link>
          <TopControls />
          {/* زر الهامبرجر — يظهر على الموبايل بس (CSS). */}
          <button
            type="button"
            className={styles.navToggle}
            aria-expanded={menuOpen}
            aria-controls="nav-mobile"
            aria-label={t.nav_menu}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className={styles.navToggleIcon} aria-hidden="true" />
          </button>
        </div>

        <ul className={styles.navLinks}>
          {NAV_LINKS.map(({ key, href }) => (
            <li key={key}>
              <a href={href} className={styles.navLink}>
                {t[key as keyof typeof t]}
              </a>
            </li>
          ))}
        </ul>

        <div className={styles.logoRow}>
          <MIcon className={styles.logoMark} />
          <span className={styles.logoText}>{t.brand}</span>
        </div>
      </nav>

      {/* قائمة الموبايل — نفس اللينكات. بتتقفل مع أول ضغطة. */}
      <div id="nav-mobile" className={styles.navMobile} hidden={!menuOpen}>
        {NAV_LINKS.map(({ key, href }) => (
          <a key={key} href={href} className={styles.navMobileLink} onClick={closeMenu}>
            {t[key as keyof typeof t]}
          </a>
        ))}
      </div>

      <div className={styles.steps}>
        {steps.map((s, i) => (
          <React.Fragment key={s.id}>
            <div className={`${styles.step} ${i === 0 ? styles.active : ''}`}>
              <div className={styles.stepNum}>{s.id}</div>
              <span>{s.title}</span>
            </div>
            {i < steps.length - 1 && <div className={styles.stepLine} />}
          </React.Fragment>
        ))}
      </div>

      <div className={styles.heroContent}>
        <div className={styles.copy}>
          {/* الجملة مقسومة لثلاث من القاموس (hero_title_a/mark/b):
              مقدمة ثابتة + الكلمة المتحرّكة (morphWord) + جزء ملون في
              السطر التاني. الأنيميشن نفسه في Hero.module.css. */}
          <h1 className={styles.title}>
            <span className={styles.morphWrap}>
              <span className={styles.morphIntro}>
                {t.hero_title_a}
                {'\u00A0'}
              </span>
              <span className={styles.morphWord}>{t.hero_title_mark}</span>
            </span>
            <br />
            <span className={styles.highlight} style={{ fontFamily: 'var(--font-playfair-display-src)' }}>
              {t.hero_title_b}
            </span>
          </h1>
          <p className={styles.description}>{t.hero_subtitle}</p>
          <div className={styles.ctaRow}>
            <Link href={startHref} className={`${styles.btnPrimary} cta-pulse`}>
              {t.hero_cta}
            </Link>
            <Link href="/features" className={styles.btnGhost}>
              {t.hero_cta_secondary}
            </Link>
          </div>
          <div className={styles.trust}>
            {trustPills.map((pill) => (
              <span key={pill}>
                <i aria-hidden="true">✓</i>
                {pill}
              </span>
            ))}
          </div>
        </div>
        <div className={styles.previewCard}>
          <PreviewCard />
        </div>
      </div>
    </section>
  );
}
