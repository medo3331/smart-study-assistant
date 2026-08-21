"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SoundTrack } from "@/app/dashboard/components/audio-library";
import { FloatingAudioPlayer } from "./FloatingAudioPlayer";

/* ==========================================================================
   مزوّد الصوت — على مستوى الموقع كله

   🗓️ ٨ أغسطس: قبل كده الحالة وعنصر الـ `<audio>` كانوا عايشين جوه
   `app/dashboard/page.tsx`. المشكلة إن التنقّل في التطبيق كله `router.push`،
   يعني الصفحة القديمة بتتشال من الشجرة — ومعاها عنصر الصوت — فالمستخدم
   كان يروح «الكورسات» فيفصل الصوت. ده مش سلوك متوقّع لمشغّل خلفية.

   ⚠️ المزوّد لازم يفضل مركّب في `app/layout.tsx` مش في
   `app/dashboard/layout.tsx`. الـ layout بتاع الداشبورد كان هيغطّي
   /dashboard/* بس، والمستخدم بيعدّي على /shop و/inventory و/community
   و/lesson كمان — والطلب كان «يفضل شغّال وأنا بستخدم أي حاجة في الموقع».

   الـ root layout هو الحتة الوحيدة اللي React بيضمن إنها ماتتشالش في أي
   تنقّل من جوه التطبيق. تحديث كامل للصفحة (F5) بيوقّف الصوت طبعاً، وده
   مقصود: سياسات المتصفح مابتسمحش بتشغيل صوت من غير لمسة من المستخدم،
   فمحاولة استئنافه بعد ريفرش كانت هتفشل بصمت.
   ========================================================================== */

/** مستوى الصوت بيعيش أطول من الجلسة — بيتحفظ لأنه تفضيل جهاز. */
const VOLUME_KEY = "audio_volume";
const DEFAULT_VOLUME = 0.5;

/** الحشو اللي بيتزوّد تحت الصفحة عشان المشغّل ما يغطّيش آخر سطر فيها. */
const PLAYER_CLEARANCE = "5.5rem";

interface AudioContextValue {
  activeTrack: SoundTrack | null;
  isPlaying: boolean;
  volume: number;
  /** الملف مارضيش يشتغل */
  error: boolean;
  /** نفس التراك = تشغيل/إيقاف. تراك جديد = بيبدأ على طول. */
  selectTrack: (track: SoundTrack) => void;
  /** تراك اتمسح من «صوتياتي» — بيقفل المشغّل لو هو اللي شغّال. */
  forgetTrack: (id: string) => void;
  setVolume: (value: number) => void;
  togglePlay: () => void;
  /** إغلاق المشغّل بالكامل */
  stop: () => void;
}

const AudioCtx = createContext<AudioContextValue | null>(null);

export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioCtx);
  if (!ctx) {
    throw new Error("useAudio لازم يتنادى جوه <AudioProvider> — شوف app/layout.tsx");
  }
  return ctx;
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [activeTrack, setActiveTrack] = useState<SoundTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /* ---- مستوى الصوت المحفوظ ----
     القراءة في useEffect مش في useState initializer: الـ localStorage مش
     موجود على السيرفر، فالقراءة بدري بتخلّي رسمة السيرفر مختلفة عن رسمة
     المتصفح ويكسر الترطيب. */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VOLUME_KEY);
      if (saved === null) return;
      const parsed = Number(saved);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) setVolumeState(parsed);
    } catch {
      // الستوريج مقفول — النص الافتراضي مقبول
    }
  }, []);

  const setVolume = useCallback((value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    setVolumeState(clamped);
    try {
      window.localStorage.setItem(VOLUME_KEY, String(clamped));
    } catch {
      // الستوريج مقفول — المستوى هيشتغل في الجلسة دي وبس
    }
  }, []);

  /* 🔴 مستوى الصوت — إيفكت لوحده عن قصد. لو كان مع التشغيل/الإيقاف، كل
     خطوة في السلايدر كانت بتعيد نداء play() ورفض الوعد بيوقف الصوت.
     `activeTrack` في الاعتماديات عشان العنصر بيتركّب من جديد مع كل تراك،
     والعنصر الجديد بيبدأ بمستوى ١ لو ماظبطناهوش. */
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, activeTrack]);

  /* 🔴 التشغيل والإيقاف
     ⚠️ الـ `cancelled`: تغيير الـ src بيرفض أي play() لسه معلّق بـ
     AbortError. من غير الحرس ده، رفض التراك القديم بيوصل بعد ما الجديد
     بدأ ويوقفه — فالتبديل السريع بين السور كان بيسيبك على تراك مختار
     وواقف من غير سبب باين. */
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    let cancelled = false;
    if (isPlaying && activeTrack) {
      el.play().catch(() => {
        if (!cancelled) setIsPlaying(false);
      });
    } else {
      el.pause();
    }

    return () => {
      cancelled = true;
    };
  }, [isPlaying, activeTrack]);

  /* المشغّل عنصر ثابت في آخر الشاشة. الصفحات اللي لابسة `PageShell`
     عندها `pb-24` خلاص، لكن /shop و/inventory و/community و/lesson لأ —
     فآخر سطر فيها كان هيتغطّى. الحشو بيتحط على الـ body عشان أي صفحة
     تستفيد من غير ما تعرف إن فيه مشغّل أصلاً.

     الاعتماد على `hasTrack` (بوليان) مش على `activeTrack` نفسه: التبديل
     من سورة لسورة مايستاهلش يشيل الحشو ويرجّعه. */
  const hasTrack = activeTrack !== null;
  useEffect(() => {
    if (!hasTrack) return;
    const previous = document.body.style.paddingBottom;
    document.body.style.paddingBottom = PLAYER_CLEARANCE;
    return () => {
      document.body.style.paddingBottom = previous;
    };
  }, [hasTrack]);

  const selectTrack = useCallback(
    (track: SoundTrack) => {
      // نفس التراك: تشغيل/إيقاف. ولو كان واقع، الضغطة دي محاولة تانية
      // فبنصفّر الخطأ — من غير كده الرسالة الحمرا بتفضل حتى لما يشتغل.
      setError(false);
      if (activeTrack?.id === track.id) {
        setIsPlaying((playing) => !playing);
      } else {
        setActiveTrack(track);
        setIsPlaying(true);
      }
    },
    [activeTrack],
  );

  // تراك اتمسح من «صوتياتي» — لو هو اللي شغّال، المشغّل يقفل. من غير ده
  // الصوت بيفضل شغّال والكارت بيوري اسم حاجة مش موجودة في المكتبة.
  const forgetTrack = useCallback(
    (id: string) => {
      if (activeTrack?.id !== id) return;
      setIsPlaying(false);
      setActiveTrack(null);
      setError(false);
    },
    [activeTrack],
  );

  const togglePlay = useCallback(() => {
    // ضغطة على تراك واقع = محاولة تانية، فالرسالة الحمرا تتشال
    setError(false);
    setIsPlaying((playing) => !playing);
  }, []);

  const stop = useCallback(() => {
    setIsPlaying(false);
    setActiveTrack(null);
    setError(false);
  }, []);

  const value = useMemo<AudioContextValue>(
    () => ({
      activeTrack,
      isPlaying,
      volume,
      error,
      selectTrack,
      forgetTrack,
      setVolume,
      togglePlay,
      stop,
    }),
    [activeTrack, isPlaying, volume, error, selectTrack, forgetTrack, setVolume, togglePlay, stop],
  );

  return (
    <AudioCtx.Provider value={value}>
      {children}

      {/* ⚠️ العنصر بيتركّب بس لما يبقى فيه تراك. `src=""` مش «مفيش مصدر» —
          المتصفح بيحوّلها لرابط الصفحة نفسها، وبيحاول يشغّل الـ HTML كصوت،
          وبيرمي onError. يعني كنا هنوري «الصوت مش راضي يشتغل» عند أول
          تحميل وبعد كل قفل للمشغّل. */}
      {activeTrack && (
        <audio
          ref={audioRef}
          src={activeTrack.url}
          // التكرار من التراك نفسه: الموسيقى بتلف، والسورة بتخلص وتقف.
          loop={activeTrack.loop}
          onEnded={() => setIsPlaying(false)}
          // المتصفح ممكن يوقف/يشغّل من مفاتيح الميديا أو من نظام التشغيل،
          // والحالة عندنا لازم تتبع الحقيقة مش العكس.
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onPlaying={() => setError(false)}
          onError={() => {
            // الرابط وقع أو المستخدم حاطط رابط غلط في «صوتياتي» — من غير
            // ده الزرار بيفضل شكله «بيشتغل» وهو مش بيشتغل.
            setIsPlaying(false);
            setError(true);
          }}
        />
      )}

      <FloatingAudioPlayer
        activeTrack={activeTrack}
        isPlayingAudio={isPlaying}
        audioVolume={volume}
        audioError={error}
        onChangeVolume={setVolume}
        onTogglePlay={togglePlay}
        onClose={stop}
      />
    </AudioCtx.Provider>
  );
}
