import type { Metadata } from 'next';
import { JsonLd } from '@/components/JsonLd';
import { pageMeta, breadcrumbLd } from '@/lib/seo';

/* الصفحة `'use client'` (أسئلة وإجابات حيّة من Supabase) فمابتقدرش
   تصدّر metadata بنفسها — اللايوت ده بيعمل ده بدالها. */
export const metadata: Metadata = pageMeta({
  title: 'اسأل زمايلك',
  description:
    'اسأل سؤالك في مادتك ورد على أسئلة غيرك. مجتمع طلاب بيذاكروا في نفس المجالات — البرمجة والطب واللغات والإدارة والمناهج والتصميم.',
  path: '/community',
  keywords: ['مجتمع طلاب', 'أسئلة وإجابات', 'مساعدة في المذاكرة', 'اسأل سؤال'],
});

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'الرئيسية', path: '/' },
          { name: 'اسأل زمايلك', path: '/community' },
        ])}
      />
      {children}
    </>
  );
}
