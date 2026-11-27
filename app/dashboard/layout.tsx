import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import FoundationRewardsBootstrap from './components/FoundationRewardsBootstrap';
import RewardToastHost from './components/RewardToastHost';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import { LowCreditsBanner } from '@/components/upsell/LowCreditsBanner';
import { ExhaustedGuard } from '@/components/upsell/ExhaustedGuard';
import { MagicTopBar } from './components/MagicTopBar';
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
      <MagicTopBar />
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <AnnouncementBanner />
        <LowCreditsBanner />
      </div>
      <ExhaustedGuard />
      {children}
    </>
  );
}
