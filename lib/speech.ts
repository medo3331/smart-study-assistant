"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ==========================================================================
   طبقة الصوت — قراءة بصوت عالي + إدخال بالمايك

   الاتنين بيشتغلوا بالمتصفح نفسه (Web Speech API)، يعني:
     • مفيش أي مفتاح API ولا فاتورة ولا راوت على السيرفر
     • مفيش أي صوت بيتبعت لأي خدمة برّه — التسجيل بيتحلّل جوه المتصفح
     • بالمقابل: الدعم متفاوت. القراءة بتشتغل في كل المتصفحات تقريباً،
       والإدخال بالمايك في كروم وإدج وسفاري بس (فايرفوكس لأ).

   القاعدة اللي الملفين دول ماشيين عليها: **لو المتصفح مش دَاعم، الزرار
   مايظهرش خالص** بدل ما يظهر ويفشل. عشان كده كل هوك بيرجّع `supported`.
   ========================================================================== */

/* --------------------------------------------------------------------------
   أنواع SpeechRecognition

   الـ API لسه مش في lib.dom القياسي بشكل موحّد، فبنعرّف الحد الأدنى
   اللي بنستخدمه بنفسنا. أقل من كده مش هيمشي على tsc --noEmit.
   -------------------------------------------------------------------------- */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/* --------------------------------------------------------------------------
   تنضيف النص قبل القراءة

   النص اللي جاي من الموديل فيه ماركداون وبلوكات كود. لو رمينا الخام
   للقارئ هيقرا «نجمة نجمة» وكل سطر كود حرف حرف — ده مزعج ومش مفيد.
   القاعدة: الرموز تتشال، والكود يتحوّل لجملة واحدة بتقول إن فيه كود هنا.
   -------------------------------------------------------------------------- */

export function textToSpeak(raw: string): string {
  return (
    raw
      // بلوكات الكود: بتتحول لإشارة واحدة بدل ما تتقرا سطر سطر
      .replace(/```[\s\S]*?```/g, " . فيه بلوك كود هنا، بصّ عليه في الشاشة . ")
      // كود سطر واحد: الرموز بس اللي تتشال، النص جواه يتقرا
      .replace(/`([^`]+)`/g, "$1")
      // العناوين والقوائم والعريض
      .replace(/^#{1,6}\s*/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/^\s*[-*]\s+/gm, " . ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // الروابط الصريحة مش بتتقرا
      .replace(/https?:\/\/\S+/g, " رابط ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, " . ")
      .trim()
  );
}

/** أطول نص بنسمح بقراءته في نداء واحد — أطول من كده المتصفح بيقطع. */
const MAX_SPEAK_CHARS = 4000;

/* --------------------------------------------------------------------------
   مين اللي بيقرا دلوقتي

   ⚠️ `speechSynthesis` عايش على مستوى المتصفح كله، مش على مستوى
   الكمبوننت. يعني لو فيه أكتر من زرار قراءة في الصفحة (الشرح + كلام
   المتحدث مثلاً)، تاني واحد يشتغل بيلغي الأول — بس زرار الأول بيفضل
   مكتوب عليه «وقفة» لأن الحالة بتاعته محلية. والأسوأ: لما أي واحد
   فيهم يتشال من الشاشة، الـ cleanup بينده cancel() فبيقطع قراءة التاني.

   الحل: سجل بسيط على مستوى الموديول. اللي بيشتغل بيسجّل نفسه ويصفّر
   الباقيين، والـ cleanup مابيلغيش غير لو هو صاحب القراءة الحالية.
   -------------------------------------------------------------------------- */

const resetters = new Set<() => void>();
let activeOwner: symbol | null = null;

function claimSpeech(owner: symbol, selfReset: () => void) {
  activeOwner = owner;
  for (const reset of resetters) {
    if (reset !== selfReset) reset();
  }
}

function releaseSpeech(owner: symbol) {
  if (activeOwner === owner) activeOwner = null;
}

/** يرجّع true لو الكمبوننت ده هو صاحب القراءة الشغالة. */
function ownsSpeech(owner: symbol) {
  return activeOwner === owner;
}

/* --------------------------------------------------------------------------
   القراءة بصوت عالي

   ⚠️ فخ اتحسب له: `getVoices()` بترجّع ليستة فاضية في أول نداء على كروم،
   الأصوات بتوصل بعدها بشوية مع حدث `voiceschanged`. فلو اخترنا الصوت
   مرة واحدة عند التحميل، العربي مش هيتلاقى وهيقرا بصوت إنجليزي.
   -------------------------------------------------------------------------- */

export function useSpeak() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // هوية ثابتة للكمبوننت ده طول عمره — بيها بنعرف مين صاحب القراءة
  const ownerRef = useRef<symbol>(Symbol("speak-owner"));

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);

    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);

    // بنسجّل «صفّر نفسك» عشان لو زرار تاني اشتغل، الزرار ده يرجع لحالته
    // الساكتة بدل ما يفضل مكتوب عليه «وقفة» وهو مش بيقرا.
    const reset = () => {
      setSpeaking(false);
      setPaused(false);
    };
    resetters.add(reset);

    const owner = ownerRef.current;
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      resetters.delete(reset);
      // ⚠️ بنلغي القراءة **بس** لو إحنا أصحابها. من غير الشرط ده، أي
      // كمبوننت بيتشال بيقطع قراءة كمبوننت تاني شغال.
      if (ownsSpeech(owner)) {
        window.speechSynthesis.cancel();
        releaseSpeech(owner);
      }
    };
  }, []);

  /** أنسب صوت عربي موجود، وإلا أي صوت (أحسن من مفيش). */
  const pickVoice = useCallback((): SpeechSynthesisVoice | null => {
    const voices = voicesRef.current;
    if (voices.length === 0) return null;
    // المصري الأول لو موجود، وبعدين أي عربي، وبعدين الافتراضي
    return (
      voices.find((v) => v.lang === "ar-EG") ??
      voices.find((v) => v.lang.startsWith("ar")) ??
      null
    );
  }, []);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    // مانوقفش قراءة كمبوننت تاني — الزرار ده مسؤول عن قراءته هو بس
    if (ownsSpeech(ownerRef.current)) {
      window.speechSynthesis.cancel();
      releaseSpeech(ownerRef.current);
    }
    setSpeaking(false);
    setPaused(false);
  }, []);

  const speak = useCallback(
    (raw: string, rate = 1) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

      const clean = textToSpeak(raw).slice(0, MAX_SPEAK_CHARS);
      if (!clean) return;

      // لازم cancel قبل أي utterance جديدة — من غيرها بتتصفّ في طابور
      // والمستخدم يسمع القراءة القديمة والجديدة ورا بعض.
      window.speechSynthesis.cancel();

      const owner = ownerRef.current;

      const u = new SpeechSynthesisUtterance(clean);
      const voice = pickVoice();
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? "ar-EG";
      u.rate = rate;

      u.onstart = () => {
        setSpeaking(true);
        setPaused(false);
      };
      u.onend = () => {
        setSpeaking(false);
        setPaused(false);
        releaseSpeech(owner);
      };
      u.onerror = () => {
        setSpeaking(false);
        setPaused(false);
        releaseSpeech(owner);
      };

      // نسجّل ملكيتنا **قبل** التشغيل عشان أي زرار تاني يصفّر حالته فوراً
      claimSpeech(owner, () => {
        setSpeaking(false);
        setPaused(false);
      });
      window.speechSynthesis.speak(u);
    },
    [pickVoice]
  );

  const toggle = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setPaused(false);
    } else {
      window.speechSynthesis.pause();
      setPaused(true);
    }
  }, []);

  return { supported, speaking, paused, speak, stop, toggle };
}

/* --------------------------------------------------------------------------
   الإدخال بالمايك

   الاستخدام: المستخدم يدوس المايك، يتكلم، والنص بيتحدّث لحظياً في الحقل.
   بنبعت النص المؤقّت (interim) وهو بيتكلم عشان يشوف إن الحاجة ماشية،
   والنهائي (final) لما يخلص.

   ⚠️ `continuous = false` عن قصد: التسجيل المفتوح بياخد صلاحية المايك
   لوقت طويل وبيستهلك بطارية، والمستخدم بينسى إنه شغال. جملة واحدة
   وبعدين يقف لوحده أوضح.
   -------------------------------------------------------------------------- */

interface UseMicOptions {
  /** بيتنده مع كل تحديث — النص الكامل من بداية التسجيل. */
  onTranscript: (text: string, isFinal: boolean) => void;
}

export function useMic({ onTranscript }: UseMicOptions) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  // الـ callback بيتغيّر كل رندر، فبنحفظه في ref عشان ما نعيدش
  // بناء الـ recognition (اللي بيقطع التسجيل) مع كل رندر.
  const cbRef = useRef(onTranscript);
  useEffect(() => {
    cbRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    setSupported(true);

    const rec = new Ctor();
    rec.lang = "ar-EG";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setListening(true);
      setError(null);
    };

    rec.onresult = (event) => {
      let text = "";
      let isFinal = false;
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        text += result[0]?.transcript ?? "";
        if (result.isFinal) isFinal = true;
      }
      cbRef.current(text.trim(), isFinal);
    };

    rec.onerror = (event) => {
      setListening(false);
      // الرسايل دي بتظهر للمستخدم، فلازم تكون مفهومة مش كود الخطأ الخام
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("المتصفح مرفّض الوصول للمايك. افتح إعدادات الموقع واسمح بالمايك.");
      } else if (event.error === "no-speech") {
        setError("مسمعتش صوت. جرّب تاني وقرّب من المايك.");
      } else if (event.error === "network") {
        setError("التعرّف على الصوت محتاج نت. اتأكد من الاتصال.");
      } else if (event.error !== "aborted") {
        setError("حصلت مشكلة في التسجيل. جرّب تاني.");
      }
    };

    rec.onend = () => setListening(false);

    recRef.current = rec;

    return () => {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.onstart = null;
      rec.abort();
      recRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    setError(null);
    try {
      rec.start();
    } catch {
      // `start()` بيرمي لو هو شغال أصلاً — مش خطأ محتاج رسالة
    }
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  return { supported, listening, error, start, stop };
}
