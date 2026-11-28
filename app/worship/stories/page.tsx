"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Heart,
  Landmark,
  Lightbulb,
  Sparkles,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { IconBadge } from "@/components/ui/IconBadge";
import { WorshipChrome } from "@/components/worship/WorshipChrome";
import { cn } from "@/lib/cn";
import {
  STORIES,
  STORY_CATEGORY_INFO,
  STORY_CATEGORY_ORDER,
  filterStoriesByCategory,
  getStoriesTotal,
  getStoryCategoryCounts,
  type Story,
  type StoryCategory,
} from "@/lib/islamic/stories-data";

/**
 * Stories Page — /worship/stories
 *
 * قسم "قصص الصحابة والتابعين" في مركز العبادات:
 *   • شبكة كروت الشخصيات → قارئ قصة (عنوان + فقرات + الدرس المستفاد).
 *   • فلترة بالفئة: صحابي / صحابية / تابع / تابعية.
 *   • نفس نظام صفحات العبادات: GlassCard على #07091A بلمسات خضراء.
 */

/** أيقونة ولون كل فئة — ألوان القسم المعتمدة فقط. */
const CATEGORY_STYLE: Record<StoryCategory, { icon: LucideIcon; color: string; bg: string }> = {
  sahabi: { icon: Users, color: "text-[#6EE7B7]", bg: "bg-[#10B981]/15" },
  sahabiyya: { icon: Heart, color: "text-[#6EE7B7]", bg: "bg-[#10B981]/15" },
  tabii: { icon: BookOpen, color: "text-[#6EE7B7]", bg: "bg-[#10B981]/15" },
  tabiiyya: { icon: Sparkles, color: "text-[#6EE7B7]", bg: "bg-[#10B981]/15" },
};

export default function StoriesPage() {
  return (
    <WorshipChrome>
      <StoriesHome />
    </WorshipChrome>
  );
}

function StoriesHome() {
  const [category, setCategory] = useState<StoryCategory | "all">("all");
  const [openStoryId, setOpenStoryId] = useState<string | null>(null);

  const counts = useMemo(() => getStoryCategoryCounts(), []);
  const filtered = useMemo(
    () => filterStoriesByCategory(category),
    [category],
  );

  const openIndex = openStoryId
    ? filtered.findIndex((story) => story.id === openStoryId)
    : -1;
  const openStory: Story | null = openIndex >= 0 ? filtered[openIndex] : null;

  const goNext = () => {
    if (openIndex >= 0 && openIndex < filtered.length - 1) {
      setOpenStoryId(filtered[openIndex + 1].id);
    }
  };
  const goPrev = () => {
    if (openIndex > 0) setOpenStoryId(filtered[openIndex - 1].id);
  };

  return (
    <div className="mx-auto max-w-3xl">
      {/* رأس القسم */}
      <Reveal index={0}>
        <div className="mb-6">
          <p className="text-sm text-[#9AA0C0]">مركز العبادات</p>
          <h1 className="mt-1 text-2xl font-bold text-white md:text-3xl">
            قصص الصحابة والتابعين
          </h1>
          <p className="mt-2 text-sm text-[#9AA0C0]">
            {getStoriesTotal()} قصة قصيرة من مواقف مشهورة ثابتة في كتب السيرة والتاريخ —
            لكل قصة درسٌ يُستفاد.
          </p>
        </div>
      </Reveal>

      {/* فلترة الفئات */}
      <Reveal index={1}>
        <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="فئات القصص">
          <CategoryChip
            label="الكل"
            count={STORIES.length}
            active={category === "all"}
            onClick={() => {
              setCategory("all");
              setOpenStoryId(null);
            }}
          />
          {STORY_CATEGORY_ORDER.map((key) => (
            <CategoryChip
              key={key}
              label={STORY_CATEGORY_INFO[key].label}
              count={counts[key]}
              active={category === key}
              onClick={() => {
                setCategory(key);
                setOpenStoryId(null);
              }}
            />
          ))}
        </div>
      </Reveal>

      {/* القارئ أو شبكة الكروت */}
      {openStory ? (
        <Reveal index={2}>
          <GlassCard glow className="p-6 mb-8">
            <div className="mb-4 flex items-center justify-between">
              <span className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-[#9AA0C0]">
                {openIndex + 1} / {filtered.length}
              </span>
              <button
                type="button"
                onClick={() => setOpenStoryId(null)}
                className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm text-[#9AA0C0] hover:bg-white/[0.04] hover:text-white"
                aria-label="إغلاق القارئ"
              >
                <ChevronRight size={16} aria-hidden />
                كل القصص
              </button>
            </div>

            <div className="mb-5 flex items-center gap-3">
              <IconBadge
                icon={CATEGORY_STYLE[openStory.category].icon}
                color={CATEGORY_STYLE[openStory.category].color}
                bg={CATEGORY_STYLE[openStory.category].bg}
                size={48}
              />
              <div>
                <h2 className="text-xl font-bold text-white">{openStory.title}</h2>
                <p className="text-sm text-[#6EE7B7]">
                  {openStory.person} — {openStory.role}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {openStory.paragraphs.map((paragraph, paragraphIndex) => (
                <p
                  key={paragraphIndex}
                  className="leading-loose text-[#E7EAF6] whitespace-pre-wrap"
                  dir="rtl"
                >
                  {paragraph}
                </p>
              ))}
            </div>

            {/* الدرس المستفاد */}
            <div className="mt-6 rounded-2xl border border-[#10B981]/30 bg-[#10B981]/10 p-4">
              <div className="mb-2 flex items-center gap-2">
                <IconBadge icon={Lightbulb} color="text-[#6EE7B7]" bg="bg-[#10B981]/20" size={32} />
                <p className="text-sm font-bold text-[#6EE7B7]">الدرس المستفاد</p>
              </div>
              <p className="leading-relaxed text-white">{openStory.lesson}</p>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-4">
              <button
                type="button"
                onClick={goNext}
                disabled={openIndex === filtered.length - 1}
                className="flex items-center gap-1 rounded-xl border border-white/[0.06] px-4 py-2 text-sm text-white disabled:opacity-40 hover:bg-white/[0.04]"
              >
                <ChevronLeft size={16} aria-hidden />
                القصة التالية
              </button>
              <button
                type="button"
                onClick={goPrev}
                disabled={openIndex === 0}
                className="flex items-center gap-1 rounded-xl border border-white/[0.06] px-4 py-2 text-sm text-white disabled:opacity-40 hover:bg-white/[0.04]"
              >
                القصة السابقة
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
          </GlassCard>
        </Reveal>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((story, index) => (
            <Reveal key={story.id} index={Math.min(index + 2, 8)}>
              <button
                type="button"
                onClick={() => setOpenStoryId(story.id)}
                className="block h-full w-full text-right"
                aria-label={`فتح قصة: ${story.title}`}
              >
                <GlassCard className="h-full p-5 transition-all hover:shadow-[0_12px_40px_rgba(0,0,0,0.4)] hover:border-[#10B981]/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <IconBadge
                        icon={CATEGORY_STYLE[story.category].icon}
                        color={CATEGORY_STYLE[story.category].color}
                        bg={CATEGORY_STYLE[story.category].bg}
                        size={44}
                      />
                      <div>
                        <p className="text-base font-bold text-white">{story.person}</p>
                        <p className="text-xs text-[#9AA0C0]">{story.role}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-white/[0.04] px-2.5 py-0.5 text-xs text-[#9AA0C0]">
                      {STORY_CATEGORY_INFO[story.category].label}
                    </span>
                  </div>

                  <p className="mt-4 text-sm font-medium text-[#6EE7B7]">{story.title}</p>
                  <p className="mt-2 leading-relaxed text-[#C7CBE6] line-clamp-2" dir="rtl">
                    {story.paragraphs[0]}
                  </p>

                  <div className="mt-4 flex items-center gap-1.5 border-t border-white/[0.04] pt-3 text-xs text-[#9AA0C0]">
                    <Landmark size={14} aria-hidden />
                    اقرأ القصة والدرس المستفاد
                  </div>
                </GlassCard>
              </button>
            </Reveal>
          ))}
          {filtered.length === 0 && (
            <GlassCard className="p-8 text-center sm:col-span-2">
              <p className="text-[#9AA0C0]">لا توجد قصص في هذه الفئة حالياً.</p>
            </GlassCard>
          )}
        </div>
      )}

      {/* رجوع لمركز العبادات */}
      <Reveal index={7}>
        <div className="mt-10 flex justify-center">
          <Link
            href="/worship"
            className="flex items-center gap-2 rounded-2xl border border-white/[0.06] px-5 py-2.5 text-sm text-[#9AA0C0] hover:bg-white/[0.04] hover:text-white"
          >
            <ChevronRight size={16} aria-hidden />
            رجوع إلى مركز العبادات
          </Link>
        </div>
      </Reveal>
    </div>
  );
}

/** شريحة فئة مُستخدمة في الفلترة. */
function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={cn(
        "rounded-full border px-4 py-1.5 text-sm transition-all",
        active
          ? "border-[#10B981]/50 bg-[#10B981]/15 text-[#6EE7B7]"
          : "border-white/[0.06] bg-white/[0.02] text-[#9AA0C0] hover:text-white",
      )}
    >
      {label}
      {typeof count === "number" && <span className="ml-1 text-xs opacity-70">({count})</span>}
    </button>
  );
}
