import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';

// صفحة داخل الحساب؛ لا نضيفها للـ sitemap أو البحث العام.
export const metadata: Metadata = pageMeta({ title: 'استراحة مذاكرة', description: 'استراحة قصيرة مرتبطة بخطة مذاكرتك.', path: '/break', noIndex: true });

export default function BreakLayout({ children }: { children: React.ReactNode }) { return children; }
