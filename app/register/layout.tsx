import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';

/* شاشة إجراء — noIndex زي اللوجين والترحيب بالظبط. */
export const metadata: Metadata = pageMeta({
  title: 'إنشاء حساب',
  description: 'اعمل حسابك في ماجيكلي وابدأ خطتك الأولى.',
  path: '/register',
  noIndex: true,
});

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
