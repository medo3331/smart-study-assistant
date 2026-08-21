/**
 * ✦ صفحة الميزات الكاملة — ذراع من أذرع اللاندينج.
 *
 * ═══ ليه الصفحة دي موجودة ═══
 * اللاندينج بقت «محور» بتوري أول ٦ ميزات كملخّص، ولينك «شوف كل الميزات»
 * بيودّي هنا. الاتناشر كلهم بيتعرضوا هنا بنفس مكوّن `FeaturesSection`
 * (بـ `asPage`) — نفس البيانات، مفيش نسخة تانية تتحدّث لوحدها.
 *
 * ═══ ليه سيرفر كومبوننت ═══
 * الصفحة بتصدّر `metadata` (لازم تكون سيرفر)، وبتمرّر القسم الكلاينت
 * كـ children للغلاف. المحتوى نفسه (النصوص، الحركة) جوّه `FeaturesSection`.
 *
 * ⚠️ لو اتشالت الصفحة دي أو اتغيّر مسارها، لازم تتشال/تتعدّل في
 * `app/sitemap.ts` وفي لينكات الفوتر (`components/SiteFooter.tsx`).
 */

import type { Metadata } from 'next';
import { SubPageShell } from '@/components/SubPageShell';
import { FeaturesSection } from '@/components/FeaturesSection';
import { JsonLd } from '@/components/JsonLd';
import { pageMeta, breadcrumbLd } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'كل الميزات',
  description:
    'الاتناشر ميزة في ماجيكلي: يفهم ملفاتك، خطة على قد وقتك، الشرح بأربع طرق، كويز، قراءة الصور، عرض شرائح، ومتابعة تقدّمك — في مكان واحد.',
  path: '/features',
});

export default function FeaturesPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'الرئيسية', path: '/' },
          { name: 'الميزات', path: '/features' },
        ])}
      />
      <SubPageShell>
        <FeaturesSection asPage />
      </SubPageShell>
    </>
  );
}
