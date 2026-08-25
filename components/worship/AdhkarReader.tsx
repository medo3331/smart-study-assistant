"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { IconBadge } from "@/components/ui/IconBadge";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import type { Dhikr, AdhkarCategory } from "@/lib/islamic/types";
import { 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle, 
  RotateCcw, 
  Volume2,
  Sun,
  Moon,
  Sparkles,
  BookOpen,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface AdhkarReaderProps {
  adhkar: Dhikr[];
  category: AdhkarCategory;
  onComplete?: () => void;
  onBack?: () => void;
}

const CATEGORY_ICONS: Record<AdhkarCategory, LucideIcon> = {
  morning: Sun,
  evening: Moon,
  "after-prayer": Sparkles,
  sleep: Moon,
  general: BookOpen,
};

const CATEGORY_COLORS: Record<AdhkarCategory, { color: string; bg: string }> = {
  morning: { color: "text-[#FB923C]", bg: "bg-[#FB923C]/15" },
  evening: { color: "text-[#F97316]", bg: "bg-[#F97316]/15" },
  "after-prayer": { color: "text-[#2DD4BF]", bg: "bg-[#2DD4BF]/15" },
  sleep: { color: "text-[#7C5CFF]", bg: "bg-[#7C5CFF]/15" },
  general: { color: "text-[#B69CFF]", bg: "bg-[#7C5CFF]/15" },
};

const CATEGORY_LABELS: Record<AdhkarCategory, string> = {
  morning: "أذكار الصباح",
  evening: "أذكار المساء",
  "after-prayer": "أذكار بعد الصلاة",
  sleep: "أذكار النوم",
  general: "أذكار متنوعة",
};

/**
 * Adhkar Reader Component
 * Displays dhikr with counter, navigation, and completion tracking
 */
export function AdhkarReader({ 
  adhkar, 
  category, 
  onComplete,
  onBack 
}: AdhkarReaderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [counts, setCounts] = useState<number[]>(() => adhkar.map(() => 0));
  const [completed, setCompleted] = useState<boolean[]>(() => adhkar.map(() => false));
  const [showCelebration, setShowCelebration] = useState(false);

  const CategoryIcon = CATEGORY_ICONS[category];
  const { color, bg } = CATEGORY_COLORS[category];

  const currentDhikr = adhkar[currentIndex];
  const isLast = currentIndex === adhkar.length - 1;
  const allCompleted = completed.every(c => c);

  const incrementCount = useCallback((index: number) => {
    setCounts(prev => {
      const newCounts = [...prev];
      newCounts[index] = Math.min(newCounts[index] + 1, adhkar[index].repeatCount);
      
      // Check if this dhikr is now complete
      if (newCounts[index] >= adhkar[index].repeatCount && !completed[index]) {
        setCompleted(prev => {
          const newCompleted = [...prev];
          newCompleted[index] = true;
          
          // Check if all are complete
          if (newCompleted.every(c => c)) {
            setTimeout(() => setShowCelebration(true), 300);
            setTimeout(() => onComplete?.(), 1000);
          }
          return newCompleted;
        });
      }
      return newCounts;
    });
  }, [adhkar, completed, onComplete]);

  const goNext = useCallback(() => {
    if (currentIndex < adhkar.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, adhkar.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const resetDhikr = useCallback((index: number) => {
    setCounts(prev => {
      const newCounts = [...prev];
      newCounts[index] = 0;
      return newCounts;
    });
    setCompleted(prev => {
      const newCompleted = [...prev];
      newCompleted[index] = false;
      return newCompleted;
    });
  }, []);

  const progress = adhkar.length > 0 
    ? (completed.filter(c => c).length / adhkar.length) * 100 
    : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <Reveal index={0}>
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" icon={ChevronRight} iconPosition="start" onClick={onBack} className="gap-1">
            رجوع
          </Button>
          
          <div className="flex items-center gap-3 flex-1 justify-center">
            <IconBadge icon={CategoryIcon} color={color} bg={bg} size={44} />
            <div className="text-center">
              <p className="text-sm text-[#9AA0C0]">أنت في</p>
              <p className="text-lg font-bold text-white">{CATEGORY_LABELS[category]}</p>
            </div>
          </div>
          
          <div className="w-20" />
        </div>
      </Reveal>

      {/* Progress Bar */}
      <Reveal index={1}>
        <GlassCard className="p-3 mb-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-[#9AA0C0]">التقدم الكلي</span>
            <span className="font-mono font-bold text-white">{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-[#7C5CFF] to-[#2DD4BF] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
          <p className="text-xs text-[#9AA0C0] mt-2 text-center">
            {completed.filter(c => c).length} من {adhkar.length} أذكار مكتملة
          </p>
        </GlassCard>
      </Reveal>

      {/* Dhikr Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="flex-1 flex flex-col"
        >
          <Reveal index={2}>
            <GlassCard className="flex-1 flex flex-col p-6 relative overflow-hidden">
              {/* Background glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-transparent via-[rgba(124,92,255,0.03)] to-transparent" aria-hidden />
              
              <div className="relative z-10 flex flex-col flex-1 items-center justify-center text-center px-4">
                {/* Dhikr Counter */}
                <div className="mb-6">
                  <p className="text-xs text-[#9AA0C0] mb-2">التكرار</p>
                  <div className="flex items-center justify-center gap-4">
                    <Button
                      variant="ghost"
                      icon={RotateCcw}
                      onClick={() => resetDhikr(currentIndex)}
                      className="h-10 w-10 p-0"
                      aria-label="إعادة العداد"
                    >
                      <span className="sr-only">إعادة العداد</span>
                    </Button>
                    <div className="flex items-baseline gap-1">
                      <motion.span
                        key={counts[currentIndex]}
                        className="font-mono text-5xl font-bold text-white"
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      >
                        {counts[currentIndex]}
                      </motion.span>
                      <span className="text-xl text-[#9AA0C0] font-mono">/ {currentDhikr?.repeatCount}</span>
                    </div>
                    <Button
                      variant="primary"
                      onClick={() => incrementCount(currentIndex)}
                      className="h-12 px-6"
                      disabled={counts[currentIndex] >= currentDhikr?.repeatCount}
                    >
                      اضغط للتسبيح
                    </Button>
                  </div>
                </div>

                {/* Dhikr Text */}
                <div className="mb-6 max-w-xl">
                  <div className="mb-3 flex items-center justify-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-white/[0.04] text-xs font-medium text-[#9AA0C0]">
                      {currentIndex + 1} / {adhkar.length}
                    </span>
                    {completed[currentIndex] && (
                      <IconBadge icon={CheckCircle} color="text-[#2DD4BF]" bg="bg-[#2DD4BF]/15" size={28} />
                    )}
                  </div>
                  
                  <p className="text-xl leading-relaxed text-white font-medium whitespace-pre-wrap text-center" dir="rtl">
                    {currentDhikr?.text}
                  </p>
                  
                  {currentDhikr?.transliteration && (
                    <p className="mt-3 text-sm text-[#9AA0C0] italic text-center" dir="ltr">
                      {currentDhikr.transliteration}
                    </p>
                  )}

                  {currentDhikr?.source && (
                    <p className="mt-2 text-xs text-[#7C5CFF] text-center">
                      المصدر: {currentDhikr.source}
                    </p>
                  )}
                </div>

                {/* Completion status */}
                {counts[currentIndex] >= (currentDhikr?.repeatCount || 0) && !completed[currentIndex] && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="mb-4 p-3 rounded-xl bg-[#2DD4BF]/10 border border-[#2DD4BF]/30 flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={20} className="text-[#2DD4BF]" aria-hidden />
                    <span className="text-sm font-medium text-[#2DD4BF]">اكتمل هذا الذكر، اضغط للسؤال</span>
                  </motion.div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between w-full max-w-xl mt-auto pt-4 border-t border-white/[0.06]">
                  <Button
                    variant="ghost"
                    icon={ChevronRight}
                    iconPosition="start"
                    onClick={goPrev}
                    disabled={currentIndex === 0}
                    className="opacity-50"
                  >
                    السابق
                  </Button>

                  <div className="flex gap-2">
                    {adhkar.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentIndex(i)}
                        className={cn(
                          "h-2 w-2 rounded-full transition-all",
                          i === currentIndex
                            ? "bg-[#7C5CFF] w-6"
                            : completed[i]
                              ? "bg-[#2DD4BF]"
                              : "bg-white/[0.1] hover:bg-white/[0.2]"
                        )}
                        aria-label={`الذكر ${i + 1}`}
                        aria-current={i === currentIndex ? "true" : "false"}
                      />
                    ))}
                  </div>

                  <Button
                    variant={isLast && allCompleted ? "success" : "primary"}
                    icon={isLast && allCompleted ? CheckCircle : ChevronLeft}
                    iconPosition="end"
                    onClick={goNext}
                    disabled={isLast}
                  >
                    {isLast && allCompleted ? "أكملت" : "التالي"}
                  </Button>
                </div>
              </div>
            </GlassCard>
          </Reveal>
        </motion.div>
      </AnimatePresence>

      {/* Celebration */}
      {showCelebration && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCelebration(false)}
          >
            <motion.div
              initial={{ y: 50 }}
              animate={{ y: 0 }}
              className="relative z-10 GlassCard p-8 max-w-md w-full text-center"
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-4">
                <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-[#2DD4BF]/20 text-[#2DD4BF] mb-4">
                  <CheckCircle size={40} aria-hidden />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">مبارك! 🎉</h3>
                <p className="text-[#C7CBE6]">أكملت جميع أذكار {CATEGORY_LABELS[category]}</p>
              </div>
              <Button
                              variant="primary"
                              className="w-full"
                              onClick={() => setShowCelebration(false)}
                            >
                              أحسنت!
                            </Button>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}