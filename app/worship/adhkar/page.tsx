"use client";

import { useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { MobileNav } from "@/components/dashboard/MobileNav";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { AdhkarCategoryCard } from "@/components/worship/AdhkarCategoryCard";
import { AdhkarReader } from "@/components/worship/AdhkarReader";
import { mockNavItems, mockUser } from "@/lib/mock-data";
import { mockAdhkar, mockAdhkarProgress } from "@/lib/islamic/mock-data";
import { ADHKAR_CATEGORY_INFO } from "@/lib/islamic/adhkar";
import { QuranAudioPlayer } from "@/components/worship/QuranAudioPlayer";
import {
  Sun,
  Moon,
  Repeat,
  Sparkles,
  ChevronRight,
  ArrowLeft,
  Landmark,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

/**
 * Adhkar Page
 * /worship/adhkar
 *
 * Browse adhkar categories, then read with the interactive counter.
 * Includes MobileNav and sticky audio player.
 */
export const dynamic = "force-dynamic";

export default function AdhkarPage() {
  const navItems = mockNavItems.map((item) =>
    item.href === "/worship"
      ? { ...item, active: true }
      : { ...item, active: false }
  );

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showReader, setShowReader] = useState(false);

  const categories = [
    { id: "morning" as const, ...ADHKAR_CATEGORY_INFO.morning },
    { id: "evening" as const, ...ADHKAR_CATEGORY_INFO.evening },
    { id: "after-prayer" as const, ...ADHKAR_CATEGORY_INFO["after-prayer"] },
    { id: "sleep" as const, ...ADHKAR_CATEGORY_INFO.sleep },
    { id: "general" as const, ...ADHKAR_CATEGORY_INFO.general },
  ];

  const handleCategoryClick = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setShowReader(true);
  };

  const handleBack = () => {
    setShowReader(false);
    setSelectedCategory(null);
  };

  const handleComplete = () => {
    // Handle completion - could update progress in database
    console.log("Category completed:", selectedCategory);
  };

  return (
    <div className="flex min-h-screen bg-[#07091A]">
      <Sidebar items={navItems} user={mockUser} />

      <main className="flex-1 px-4 py-6 md:px-6 md:py-8 pb-[calc(4rem+env(safe-area-inset-bottom,0.5rem)] md:pb-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          {/* Header */}
          <Reveal index={0}>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white">الأذكار</h1>
                <p className="text-[#9AA0C0] mt-1">
                  أذكار الصباح والمساء والنوم وبعد الصلاة
                </p>
              </div>
              <Link
                href="/worship"
                className="flex items-center gap-1 text-sm text-[#B69CFF] hover:text-[#7C5CFF] transition-colors"
              >
                <ArrowLeft size={18} aria-hidden />
                <span>عباداتي</span>
              </Link>
            </div>
          </Reveal>

          {/* Category Grid */}
          {!showReader && (
            <Reveal index={1}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories.map((cat, index) => {
                  const adhkar =
                    mockAdhkar[cat.id as keyof typeof mockAdhkar];
                  const progress =
                    mockAdhkarProgress[
                      cat.id as keyof typeof mockAdhkarProgress
                    ];
                  const totalDhikrs = adhkar.length;
                  const totalCounts = adhkar.reduce(
                    (sum: number, d: (typeof adhkar)[0]) =>
                      sum + d.repeatCount,
                    0
                  );
                  const completedCounts = progress?.currentCount || 0;
                  const progressPct =
                    totalCounts > 0
                      ? (completedCounts / totalCounts) * 100
                      : 0;

                  const iconMap: Record<string, LucideIcon> = {
                    sunrise: Sun,
                    sunset: Moon,
                    repeat: Repeat,
                    moon: Moon,
                    sparkles: Sparkles,
                  };
                  const CategoryIcon = iconMap[cat.icon] || Sparkles;

                  return (
                    <AdhkarCategoryCard
                      key={cat.id}
                      category={cat.id}
                      label={cat.label}
                      description={cat.description}
                      icon={CategoryIcon}
                      color={cat.color}
                      bg={cat.color
                        .replace("text-", "bg-")
                        .replace("]", "/15]")}
                      progress={progressPct}
                      completed={progress?.completed || false}
                      count={completedCounts}
                      total={totalCounts}
                      href={`/worship/adhkar/${cat.id}`}
                      index={index}
                    />
                  );
                })}
              </div>
            </Reveal>
          )}

          {/* Adhkar Reader */}
          {showReader && selectedCategory && (
            <Reveal index={1}>
              <AdhkarReader
                adhkar={
                  mockAdhkar[selectedCategory as keyof typeof mockAdhkar]
                }
                category={selectedCategory as keyof typeof mockAdhkar}
                onComplete={handleComplete}
                onBack={handleBack}
              />
            </Reveal>
          )}

          {/* Info Card */}
          {!showReader && (
            <Reveal index={2}>
              <GlassCard className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 flex h-12 w-12 items-center justify-center rounded-xl bg-[#7C5CFF]/15 text-[#B69CFF]">
                    <Landmark size={24} aria-hidden />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-2">
                      عن الأذكار
                    </h3>
                    <p className="text-[#C7CBE6] leading-relaxed">
                      الأذكار هي كلماتٌ يذُكر بها العبدُ ربه سبحانه وتعالى في
                      أوقاتٍ مخصوصة، وقد جاءت بها السنّة النبوية المطهرة.
                      المحافظة عليها سببٌ للطمأنينة والبركة في الوقت والعمل،
                      وحفظٌ من كل سوء.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="px-3 py-1 rounded-full text-xs bg-[#7C5CFF]/15 text-[#B69CFF]">
                        مصادر معتمدة
                      </span>
                      <span className="px-3 py-1 rounded-full text-xs bg-[#2DD4BF]/15 text-[#2DD4BF]">
                        بدون إنترنت
                      </span>
                      <span className="px-3 py-1 rounded-full text-xs bg-[#FB923C]/15 text-[#FB923C]">
                        عداد تفاعلي
                      </span>
                      <span className="px-3 py-1 rounded-full text-xs bg-[#B69CFF]/15 text-[#B69CFF]">
                        تتبع التقدم
                      </span>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </Reveal>
          )}
        </div>
      </main>

      {/* MobileNav + Sticky Audio Player */}
      <MobileNav />
      <QuranAudioPlayer />
    </div>
  );
}