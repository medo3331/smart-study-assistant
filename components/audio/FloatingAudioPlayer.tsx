"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { SoundTrack } from "@/app/dashboard/components/audio-library";

/* ==========================================================================
   المشغّل العائم

   🗓️ ٨ أغسطس: الكومبوننت ده كان جوه `app/dashboard/components/ToolsSection.tsx`
   وبيتركّب من صفحة الداشبورد. اتنقل هنا لما الصوت بقى على مستوى الموقع
   كله — هو مش أداة داشبورد، ده شريط بيظهر في أي صفحة طول ما فيه صوت
   شغّال. اللي بيركّبه دلوقتي هو `AudioProvider` وبس.

   بياخد كل حاجة بروبس مش من الكونتكست عن قصد: كده يفضل كومبوننت أصم
   ينفع يتعرض لوحده، والمزوّد هو الحتة الوحيدة اللي بتعرف الحالة.
   ========================================================================== */

interface FloatingAudioPlayerProps {
  activeTrack: SoundTrack | null;
  isPlayingAudio: boolean;
  audioVolume: number;
  /** الملف مارضيش يشتغل — رابط وقع أو صيغة مش مدعومة */
  audioError?: boolean;
  onChangeVolume: (value: number) => void;
  onTogglePlay: () => void;
  onClose: () => void;
}

export function FloatingAudioPlayer({
  activeTrack,
  isPlayingAudio,
  audioVolume,
  audioError = false,
  onChangeVolume,
  onTogglePlay,
  onClose,
}: FloatingAudioPlayerProps) {
  return (
    <AnimatePresence>
      {activeTrack && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          className="sheet-card card-lift fixed bottom-4 left-4 right-4 max-w-lg mx-auto p-3 z-40 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl p-2 bg-paper rounded-[var(--r-sm)] leading-none shrink-0">
              {activeTrack.icon}
            </span>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-ink truncate">{activeTrack.name}</h4>
              {/* اسم القارئ مهم زي اسم السورة — اللي بيختار قارئ معيّن
                  عايز يشوفه، مش «بيشتغل» وبس. */}
              <p className="tag truncate">
                {audioError ? (
                  <span className="text-red-400">الصوت ده مش راضي يشتغل</span>
                ) : (
                  <>
                    {activeTrack.subtitle ? `${activeTrack.subtitle} · ` : ""}
                    {isPlayingAudio ? "بيشتغل" : "متوقف"}
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audioVolume}
              onChange={(e) => onChangeVolume(parseFloat(e.target.value))}
              className="w-16 sm:w-24 accent-amber-500 cursor-pointer h-1.5"
              title="مستوى الصوت"
              aria-label="مستوى الصوت"
            />

            <button
              onClick={onTogglePlay}
              aria-label={isPlayingAudio ? "إيقاف مؤقت" : "تشغيل"}
              className="w-9 h-9 rounded-[var(--r-sm)] flex items-center justify-center bg-marker text-onmarker font-bold transition hover:opacity-90"
            >
              {isPlayingAudio ? "⏸" : "▶"}
            </button>

            <button
              onClick={onClose}
              aria-label="إغلاق المشغل"
              className="mono text-ink-soft hover:text-ink px-1.5 py-1 rounded-[6px] hover:bg-paper-3 transition"
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
