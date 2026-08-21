import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
export const metadata: Metadata = pageMeta({ title: 'سجل المكافآت', description: 'سجل كوينز ومكافآت الحساب.', path: '/rewards', noIndex: true });
export default function RewardsLayout({ children }: { children: React.ReactNode }) { return children; }
