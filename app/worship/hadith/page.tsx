"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Gift,
  Heart,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { IconBadge } from "@/components/ui/IconBadge";
import { WorshipChrome } from "@/components/worship/WorshipChrome";
import { cn } from "@/lib/cn";
import {
  HADITHS,
  HADITH_CATEGORY_INFO,
  HADITH_CATEGORY_ORDER,
  getHadithOfTheDay,
  getHadithTotal,
  groupHadithsByCategory,
  searchHadiths,
  type Hadith,
  type HadithCategory,
} from "@/lib/islamic/hadith-data";

/**
 * Hadith Page — /worship/hadith
 *
 * قسم "الأحاديث الشريفة" في مركز العبادات:
 *   • حديث اليوم (ثابت يومياً بالتاريخ).
 *   • تصنيفات (إيمان/أخلاق/علم/أذكار/صدقة) + بحث نصي.
 *   • قارئ بسيط للتنقل بين الأحاديث.
 *   • إضافات من الموسوعة عبر البروكسي /api/worship/hadith (كاش + fallback).
 */

/** أيقونة ولون كل تصنيف — ألوان القسم المعتمدة (أخضر/fاتح فقط). */
const CATEGORY_STYLE: Record<HadithCategory, { icon: LucideIcon; color: string; bg: string }> = {
  iman: { icon: Heart, color: "text-[#6EE7B7]", bg: "bg-[#10B981]/15" },
  akhlaq: { icon: Users, color: "text-[#6EE7B7]", bg: "bg-[#10B981]/15" },
  ilm: { icon: BookOpen, color: "text-[#6EE7B7]", bg: "bg-[#10B981]/15" },
  adhkar: { icon: Sparkles, color: "text-[#6EE7B7]", bg: "bg-[#10B981]/15" },
  sadaqah: { icon: Gift, color: "text-[#6EE7B7]", bg: "bg-[#10B981]/15" },
};

/** حديث مقتطع للعرض في الكروت (نهاية المتن). */
function hadithPreview(text: string, max = 160): string {
  // نمسح الإسناد البادئ ونُبقي متن الحديث للعرض.
  const cut = text.length > max ? `${text.slice(0, max)}…` : text;
  return cut;
}

export default function HadithPage() {
  return (
    <WorshipChrome>
      <HadithHome />
    </WorshipChrome>
  );
}

function HadithHome() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<HadithCategory | "all">("all");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [extras, setExtras] = useState<Hadith[]>([]);
  const [extrasFailed, setExtrasFailed] = useState(false);

  /** حديث اليوم — ثابت خلال اليوم بالتاريخ (useMemo يمنع أي تغيّر بالريندر). */
  const dailyHadith = useMemo(() => getHadithOfTheDay(), []);
  const grouped = useMemo(() => groupHadithsByCategory(), []);
  const filtered = useMemo(
    () => searchHadiths(query, category),
    [query, category],
  );

  /** جلب الإضافات من البروكسي — بلا fetch مباشر من الكلاينت لمصادر خارجية. */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/worship/hadith")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("bad-status"))))
      .then((data: { source?: string; hadiths?: Hadith[] }) => {
        if (cancelled) return;
        if (data?.source === "api" && Array.isArray(data.hadiths) && data.hadiths.length > 0) {
          const staticIds = new Set(HADITHS.map((h) => h.id));
          setExtras(data.hadiths.filter((h) => !staticIds.has(h.id)));
        }
      })
      .catch(() => {
        if (!cancelled) setExtrasFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentList = openIndex === null ? null : filtered;
  const currentHadith = currentList && currentList.length > 0 ? currentList[openIndex as number] : null;

  return (
    <div className="mx-auto max-w-3xl">
      {/* رأس القسم */}
      <Reveal index={0}>
        <div className="mb-6">
          <p className="text-sm text-[#9AA0C0]">مركز العبادات</p>
          <h1 className="mt-1 text-2xl font-bold text-white md:text-3xl">
            الأحاديث الشريفة
          </h1>
          <p className="mt-2 text-sm text-[#9AA0C0]">
            {getHadithTotal()} حديثاً مختاراً من الصحيحين — البخاري ومسلم — بالتصنيف والبحث.
          </p>
        </div>
      </Reveal>

      {/* حديث اليوم */}
      <Reveal index={1}>
        <GlassCard glow className="p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <IconBadge icon={Sparkles} color="text-[#6EE7B7]" bg="bg-[#10B981]/15" size={44} />
            <div>
              <p className="text-xs text-[#9AA0C0]">حديث اليوم</p>
              <p className="text-sm font-bold text-[#6EE7B7]">{dailyHadith.source}</p>
            </div>
          </div>
          <p className="text-lg leading-loose text-white whitespace-pre-wrap" dir="rtl">
            {dailyHadith.text}
          </p>
          <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs text-[#9AA0C0]">
            <span>الراوي: {dailyHadith.narrator} رضي الله عنه</span>
            <a
              href={dailyHadith.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4 hover:text-[#6EE7B7]"
            >
              تحقّق من المصدر
            </a>
          </div>
        </GlassCard>
      </Reveal>

      {/* البحث + التصنيفات */}
      <Reveal index={2}>
        <div className="relative mb-4">
          <Search
            size={18}
            className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[#9AA0C0]"
            aria-hidden
          />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpenIndex(null);
            }}
            placeholder="ابحث في نصوص الأحاديث والراويين…"
            className="w-full rounded-2xl border border-white/[0.06] bg-[#0D1029]/70 px-12 py-3 text-white placeholder:text-[#9AA0C0]/70 outline-none focus:border-[#10B981]/40"
            aria-label="البحث في الأحاديث"
          />
        </div>

        <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="تصنيفات الأحاديث">
          <CategoryChip
            label="الكل"
            active={category === "all"}
            onClick={() => {
              setCategory("all");
              setOpenIndex(null);
            }}
          />
          {HADITH_CATEGORY_ORDER.map((key) => (
            <CategoryChip
              key={key}
              label={HADITH_CATEGORY_INFO[key].label}
              count={grouped[key].length}
              active={category === key}
              onClick={() => {
                setCategory(key);
                setOpenIndex(null);
              }}
            />
          ))}
        </div>
      </Reveal>

      {/* القارئ أو شبكة الكروت */}
      {currentHadith ? (
        <Reveal index={3}>
          <GlassCard className="p-6 mb-8">
            <div className="mb-4 flex items-center justify-between">
              <span className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-[#9AA0C0]">
                {(openIndex as number) + 1} / {filtered.length}
              </span>
              <button
                type="button"
                onClick={() => setOpenIndex(null)}
                className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm text-[#9AA0C0] hover:bg-white/[0.04] hover:text-white"
                aria-label="إغلاق القارئ"
              >
                <X size={16} aria-hidden />
                إغلاق
              </button>
            </div>

            <p className="text-lg leading-loose text-white whitespace-pre-wrap" dir="rtl">
              {currentHadith.text}
            </p>

            <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs text-[#9AA0C0]">
              <span>
                {HADITH_CATEGORY_INFO[currentHadith.category].label} — الراوي:{" "}
                {currentHadith.narrator} رضي الله عنه
              </span>
              <a
                href={currentHadith.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 hover:text-[#6EE7B7]"
              >
                {currentHadith.source}
              </a>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setOpenIndex((prev) => (prev === null ? null : Math.min((prev as number) + 1, filtered.length - 1)))}
                disabled={openIndex === filtered.length - 1}
                className="flex items-center gap-1 rounded-xl border border-white/[0.06] px-4 py-2 text-sm text-white disabled:opacity-40 hover:bg-white/[0.04]"
              >
                <ChevronLeft size={16} aria-hidden />
                التالي
              </button>
              <button
                type="button"
                onClick={() => setOpenIndex((prev) => (prev === null ? null : Math.max((prev as number) - 1, 0)))}
                disabled={openIndex === 0}
                className="flex items-center gap-1 rounded-xl border border-white/[0.06] px-4 py-2 text-sm text-white disabled:opacity-40 hover:bg-white/[0.04]"
              >
                السابق
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
          </GlassCard>
        </Reveal>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((hadith, index) => (
            <Reveal key={hadith.id} index={Math.min(index + 3, 8)}>
              <button
                type="button"
                onClick={() => setOpenIndex(index)}
                className="block h-full w-full text-right"
                aria-label={`فتح الحديث: ${hadith.source}`}
              >
                <GlassCard className="h-full p-5 transition-all hover:shadow-[0_12px_40px_rgba(0,0,0,0.4)] hover:border-[#10B981]/30">
                  <div className="mb-3 flex items-center gap-2">
                    <IconBadge
                      icon={CATEGORY_STYLE[hadith.category].icon}
                      color={CATEGORY_STYLE[hadith.category].color}
                      bg={CATEGORY_STYLE[hadith.category].bg}
                      size={36}
                    />
                    <span className="rounded-full bg-white/[0.04] px-2.5 py-0.5 text-xs text-[#9AA0C0]">
                      {HADITH_CATEGORY_INFO[hadith.category].label}
                    </span>
                  </div>
                  <p className="leading-relaxed text-white line-clamp-3" dir="rtl">
                    {hadithPreview(hadith.text)}
                  </p>
                  <div className="mt-4 flex items-center justify-between border-t border-white/[0.04] pt-3 text-xs text-[#9AA0C0]">
                    <span>{hadith.narrator} رضي الله عنه</span>
                    <span>{hadith.source}</span>
                  </div>
                </GlassCard>
              </button>
            </Reveal>
          ))}
          {filtered.length === 0 && (
            <GlassCard className="p-8 text-center sm:col-span-2">
              <p className="text-[#9AA0C0]">لا توجد نتائج مطابقة — جرّب كلمة أخرى.</p>
            </GlassCard>
          )}
        </div>
      )}

      {/* إضافات من الموسوعة (بروكسي الـ API مع fallback للداتا الثابتة) */}
      {extras.length > 0 && !currentHadith && (
        <Reveal index={6}>
          <div className="mt-10">
            <div className="mb-4 flex items-center gap-2">
              <IconBadge icon={BookOpen} color="text-[#6EE7B7]" bg="bg-[#10B981]/15" size={40} />
              <div>
                <p className="text-lg font-bold text-white">إضافات من الموسوعة</p>
                <p className="text-xs text-[#9AA0C0]">أحاديث أخرى من الصحيحين تُجاب عبر بروكسي مع كاش أسبوعي.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {extras.map((hadith) => (
                <GlassCard key={`extra-${hadith.id}`} className="p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <IconBadge
                      icon={CATEGORY_STYLE[hadith.category].icon}
                      color={CATEGORY_STYLE[hadith.category].color}
                      bg={CATEGORY_STYLE[hadith.category].bg}
                      size={36}
                    />
                    <span className="rounded-full bg-white/[0.04] px-2.5 py-0.5 text-xs text-[#9AA0C0]">
                      {HADITH_CATEGORY_INFO[hadith.category].label}
                    </span>
                  </div>
                  <p className="leading-relaxed text-white line-clamp-4" dir="rtl">
                    {hadithPreview(hadith.text, 220)}
                  </p>
                  <div className="mt-4 flex items-center justify-between border-t border-white/[0.04] pt-3 text-xs text-[#9AA0C0]">
                    <span>{hadith.narrator} رضي الله عنه</span>
                    <a
                      href={hadith.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4 hover:text-[#6EE7B7]"
                    >
                      {hadith.source}
                    </a>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        </Reveal>
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

/** شريحة تصنيف مُستخدمة في الفلترة. */
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
