'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '../lib/i18n/LanguageProvider';
import { TopControls } from '@/components/TopControls';
import { BrandLock } from '@/components/BrandLogo';
import { LandingHero } from '@/components/LandingHero';
import { FeaturesSection } from '@/components/FeaturesSection';
import { FaqSection } from '@/components/FaqSection';
import { SiteFooter } from '@/components/SiteFooter';
import { FeedbackWidget } from '@/components/FeedbackWidget';
import { JsonLd } from '@/components/JsonLd';
import { LandingWelcome } from '@/components/landing-welcome/LandingWelcome';
import { softwareApplicationLd } from '@/lib/seo';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/* روابط النافبار: مراسي جوّه اللاندينج نفسها (تنقّل في صفحة واحدة).
   #main فوق الصفحة، و#how/#features/#faq على الأقسام. نفس القيم بتتكرر
   في قائمة الموبايل تحت عشان الاتنين مايفرقوش أبداً. */
const NAV_LINKS: { key: keyof Dictionary; href: string }[] = [
  { key: 'nav_home', href: '#main' },
  { key: 'nav_how', href: '#how' },
  { key: 'nav_features', href: '#features' },
  { key: 'nav_help', href: '#faq' },
];

/* نقطة الدخول الحقيقية: الزائر يسجّل الأول، وبعد التسجيل يروح للـwizard
   في /assessment اللي بيجمّع بياناته وهدفه ومذكرته ويبنيله الخطة. كل
   أزرار «ابدأ» في الصفحة بتودّي هنا عشان القمع يكون خط واحد واضح. */
const START_HREF = '/login?next=/assessment';

export default function LandingPage() {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  const steps = [
    { title: t.step1_title, desc: t.step1_desc },
    { title: t.step2_title, desc: t.step2_desc },
    { title: t.step3_title, desc: t.step3_desc },
  ];

  return (
    <>
      {/* البيانات المنظّمة بتاعة اللاندينج: التطبيق نفسه بس.
          ⚠️ الـ FAQPage JSON-LD **مش هنا** — عايش على /faq اللي فيها
          العشرة أسئلة كاملين. قاعدة جوجل إن الوسم لازم يطابق النص الظاهر،
          واللاندينج بتوري ملخّص ٥ بس. */}
      <JsonLd data={[softwareApplicationLd()]} />

      {/* أول حاجة في ترتيب التنقل: مستخدم الكيبورد ميعديش على الهيدر
          والهيرو كله عشان يوصل للمحتوى. مخفي لحد ما ياخد تركيز. */}
      <a href="#main" className="skip-link">
        {t.skip_to_content}
      </a>

      {/* ── الهيدر الثابت ──
          برّه .page عشان الخلفية والبوردر يمتدوا بعرض الشاشة، وجوّاه .page
          تانية بترصّ محتواه على نفس عرض باقي الصفحة. */}
      <header className="site-header">
        <div className="page">
          <nav className="nav" aria-label={t.nav_primary_label}>
            <BrandLock />

            {/* روابط سطح المكتب — بتتخفي على الموبايل وتنزل لقائمة الهامبرجر */}
            <ul className="nav-links">
              {NAV_LINKS.map(({ key, href }) => (
                <li key={key}>
                  <a href={href} className="nav-link">
                    {t[key]}
                  </a>
                </li>
              ))}
            </ul>

            <div className="row nav-actions">
              <TopControls />
              <LandingWelcome />
              <Link href="/login" className="btn btn-quiet btn-compact nav-signin">
                {t.nav_login}
              </Link>
              <Link href={START_HREF} className="btn btn-marker btn-compact nav-start">
                {t.nav_start}
              </Link>

              {/* زر القائمة — بيظهر على الموبايل بس (CSS) */}
              <button
                type="button"
                className="nav-toggle"
                aria-expanded={menuOpen}
                aria-controls="nav-mobile"
                aria-label={t.nav_menu}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className="nav-toggle-icon" aria-hidden="true" />
              </button>
            </div>
          </nav>

          {/* قائمة الموبايل — نفس الروابط + الدخول والبداية. بتتقفل مع أول
              ضغطة عشان المرساة تشتغل والشريط يرجع لطوله الطبيعي. */}
          <div id="nav-mobile" className="nav-mobile" hidden={!menuOpen}>
            {NAV_LINKS.map(({ key, href }) => (
              <a key={key} href={href} className="nav-mobile-link" onClick={closeMenu}>
                {t[key]}
              </a>
            ))}
            <div className="nav-mobile-actions">
              <Link href="/login" className="btn btn-quiet" onClick={closeMenu}>
                {t.nav_login}
              </Link>
              <Link href={START_HREF} className="btn btn-marker" onClick={closeMenu}>
                {t.nav_start}
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="page">
        <main id="main">
          {/* البطل — مكوّن مستقل: الحركة بتخليه client-side بالكامل،
              وفصله بيخلي باقي الصفحة تفضل مقروءة. */}
          <LandingHero />

          {/* ابدأ خطتك في ٣ خطوات — أرقام 01/02/03، الرحلة اللي بتبدأ
              بزر «ابدأ خطتك» فوق: ارفع مذكرتك ← حدّد هدفك ← ابدأ المذاكرة. */}
          <section className="band" id="how">
            <p className="eyebrow">{t.steps_eyebrow}</p>
            <h2 className="h2 measure">{t.steps_title}</h2>
            <ol className="steps">
              {steps.map((s, i) => (
                <li key={s.title} className="step">
                  <span className="step-num tnum">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="h3">{s.title}</h3>
                  <p className="muted small hint">{s.desc}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* كيف تساعدك ماجيكلي؟ — ملخّص ٤ مميزات حقيقية، والباقي في
              /features. اللاندينج محور بيوري الوش، والتفاصيل في الذراع. */}
          <FeaturesSection limit={4} moreHref="/features" />

          {/* الأسئلة الشائعة — آخر اعتراض قبل نداء الختام. ملخّص ٥ أسئلة،
              والعشرة في /faq (اللي كمان فيها الـ FAQPage JSON-LD). */}
          <FaqSection limit={5} moreHref="/faq" />

          {/* الختام — «جاهز تبدأ؟» + نفس زر البداية بتاع الهيرو والنافبار */}
          <section className="band">
            <div className="final ruled">
              <h2 className="h2 measure-tight">{t.footer_cta_title}</h2>
              <Link href={START_HREF} className="btn btn-marker">
                {t.footer_cta_button}
              </Link>
            </div>
          </section>

          {/* اللاندينج بتسأل عن الصفحة نفسها مش عن ميزة: الزائر لسه ماجرّبش
              حاجة، فرأيه في الصفحة دي بالذات هو اللي بيقول ليه ما كمّلش. */}
          <FeedbackWidget page="landing" featureLabel="الصفحة الرئيسية" />
        </main>
      </div>

      {/* الفوتر بره <main> عن قصد: عنصر <footer> على مستوى الصفحة هو
          لاندمارك contentinfo، ولو اتحطّ جوه <main> المتصفح بيسقط عنه
          الدور ده. */}
      <SiteFooter />
    </>
  );
}
