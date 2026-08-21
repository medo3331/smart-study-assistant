import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
export const metadata: Metadata = pageMeta({ title: 'المهام اليومية', description: 'مهام يومية مرتبطة بأنشطة الدراسة.', path: '/missions', noIndex: true });
export default function MissionsLayout({ children }: { children: React.ReactNode }) { return children; }
