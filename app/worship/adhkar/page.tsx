"use client";

import { useCallback, useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { AdhkarCategoryCard } from "@/components/worship/AdhkarCategoryCard";
import { AdhkarReader } from "@/components/worship/AdhkarReader";
import {
  WorshipChrome,
  useSharedWorshipData,
  useWorshipReward,
} from "@/components/worship/WorshipChrome";
import { mockAdhkar } from "@/lib/islamic/mock-data";
import { ADHKAR_CATEGORY_INFO } from "@/lib/islamic/adhkar";
import { todayUtc } from "@/lib/worship-data";
import type { AdhkarCategory, Dhikr } from "@/lib/islamic/types";
import Link from "next/link";
import {
  ArrowLeft,
  Sun,
  Moon,
  Repeat,
  Sparkles,
  Landmark,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Adhkar Page — /worship/adhkar
 *
 * التقدّم المعروض من تقدّم المستخدم الحقيقي (محلي + سحابي)، والقارئ بيسجّل
 * الإتمام في الداتابيز ويصرف المكافأة بعد تأكيد السيرفر.
 */
export default function AdhkarPage() {
  return (
    <WorshipChrome>
      <AdhkarHome />
    </WorshipChrome>
  );
}

function AdhkarHome() {
  const shared = useSharedWorshipData();
  const { showReward } = useWorshipReward();
  const [openCategory, setOpenCategory] = useState<AdhkarCategory | null>(null);

  /** عدّاد كل تصنيف: أقصى المحلي والسحابي. */
  const counts = useMemo(() => {
    const out: Record<AdhkarCategory, number> = {
      morning: 0,
      evening: 0,
      "after-prayer": 0,
      sleep: 0,
      general: 0,
    };
    if (!shared) return out;
    const local = shared.progress.adhkar;
    const cloud = shared.summary?.cloud.adhkar ?? {};
    for (const key of Object.keys(out) as AdhkarCategory[]) {
      out[key] = Math.max(local[key]?.count ?? 0, cloud[key] ?? 0);
    }
    return out;
  }, [shared]);

  const categories = [
    "morning",
    "evening",
    "after-prayer",
    "sleep",
    "general",
  ] as const;

  const handleComplete = useCallback(
    (category: AdhkarCategory, totalCount: number) => {
      if (!shared || !shared.user || shared.user.is_anonymous) return;
      const day = todayUtc();
      void shared.recordEvent(
        (d) => ({
          ...d,
          adhkar: {
            ...d.adhkar,
            [category]: { completed: true, count: totalCount },
          },
        }),
        "worship_adhkar",
        `${day}-${category}`,
        { activity: "adhkar", category, date: day },
        (reward) => showReward(reward.coins),
      );
    },
    [shared, showReward],
  );

  if (openCategory) {
    return (
      <Reveal index={0}>
        <div className="flex flex-col">
          <AdhkarReader
            adhkar={mockAdhkar[openCategory]}
            category={openCategory}
            onComplete={() => handleComplete(openCategory, totalFor(openCategory))}
            onBack={() => setOpenCategory(null)}
          />
        </div>
      </Reveal>
    );
  }

  return (
    <>
      {/* Header */}
      <Reveal index={0}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">الأذكار</h1>
            <p className="mt-1 text-[#9AA0C0]">
              أذكار الصباح والمساء والنوم وبعد الصلاة
            </p>
          </div>
          <Link href="/worship" className={backLinkClass}>
            <ArrowLeft size={18} aria-hidden />
            <span>عباداتي</span>
          </Link>
        </div>
      </Reveal>

      {/* Category Grid */}
      <Reveal index={1}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat, index) => {
            const adhkar = mockAdhkar[cat];
            const info = ADHKAR_CATEGORY_INFO[cat];
            const totalCounts = adhkar.reduce(
              (sum: number, d: Dhikr) => sum + d.repeatCount,
              0,
            );
            const completedCounts = counts[cat];
            const isDone =
              completedCounts >= totalCounts && totalCounts > 0;
            const iconMap: Record<string, LucideIcon> = {
              sunrise: Sun,
              sunset: Moon,
              repeat: Repeat,
              moon: Moon,
              sparkles: Sparkles,
            };
            const CategoryIcon = iconMap[info.icon] || Sparkles;

            return (
              <button
                type="button"
                key={cat}
                onClick={() => setOpenCategory(cat)}
                className="text-right"
              >
                <AdhkarCategoryCard
                  category={cat}
                  index={index}
                  label={info.label}
                  description={info.description}
                  icon={CategoryIcon}
                  color={info.color}
                  bg={info.color.replace("text-", "bg-").replace("]", "/15]")}
                  progress={
                    totalCounts > 0
                      ? (completedCounts / totalCounts) * 100
                      : 0
                  }
                  completed={isDone}
                  count={completedCounts}
                  total={totalCounts}
                  href="#"
                />
              </button>
            );
          })}
        </div>
      </Reveal>

      {/* Info Card */}
      <Reveal index={2}>
        <GlassCard className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[#7C5CFF]/15 text-[#B69CFF]">
              <Landmark size={24} aria-hidden />
            </div>
            <div>
              <h3 className="mb-2 text-lg font-bold text-white">عن الأذكار</h3>
              <p className="leading-relaxed text-[#C7CBE6]">
                الأذكار هي كلماتٌ يذُكر بها العبدُ ربه سبحانه وتعالى في أوقاتٍ
                مخصوصة، وقد جاءت بها السنّة النبوية المطهرة. المحافظة عليها
                سببٌ للطمأنينة والبركة في الوقت والعمل، وحفظٌ من كل سوء.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#7C5CFF]/15 px-3 py-1 text-xs text-[#B69CFF]">
                  مصادر معتمدة
                </span>
                <span className="rounded-full bg-[#2DD4BF]/15 px-3 py-1 text-xs text-[#2DD4BF]">
                  بدون إنترنت
                </span>
                <span className="rounded-full bg-[#FB923C]/15 px-3 py-1 text-xs text-[#FB923C]">
                  عداد تفاعلي
                </span>
                <span className="rounded-full bg-[#B69CFF]/15 px-3 py-1 text-xs text-[#B69CFF]">
                  تتبع التقدم على حسابك
                </span>
              </div>
            </div>
          </div>
        </GlassCard>
      </Reveal>
    </>
  );
}

function totalFor(category: AdhkarCategory): number {
  const list = mockAdhkar[category];
  return list.reduce(
    (sum: number, d: Dhikr) => sum + d.repeatCount,
    0,
  );
}

const backLinkClass =
  "flex items-center gap-1 text-sm text-[#B69CFF] transition-colors hover:text-[#7C5CFF]";
