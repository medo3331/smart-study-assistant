"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import { useReciters } from "@/hooks/useReciters";
import { useQuranAudio } from "@/hooks/useQuranAudio";
import type { RecitationStyle } from "@/app/dashboard/components/audio-library";
import { GlassCard } from "@/components/ui/GlassCard";
import { IconBadge } from "@/components/ui/IconBadge";
import { Check, ChevronDown, Loader2, Search, Sparkles } from "lucide-react";

/**
 * ReciterSelector — a compact dropdown + modal list for choosing a reciter.
 *
 * Uses real data from /api/quran/reciters (mp3quran.net).
 * Persists selection to localStorage via useReciters.
 * Respects prefers-reduced-motion.
 *
 * أداء التلاوة (مرتل/مجود): مبدّل فوق القايمة بيقرا ويكتب في حالة
 * المشغّل نفسه (useQuranAudio.setStyle) — مش في الـ hook ده — عشان
 * القرار يوصل للتشغيل بغض النظر عن مين اللي بيدوس play. لما المستخدم
 * يختار «مجوّد» والقارئ الحالي ماعندوش نسخة مجودة، بنعرض القرّاء اللي
 * عندهم مجود بس ونولّي على أول واحد فيهم (مع إرجاع القارئ القديم لو
 * رجع للمرتل).
 */

/** سطر الرواية المعروض حسب الأداء المختار. */
function rewayaLabel(reciter: { rewaya: string } | null, style: RecitationStyle): string {
  if (!reciter) return "";
  return style === "mujawwad" ? "حفص عن عاصم — مجوّد" : reciter.rewaya;
}

export function ReciterSelector() {
  const { reciters, selectedReciter, isLoading, error, selectReciter } =
    useReciters();
  const { currentStyle, setStyle } = useQuranAudio();
  // الهوك نفسه بيرجّع ليستة احتياطية بروابط حقيقية لو الـ API وقع —
  // الـ fallback الوهمي القديم (server: "mp3quran.net" من غير مسار)
  // كان بيختار قارئ بروابط مكسورة والصوت ميشتغلش.
  const displayReciters = reciters;
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // القارئ اللي كان مختار على المرتل قبل التحول للمجود — بنرجّعه لو رجع.
  const murattalReciterIdRef = useRef<number | null>(null);

  // القرّاء اللي عندهم نسخة مجودة فعلاً (سيرفر من المصدر المعروف).
  const mujawwadReciters = displayReciters.filter((r) => r.mujawwadServer);

  // في وضع المجود بنعرض القرّاء اللي عندهم نسخة مجودة بس.
  const styleFiltered =
    currentStyle === "mujawwad" ? mujawwadReciters : displayReciters;

  const filtered = styleFiltered.filter(
    (r) =>
      (r.arabicName ?? "").includes(search) ||
      (r.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (r.rewaya ?? "").includes(search)
  );

  const selected = selectedReciter ?? displayReciters[0] ?? null;
  const noMujawwadAtAll = mujawwadReciters.length === 0;

  const handleStyleChange = (style: RecitationStyle) => {
    if (style === currentStyle) return;

    if (style === "mujawwad") {
      // القارئ الحالي ماعندوش نسخة مجودة؟ نحتفظ بيه ونولّي على أول
      // قارئ عنده مجود — والقايمة أصلاً بتعرض القادرين على المجود بس.
      if (selected && !selected.mujawwadServer) {
        murattalReciterIdRef.current = selected.id;
        const next = mujawwadReciters[0];
        if (next) selectReciter(next.id);
      }
    } else if (
      murattalReciterIdRef.current !== null &&
      displayReciters.some((r) => r.id === murattalReciterIdRef.current)
    ) {
      // رجع للمرتل: نرجّع القارئ اللي كان مختاره قبل التحول للمجود.
      selectReciter(murattalReciterIdRef.current);
      murattalReciterIdRef.current = null;
    }

    setStyle(style);
  };

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-right transition-colors hover:bg-white/[0.06]"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <IconBadge
            icon={Sparkles}
            color="text-[#10B981]"
            bg="bg-[#10B981]/15"
            size={36}
          />
          <div className="min-w-0 text-right">
            <p className="text-sm font-medium text-white truncate">
              {selected?.arabicName || "اختر القارئ"}
            </p>
            <p className="text-xs text-[#9AA0C0] truncate">
              {rewayaLabel(selected, currentStyle) || ""}
            </p>
          </div>
        </div>
        <ChevronDown
          size={18}
          className={cn(
            "text-[#9AA0C0] transition-transform",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0, y: -10, scale: 0.95 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full left-0 right-0 mt-2 z-50"
          >
            <GlassCard className="p-2 w-full max-h-80">
              {/* مبدّل الأداء: مرتل (الأداء العادي) / مجوّد (التجويد الكامل) */}
              <div
                className="flex items-center gap-1 mb-2 rounded-xl bg-white/[0.04] border border-white/[0.08] p-1"
                role="radiogroup"
                aria-label="أداء التلاوة"
              >
                {(
                  [
                    ["murattal", "مرتل"],
                    ["mujawwad", "مجوّد"],
                  ] as Array<[RecitationStyle, string]>
                ).map(([style, label]) => {
                  const active = currentStyle === style;
                  const unavailable = style === "mujawwad" && noMujawwadAtAll;
                  return (
                    <button
                      key={style}
                      role="radio"
                      aria-checked={active}
                      disabled={unavailable}
                      title={
                        unavailable
                          ? "المجوّد مش متاح — مفيش قارئ متاح عنده نسخة مجودة دلوقتي"
                          : undefined
                      }
                      onClick={() => handleStyleChange(style)}
                      className={cn(
                        "flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors",
                        active
                          ? "bg-[#10B981]/20 text-[#6EE7B7]"
                          : "text-[#9AA0C0] hover:text-white",
                        unavailable && "opacity-40 cursor-not-allowed hover:text-[#9AA0C0]"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* القارئ الحالي ماعندوش مجود والمستخدم طلب مجود — إيضاح التحول التلقائي */}
              {currentStyle === "mujawwad" && selected && !selected.mujawwadServer && (
                <p className="px-2 pb-2 text-xs text-[#FB923C]">
                  المجوّد مش متاح للقارئ ده — اتولّينا على أقرب قارئ عنده نسخة مجوّدة.
                </p>
              )}

              {/* Search */}
              <div className="relative mb-2">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA0C0]"
                  aria-hidden
                />
                <input
                  type="search"
                  placeholder="ابحث عن قارئ..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-[#9AA0C0] focus:outline-none focus:border-[#10B981]/50"
                  dir="rtl"
                />
              </div>

              {/* List */}
              {isLoading && (
                <div className="flex items-center justify-center py-6 text-[#9AA0C0]">
                  <Loader2 size={20} className="animate-spin mr-2" />
                  جاري تحميل القراء...
                </div>
              )}

              {error && (
                <div className="py-4 text-center text-[#FB923C] text-sm">
                  {error}
                </div>
              )}

              {!isLoading && !error && (
                <div
                  className="max-h-64 overflow-y-auto"
                  role="listbox"
                  aria-label="اختيار القارئ"
                >
                  {filtered.length === 0 ? (
                    <p className="text-center py-4 text-sm text-[#9AA0C0]">
                      لا يوجد قراة مطابقون
                    </p>
                  ) : (
                    filtered.map((reciter) => {
                      const isSelected = selected?.id === reciter.id;
                      return (
                        <button
                          key={reciter.id}
                          onClick={() => {
                            selectReciter(reciter.id);
                            setOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-right transition-colors",
                            isSelected
                              ? "bg-[#10B981]/10 text-[#6EE7B7]"
                              : "hover:bg-white/[0.04] text-[#C7CBE6]"
                          )}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "font-mono text-sm",
                                isSelected ? "text-[#6EE7B7]" : "text-[#9AA0C0]"
                              )}
                            >
                              #{reciter.id}
                            </span>
                            {reciter.surahs.includes(1) &&
                            reciter.surahs.includes(114) ? (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-[#34D399]/15 text-[#34D399]">
                                114 سورة
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-[#9AA0C0]/15 text-[#9AA0C0]">
                                {reciter.surahs.length} سورة
                              </span>
                            )}
                          </div>
                          <div className="text-right min-w-0 flex-1">
                            <p className="font-medium">{reciter.arabicName}</p>
                            <p className="text-xs text-[#9AA0C0]">
                              {rewayaLabel(reciter, currentStyle)}
                            </p>
                          </div>
                          {isSelected && (
                            <Check size={18} className="text-[#6EE7B7] flex-shrink-0" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click-outside to close */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
