'use client';

import { useLanguage } from '../lib/i18n/LanguageProvider';
import Hero from '@/components/landing/Hero';
import Roles from '@/components/landing/Roles';
import Capabilities from '@/components/landing/Capabilities';
import FeatureGrid from '@/components/landing/FeatureGrid';
import ClosingCTA from '@/components/landing/ClosingCTA';

import { SiteFooter } from '@/components/SiteFooter';
import { FeedbackWidget } from '@/components/FeedbackWidget';
import { JsonLd } from '@/components/JsonLd';
import { softwareApplicationLd } from '@/lib/seo';

export default function LandingPage() {
  const { t } = useLanguage();

  return (
    <>
      {/* البيانات المنظّمة بتاعة اللاندينج: التطبيق نفسه بس.
          ⚠️ الـ FAQPage JSON-LD **مش هنا** — عايش على /faq اللي فيه
          العشرة أسئلة كاملين. قاعدة جوجل إن الوسم لازم يطابق النص الظاهر،
          واللاندينج بتوري ملخّص ٥ بس. */}
      <JsonLd data={[softwareApplicationLd()]} />

      {/* أول حاجة في ترتيب التنقل: مستخدم الكيبورد ميعديش على الهيدر
          والهيرو كله عشان يوصل للمحتوى. مخفي لحد ما ياخد تركيز. */}
      <a href="#main" className="skip-link">
        {t.skip_to_content}
      </a>

      <div className="page landing-page">
        <main id="main">
          {/* البطل — مكوّن مستقل: الحركة بتخليه client-side بالكامل،
              وفصله بيخلي باقي الصفحة تفضل مقروءة. */}
          <Hero />

          {/* Roles section */}
          <Roles />

          {/* Capabilities section */}
          <Capabilities />

          {/* Feature grid section */}
          <FeatureGrid />

          {/* Closing CTA section */}
          <ClosingCTA />

          {/* Feedback widget */}
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