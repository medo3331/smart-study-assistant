import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import FoundationRewardsBootstrap from './components/FoundationRewardsBootstrap';
import RewardToastHost from './components/RewardToastHost';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import NotificationBell from '@/components/NotificationBell';
export const metadata: Metadata = pageMeta({
  title: 'مساحتك',
  description: 'خطتك وتقدّمك وملفاتك في مكان واحد.',
  path: '/dashboard',
  noIndex: true,
});

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <FoundationRewardsBootstrap />
      <RewardToastHost />
      <header className="sticky top-0 z-50 w-full border-b border-rule bg-paper/90 backdrop-blur-md px-4 py-3">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-ink">
            <span className="text-marker">Magiclly</span>
            <span className="text-ink-soft">— مساحة الدراسة</span>
          </div>
          <NotificationBell />
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <AnnouncementBanner />
      </div>
      {children}
    </>
  );
}
