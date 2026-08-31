"use client";

import { useMemo, createContext, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { MobileNav } from "@/components/dashboard/MobileNav";
import { QuranAudioPlayer } from "@/components/worship/QuranAudioPlayer";
import { RewardToast, useRewardToast, type RewardToastState } from "./RewardToast";
import {
  useWorshipData,
  type RealProfile,
  type UseWorshipDataReturn,
} from "@/hooks/useWorshipData";
import type { NavItem } from "@/lib/types";
import {
  Home,
  BookOpen,
  Landmark,
  Clock,
  Settings,
} from "lucide-react";

/* ==========================================================================
   هيكل مركز العبادات المشترك — بدل mockUser/mockNavItems في كل صفحة.

   • تنقّل واحد حقيقي: عبادتي / قرآن / أذكار / مواقيت الصلاة / الإعدادات.
   • المستخدم الحقيقي من جلسة Supabase — الاسم بيجي من البروفايل.
   • التوست بيترفع لكل الصفحات عبر context صغير عشان أي مكافأة مؤكدة تظهر.
   • شريط كوينز حقيقي في الشريط الجانبي (الرصيد جاي من الداتابيز).
   ========================================================================== */

/** عناصر التنقّل الحقيقية لمركز العبادات. */
export const WORSHIP_NAV_ITEMS: NavItem[] = [
  { label: "لوحة التحكم", href: "/dashboard", icon: Home },
  { label: "عباداتي", href: "/worship", icon: Landmark },
  { label: "القرآن", href: "/worship/quran", icon: BookOpen },
  { label: "الأذكار", href: "/worship/adhkar", icon: BookOpen },
  { label: "مواقيت الصلاة", href: "/worship/prayer-times", icon: Clock },
  { label: "الإعدادات", href: "/worship/settings", icon: Settings },
];

interface WorshipChromeProps {
  children: React.ReactNode;
  maxWidth?: string;
}

export function WorshipChrome({
  children,
  maxWidth = "max-w-5xl",
}: WorshipChromeProps) {
  const pathname = usePathname();
  const data = useWorshipData();

  const navItems = useMemo(
    () =>
      WORSHIP_NAV_ITEMS.map((item) => ({
        ...item,
        // الأب /worship نشط في كل صفحات العبادة الفرعية.
        active:
          item.href === pathname ||
          (item.href === "/worship" && ((pathname ?? "").startsWith("/worship") ?? false))
      })),
    [pathname],
  );

  return (
    <WorshipDataProvider data={data}>
      <div className="flex min-h-screen bg-[#07091A]">
        <WorshipSidebar
          items={navItems}
          profile={data.profile}
          authStatus={data.authStatus}
          coins={data.coinsBalance}
        />
        <main className="flex-1 px-4 py-6 md:px-6 md:py-8 pb-[calc(4rem+env(safe-area-inset-bottom,0.5rem))] md:pb-8">
          <div className={`mx-auto flex ${maxWidth} flex-col gap-6`}>
            {children}
          </div>
        </main>
        <MobileNav />
        <QuranAudioPlayer />
      </div>
    </WorshipDataProvider>
  );
}

/* -------------------------------------------------------------------------- */
/* الشريط الجانبي بنفس تصميم Sidebar + رصيد كوينز حقيقي                        */
/* -------------------------------------------------------------------------- */

function WorshipSidebar({
  items,
  profile,
  authStatus,
  coins,
}: {
  items: NavItem[];
  profile: RealProfile | null;
  authStatus: UseWorshipDataReturn["authStatus"];
  coins: number;
}) {
  const name =
    authStatus === "loading"
      ? "جاري التحميل…"
      : !profile
        ? "زائر — سجّل للحفظ"
        : profile.name;

  return (
    <Sidebar
      items={items}
      user={{
        name,
        initials: profile?.initials ?? "؟",
      }}
      subtitle={
        profile?.isAnonymous
          ? "حساب زائر"
          : authStatus === "signed-in"
            ? "عضو Magicly"
            : undefined
      }
      footer={
        authStatus === "signed-in" ? (
          <Link
            href="/shop"
            className="flex items-center justify-between gap-2 rounded-2xl border border-[#FFD54D]/20 bg-[#FFD54D]/[0.06] p-3 transition-colors hover:bg-[#FFD54D]/[0.1]"
            aria-label="الذهاب إلى المتجر"
          >
            <span className="text-sm font-bold text-[#FFD54D]">
              🪙 <bdi>{coins}</bdi>
            </span>
            <span className="text-xs text-[#9AA0C0]">المتجر</span>
          </Link>
        ) : null
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/* مشاركة حالة المكافآت والبيانات بين الصفحات والأجزاء                         */
/* -------------------------------------------------------------------------- */

interface WorshipRewardContextValue {
  toast: RewardToastState | null;
  showReward: (coins: number, label?: string) => void;
  clearReward: () => void;
}

const WorshipRewardContext = createContext<WorshipRewardContextValue>({
  toast: null,
  showReward: () => {},
  clearReward: () => {},
});

const WorshipDataContext = createContext<UseWorshipDataReturn | null>(null);

function WorshipDataProvider({
  data,
  children,
}: {
  data: UseWorshipDataReturn;
  children: React.ReactNode;
}) {
  const { reward, show, clear } = useRewardToast();

  const value = useMemo(
    () => ({ toast: reward, showReward: show, clearReward: clear }),
    [reward, show, clear],
  );

  const dataValue = useMemo(() => data, [data]);

  return (
    <WorshipDataContext.Provider value={dataValue}>
      <WorshipRewardContext.Provider value={value}>
        <RewardToast reward={reward} onDone={clear} />
        {children}
      </WorshipRewardContext.Provider>
    </WorshipDataContext.Provider>
  );
}

/** حالة المكافأة المشتركة — للتوست بعد تأكيد السيرفر. */
export function useWorshipReward(): WorshipRewardContextValue {
  return useContext(WorshipRewardContext);
}

/** بيانات العبادة المشاركة — null خارج WorshipChrome. */
export function useSharedWorshipData(): UseWorshipDataReturn | null {
  return useContext(WorshipDataContext);
}
