import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';

/* شاشة إجراء زي اللوجين بالظبط: noIndex مع follow. */
export const metadata: Metadata = pageMeta({
  title: 'أهلاً بك في ماجيكلي',
  description: 'ابدأ رحلتك في ماجيكلي — خطة تتعلم على مقاسك.',
  path: '/welcome',
  noIndex: true,
});

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
