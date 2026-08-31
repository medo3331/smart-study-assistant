'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Playfair_Display } from 'next/font/google';
import styles from './Capabilities.module.css';
import PreviewCard from './PreviewCard';

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: '700',
  style: ['italic'],
  display: 'swap',
  variable: '--font-playfair-display-src',
});

const tabs = [
  { id: 'learn', label: '📖 تعلم' },
  { id: 'search', label: '🔍 بحث' },
  { id: 'create', label: '✨ إنشاء' },
  { id: 'solve', label: '🧩 حل' },
  { id: 'plan', label: '🗓️ خطط' },
];

/* ⚠️ المسارات دي لازم تفضل حقيقية: /learning /search /create /solve /plan
   مش موجودة في المشروع، فاتوجّهنا للمسارات الموجودة فعلاً عشان مايبقاش
   فيه لينك بيودّي ٤٠٤. لو اتعملت الصفحات دي لاحقاً نحدّث الـ href. */
const tabHrefs: Record<string, string> = {
  learn: '/features',
  search: '/dashboard',
  create: '/faq',
  solve: '/worship',
  plan: '/lesson',
};

const tabContent: Record<string, { title: string; desc: string; items: string[]; cta: string }> = {
  learn: {
    title: 'اتعلم أي حاجة بالطريقة الذكية',
    desc: 'احصل على دروس مخصصة، فيديوهات، ملاحظات، واختبارات تفاعلية اتصمّمت ليك انت بالذات.',
    items: ['دروس تفاعلية', 'شرح بالذكاء الاصطناعي', 'تدريب واختبار مستمر'],
    cta: 'شوفها بنفسك',
  },
  search: {
    title: 'بحث فعال وجاف',
    desc: 'اكتشف الكتب والمقالات والموارد بسرعة وسهولة باستخدام محركات البحث المتقدمة ومجالات المعرفة.',
    items: ['محركات بحث ذكية', 'فلاتر متقدمة', 'مخزن مرجعي ضخم'],
    cta: 'جرب الآن',
  },
  create: {
    title: 'إنشاء محتوى مبتكر',
    desc: 'استخدم الأدوات الذكية لإنشاء أسئلة، ملخصات، ملاحظات، ورسوم بيانية بسهولة وسرعة.',
    items: ['مولّد ملخصات', 'أسلوب مخصص', 'تنسيقات متعددة'],
    cta: 'ابدأ الإنشاء',
  },
  solve: {
    title: 'حل مسائل معقدة',
    desc: 'يمكنك استخدام ماجيكلي لحل المسائل الصعبة، المسائل الرياضية والعلمية خطوة بخطوة.',
    items: ['حل مسائل رياضية', 'شرح مفصل', 'دعم لغات متعددة'],
    cta: 'حل الآن',
  },
  plan: {
    title: 'تخطيط دراسي متكامل',
    desc: 'ابني جدولاً زمنياً دراسياً مخصصاً يناسب أهدافك ومستواك، مع تتبع التقدم يومياً.',
    items: ['جدول مرن', 'تذكير تلقائي', 'تقييم دوري'],
    cta: 'خطط الآن',
  },
};

export default function Capabilities() {
  const [active, setActive] = useState('learn');

  const content = tabContent[active];
  const href = tabHrefs[active];

  return (
    <section dir="rtl" id="capabilities" className={styles.block}>
      <div className={styles.head}>
        <h2>إيه اللي <span className={styles.hl}>ماجيكلي</span> يقدر يعمله؟</h2>
      </div>
      <div className={styles.tabbar}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${active === tab.id ? styles.activeTab : ''}`}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={styles.capability}>
        <div className={styles.capabilityCopy}>
          <h3 style={{ fontFamily: playfair.variable }}>{content.title}</h3>
          <p>{content.desc}</p>
          <ul>
            {content.items.map((item) => (
              <li key={item}>
                <i className={styles.tabBullet} />
                {item}
              </li>
            ))}
          </ul>
          <Link href={href} className={styles.btnPrimary}>
            {content.cta}
          </Link>
        </div>
        <div className={styles.previewCardWrapper}>
          <PreviewCard mode="lesson" />
        </div>
      </div>
    </section>
  );
}
