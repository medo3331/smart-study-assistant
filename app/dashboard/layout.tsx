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
      <div className="sticky top-0 z-40 flex items-center justify-end gap-3 border-b border-rule bg-paper/80 px-4 py-2 backdrop-blur">
        <NotificationBell />
      </div>
      <div className="mx-auto max-w-6xl px-4 pt-4">
        <AnnouncementBanner />
      </div>
      {children}
    </>
  );
}
