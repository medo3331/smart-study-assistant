/**
 * ❓ صفحة الأسئلة الشائعة الكاملة — ذراع من أذرع اللاندينج.
 *
 * ═══ ليه الصفحة دي موجودة ═══
 * اللاندينج بتوري ٥ أسئلة كملخّص، ولينك «كل الأسئلة الشائعة» بيودّي هنا.
 * العشرة كلهم بيتعرضوا هنا بنفس مكوّن `FaqSection` (بـ `asPage`).
 *
 * ═══ ⚠️ FAQPage JSON-LD عايش هنا مش على اللاندينج ═══
 * قاعدة جوجل: البيانات المنظّمة لازم تطابق النص الظاهر في الصفحة. لمّا
 * اللاندينج بقت تعرض ٥ أسئلة بس، الـ FAQPage (بالعشرة) نُقل من `/`
 * لهنا — الصفحة الوحيدة اللي كل الأسئلة ظاهرة فيها فعلاً. لو رجع
 * للاندينج بأسئلة مش ظاهرة = عقوبة يدوية على الموقع كله. `faqPageLd()`
 * بيقرا من نفس `lib/faq.ts` اللي `FaqSection` بيرسم منه، فمستحيل يفرقوا.
 *
 * ⚠️ لو اتشالت الصفحة دي أو اتغيّر مسارها، لازم تتعدّل في `app/sitemap.ts`
 * وفي لينكات الفوتر (`components/SiteFooter.tsx`) و `@id` بتاع `faqPageLd`.
 */

import type { Metadata } from 'next';
import { SubPageShell } from '@/components/SubPageShell';
import { FaqSection } from '@/components/FaqSection';
import { JsonLd } from '@/components/JsonLd';
import { pageMeta, faqPageLd, breadcrumbLd } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'الأسئلة الشائعة',
  description:
    'كل اللي بيتسأل قبل ما حد يبدأ في ماجيكلي: هو بيشتغل إزاي، مجاني ولا لأ، بيدعم أنهي مواد، ودقّة الشرح — إجابات بالعربي وبصراحة.',
  path: '/faq',
});

export default function FaqPage() {
  return (
    <>
      {/* الأسئلة كلها ظاهرة تحت، فالـ FAQPage صح هنا. + فتات خبز
          للمسار في نتايج البحث. */}
      <JsonLd
        data={[
          faqPageLd(),
          breadcrumbLd([
            { name: 'الرئيسية', path: '/' },
            { name: 'الأسئلة الشائعة', path: '/faq' },
          ]),
        ]}
      />
      <SubPageShell>
        <FaqSection asPage />
      </SubPageShell>
    </>
  );
}
