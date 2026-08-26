import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'جهز حسابك',
  description: 'خطوتين بس ونجهز ماجيكلي على مقاسك.',
  path: '/onboarding',
  noIndex: true,
});

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
