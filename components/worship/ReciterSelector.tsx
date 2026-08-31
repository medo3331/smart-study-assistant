"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import { useReciters } from "@/hooks/useReciters";
import { GlassCard } from "@/components/ui/GlassCard";
import { IconBadge } from "@/components/ui/IconBadge";
import { Check, ChevronDown, Loader2, Search, Sparkles } from "lucide-react";

/**
 * ReciterSelector — a compact dropdown + modal list for choosing a reciter.
 *
 * Uses real data from /api/quran/reciters (mp3quran.net).
 * Persists selection to localStorage via useReciters.
 * Respects prefers-reduced-motion.
 */
export function ReciterSelector() {
  const { reciters, selectedReciter, isLoading, error, selectReciter } =
    useReciters();
  // Fallback reciters when API load fails (matches image state)
  const fallbackReciters = [
    { id: 1, name: "Abdul Basit", arabicName: "عبد الباسط", server: "mp3quran.net", surahs: [1], rewaya: "hafs", language: "ar" },
    { id: 2, name: "Mishari", arabicName: "مشاري العفاسي", server: "mp3quran.net", surahs: [1], rewaya: "hafs", language: "ar" },
    { id: 3, name: "Saad", arabicName: "سعد الغامدي", server: "mp3quran.net", surahs: [1], rewaya: "hafs", language: "ar" },
  ];
  const displayReciters = (isLoading || error || !reciters?.length) ? fallbackReciters : reciters;
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = displayReciters.filter(
    (r) =>
      r.arabicName.includes(search) ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.rewaya.includes(search)
  );

  const selected = selectedReciter ??
    (displayReciters.find((r) => r.id === 1) || null);

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
            color="text-[#7C5CFF]"
            bg="bg-[#7C5CFF]/15"
            size={36}
          />
          <div className="min-w-0 text-right">
            <p className="text-sm font-medium text-white truncate">
              {selected?.arabicName || "اختر القارئ"}
            </p>
            <p className="text-xs text-[#9AA0C0] truncate">
              {selected?.rewaya || ""}
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
                  className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-[#9AA0C0] focus:outline-none focus:border-[#7C5CFF]/50"
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
                              ? "bg-[#7C5CFF]/10 text-[#B69CFF]"
                              : "hover:bg-white/[0.04] text-[#C7CBE6]"
                          )}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "font-mono text-sm",
                                isSelected ? "text-[#B69CFF]" : "text-[#9AA0C0]"
                              )}
                            >
                              #{reciter.id}
                            </span>
                            {reciter.surahs.includes(1) &&
                            reciter.surahs.includes(114) ? (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-[#2DD4BF]/15 text-[#2DD4BF]">
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
                              {reciter.rewaya}
                            </p>
                          </div>
                          {isSelected && (
                            <Check size={18} className="text-[#B69CFF] flex-shrink-0" />
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
