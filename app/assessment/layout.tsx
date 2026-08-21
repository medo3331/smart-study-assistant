import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';

/* خطوة في تدفق التسجيل مش صفحة محتوى — نفس منطق `/login`:
   الزائر اللي بييجي من جوجل لازم ينزل على `/` أو `/demo`، مش على
   نص استبيان من غير سياق. */
export const metadata: Metadata = pageMeta({
  title: 'حدّد مجالك وهدفك',
  description: 'كام سؤال سريع عشان الخطة والشرح يتظبطوا على مجالك وهدفك ووقتك المتاح.',
  path: '/assessment',
  noIndex: true,
});

export default function AssessmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
