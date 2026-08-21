import type { Metadata } from 'next';
import { JsonLd } from '@/components/JsonLd';
import { pageMeta, breadcrumbLd } from '@/lib/seo';

/* الصفحة نفسها `'use client'` (فيها رفع ملفات وحالة)، والمكوّنات دي
   مابتقدرش تصدّر metadata. اللايوت ده وظيفته الوحيدة إنه يدّي الصفحة
   ميتاداتا خاصة بيها — من غيره كانت هتورث ميتاداتا الموقع العامة،
   وأهم من كده كانت هتورث الكانونيكال `/` فتبقى مكرّرة من الرئيسية. */
export const metadata: Metadata = pageMeta({
  title: 'جرّب من غير حساب',
  description:
    'ارفع ملزمتك وشوف الذكاء الاصطناعي بيلخّصها ويعملك كروت مراجعة وسؤال امتحان وخطة مذاكرة — من غير تسجيل ومن غير بطاقة.',
  path: '/demo',
  keywords: ['تجربة مجانية', 'تلخيص PDF', 'من غير تسجيل', 'ديمو'],
});

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  /* فتات الخبز بتخلي جوجل يعرض «ماجيكلي › جرّب من غير حساب» تحت
     العنوان في النتايج بدل الـ URL الخام. اللايوت سيرفر كومبوننت
     فالوسم بيتولّد على السيرفر ومابيدخلش في بندل العميل. */
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'الرئيسية', path: '/' },
          { name: 'جرّب من غير حساب', path: '/demo' },
        ])}
      />
      {children}
    </>
  );
}
