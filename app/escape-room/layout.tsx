import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
export const metadata: Metadata = pageMeta({ title: 'غرفة الهروب التعليمية', description: 'ألغاز قصيرة مرتبطة بالمذاكرة.', path: '/escape-room', noIndex: true });
export default function EscapeRoomLayout({ children }: { children: React.ReactNode }) { return children; }
