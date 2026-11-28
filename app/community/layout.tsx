import type { Metadata } from 'next';
import { JsonLd } from '@/components/JsonLd';
import { pageMeta, breadcrumbLd } from '@/lib/seo';

/* الصفحات الفرعية `'use client'` (مجتمع Magicly — اكتشاف وعلاقات، والمسابقات)
   فمابتقدرش تصدّر metadata بنفسها — اللايوت ده بيعمل ده بدالها. */
export const metadata: Metadata = pageMeta({
  title: 'مجتمع Magicly',
  description:
    'لاقي زمايلك في مجتمع Magicly: بحث عن الطلاب بكود MAG، طلبات صداقة ومتابعة، اقتراحات حسب جامعتك وتخصصك، وتحديات المجتمع — بخصوصية كاملة بيدك أنت التحكم فيها.',
  path: '/community',
  keywords: ['مجتمع طلاب', 'أصدقاء طلاب', 'شبكة طلابية', 'مجتمع Magicly', 'طلاب جامعة'],
});

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'الرئيسية', path: '/' },
          { name: 'مجتمع Magicly', path: '/community' },
        ])}
      />
      {children}
    </>
  );
}
