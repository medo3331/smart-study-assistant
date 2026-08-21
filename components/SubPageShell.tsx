'use client';

/**
 * 🧭 غلاف الصفحات الفرعية (الأذرع) — /features و /faq.
 *
 * ═══ ليه موجود ═══
 * اللاندينج بقت «محور»: ملخّص قصير لكل قسم تقيل، والتفاصيل الكاملة في
 * صفحة مستقلة (ذراع). الصفحات دي محتاجة نفس هيكل اللاندينج — نفس الـ
 * nav (البراند + المفاتيح + الدخول) ونفس الفوتر — عشان تحس إنها نفس
 * الموقع مش صفحة غريبة. الغلاف ده بيجمّع الهيكل ده في مكان واحد بدل ما
 * كل صفحة تكرّره وتخاطر إن واحدة تفرق عن التانية.
 *
 * ═══ ليه كلاينت كومبوننت ═══
 * الـ nav بيقرا النصوص من `useLanguage()` وبيركّب `TopControls`
 * (مفاتيح اللغة والثيم) — الاتنين كلاينت. الصفحة اللي بتستعمل الغلاف
 * ده بتفضل سيرفر كومبوننت (عشان تصدّر `metadata`)، وبتمرّر القسم
 * كـ children — React بيسمح بده عادي.
 *
 * ⚠️ مختلف عن `LegalDoc`: صفحات القانوني عمداً من غير nav ولا فوتر
 * (صفحة بتتقرا مرة). الأذرع دي صفحات تسويقية بيتصفّحها الزائر، فمحتاجة
 * الـ chrome الكامل عشان يقدر يوصل لباقي الموقع منها.
 *
 * ⚠️ الفوتر بره <main> عن قصد — نفس سبب اللاندينج: <footer> على مستوى
 * الصفحة هو لاندمارك contentinfo، ولو دخل جوه <main> المتصفح بيسقط عنه
 * الدور ده.
 *
 * ⚠️ ميزانية اللون: ضربة `.mark` الوحيدة في الشاشة هنا هي علامة البراند
 * في الـ nav — نفس اللاندينج بالظبط. عناوين الأذرع (h1) من غير ضربة عن
 * قصد، والقسم اللي جوّه بيسيب الفسفوري للكارت/السؤال اللي المؤشر عليه.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { BrandLock } from '@/components/BrandLogo';
import { TopControls } from '@/components/TopControls';
import { SiteFooter } from '@/components/SiteFooter';

export function SubPageShell({ children }: { children: ReactNode }) {
  const { t } = useLanguage();

  return (
    <>
      {/* أول حاجة في ترتيب التنقل: اللي بيستخدم كيبورد ميعديش على الـ nav
          كله عشان يوصل للمحتوى. مخفي لحد ما ياخد تركيز. */}
      <a href="#main" className="skip-link">
        {t.skip_to_content}
      </a>

      {/* حاوية واحدة للـ nav + المحتوى — نفس هيكل اللاندينج: .page بتدّي
          نفس الـ max-width والـ gutter، والبراند فوق شمال والمفاتيح يمين. */}
      <div className="page">
        <nav className="nav" aria-label={t.nav_primary_label}>
          <BrandLock />
          <div className="row nav-actions">
            <TopControls />
            <Link href="/login" className="btn btn-quiet btn-compact">
              {t.nav_login}
            </Link>
          </div>
        </nav>

        <main id="main">{children}</main>
      </div>

      <SiteFooter />
    </>
  );
}
