"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: proper typing requires architecture change, tracked separately */

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { awardCoins } from "@/lib/shop/shop-data";

/**
 * Boss Fight
 * بعد كل Chapter (مجموعة أيام)، بدل اختبار عادي، بوس تحدي بـ 20 سؤال.
 * تكسبه؟ تاخد Badge + XP إضافي.
 *
 * الملف ده component مودال، حطه في: components/BossFight.tsx
 *
 * -------------------------------------------------------------
 * 1) جدول Supabase مطلوب (شغّل الـ SQL ده مرة واحدة في Supabase):
 *
 * create table badges (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid not null references auth.users(id) on delete cascade,
 *   config_id uuid references study_configs(id) on delete cascade,
 *   chapter_number int not null,
 *   title text not null,
 *   subject text not null,
 *   accuracy int not null,
 *   earned_at timestamptz default now()
 * );
 * alter table badges enable row level security;
 * create policy "users manage their own badges" on badges
 *   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
 *
 * -------------------------------------------------------------
 * 2) إزاي تحدد "الـ Chapter" وتستدعي المكوّن من dashboard/page.tsx:
 *
 * فوق return الرئيسي ضيف helper بسيط بيقسم الأيام لفصول كل 5 أيام:
 *
 *   const CHAPTER_SIZE = 5;
 *   const chapters = Array.from({ length: Math.ceil(days.length / CHAPTER_SIZE) }, (_, i) => {
 *     const chapterDays = days.slice(i * CHAPTER_SIZE, i * CHAPTER_SIZE + CHAPTER_SIZE);
 *     return {
 *       chapterNumber: i + 1,
 *       days: chapterDays,
 *       isComplete: chapterDays.every((d) => d.isCompleted),
 *       topics: chapterDays.map((d) => d.topic),
 *     };
 *   });
 *
 * وضيف state:
 *   const [activeBossChapter, setActiveBossChapter] = useState<number | null>(null);
 *
 * بعد كل چابتر مكتمل في الـ render (بعد آخر يوم فيه)، حط زرار:
 *   {chapter.isComplete && (
 *     <button onClick={() => setActiveBossChapter(chapter.chapterNumber)}
 *       className="btn btn-block bg-red-500 text-ondanger hover:opacity-90 mono">
 *       تحدي نهاية الفصل {chapter.chapterNumber}
 *     </button>
 *   )}
 *
 * وفي آخر الملف قبل ما يقفل الـ component الرئيسي:
 *   {activeBossChapter !== null && (
 *     <BossFight
 *       subject={config.subject}
 *       topics={chapters.find((c) => c.chapterNumber === activeBossChapter)!.topics}
 *       chapterNumber={activeBossChapter}
 *       configId={configId!}
 *       theme={theme}
 *       onClose={() => setActiveBossChapter(null)}
 *       onWin={(xpEarned) => {
 *         setXp((prev) => prev + xpEarned);
 *         logActivity({ tasksCompleted: 1 });
 *       }}
 *     />
 *   )}
 * -------------------------------------------------------------
 */

type ThemeColor = "amber" | "emerald" | "coral" | "cyan";

interface BossFightProps {
  subject: string;
  topics: string[];
  chapterNumber: number;
  configId: string;
  theme: ThemeColor;
  onClose: () => void;
  onWin: (xpEarned: number) => void;
}

interface BossQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

const TOTAL_QUESTIONS = 20;
const STARTING_LIVES = 5;
const WIN_XP_BASE = 150;

const themeAccentBg: Record<ThemeColor, string> = {
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  coral: "bg-[#DC4C4C]",
  cyan: "bg-cyan-500",
};

const BOSS_NAMES = ["حارس المعرفة", "تنين الامتحانات", "شبح النسيان", "عملاق التحدي", "ساحر الأسئلة"];

export function BossFight({ subject, topics, chapterNumber, configId, theme, onClose, onWin }: BossFightProps) {
  const [supabase] = useState(() => createClient());
  const [phase, setPhase] = useState<"loading" | "intro" | "battle" | "won" | "lost" | "error">("loading");
  const [questions, setQuestions] = useState<BossQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [correctCount, setCorrectCount] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const bossName = BOSS_NAMES[chapterNumber % BOSS_NAMES.length];
  const bossHealth = questions.length > 0 ? Math.max(0, 100 - Math.round((correctCount / questions.length) * 100)) : 100;

  useEffect(() => {
    fetchQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchQuestions() {
    setPhase("loading");
    try {
      const systemInstruction = `أنت مصمم اختبارات خبير. صمم بالظبط ${TOTAL_QUESTIONS} سؤال اختيار من متعدد (كل سؤال 4 اختيارات، اختيار واحد صح) لمراجعة المواضيع التالية في مادة "${subject}": ${topics.join("، ")}. نوّع صعوبة الأسئلة من سهل لصعب تدريجيًا. رد بصيغة JSON فقط بدون أي نص أو Markdown إضافي، بالشكل ده بالظبط: [{"question":"...", "options":["...","...","...","..."], "correctIndex": 0}]. correctIndex هو index الاختيار الصح (من 0 لـ 3).`;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction,
          messages: [{ role: "user", content: "جهز أسئلة البوس فايت دلوقتي." }],
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "فشل توليد الأسئلة");

      const raw = data?.choices?.[0]?.message?.content || "";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("رد غير صالح");

      const cleanQuestions: BossQuestion[] = parsed
        .filter((q: any) => q?.question && Array.isArray(q?.options) && q.options.length === 4)
        .slice(0, TOTAL_QUESTIONS)
        .map((q: any) => ({
          question: q.question,
          options: q.options,
          correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : 0,
        }));

      if (cleanQuestions.length < 10) throw new Error("عدد أسئلة غير كافي");

      setQuestions(cleanQuestions);
      setPhase("intro");
    } catch (err) {
      console.error("Boss fight question generation failed:", err);
      setPhase("error");
    }
  }

  function handleAnswer(index: number) {
    if (selectedOption !== null) return;
    setSelectedOption(index);

    const isCorrect = index === questions[currentQ].correctIndex;
    if (isCorrect) {
      setCorrectCount((prev) => prev + 1);
    } else {
      setLives((prev) => prev - 1);
    }

    setTimeout(() => {
      if (!isCorrect && lives - 1 <= 0) {
        setPhase("lost");
        return;
      }
      if (currentQ + 1 >= questions.length) {
        const accuracy = Math.round(((correctCount + (isCorrect ? 1 : 0)) / questions.length) * 100);
        if (accuracy >= 60) {
          finishWin(accuracy);
        } else {
          setPhase("lost");
        }
        return;
      }
      setCurrentQ((prev) => prev + 1);
      setSelectedOption(null);
    }, 900);
  }

  async function finishWin(accuracy: number) {
    setPhase("won");
    const xpEarned = WIN_XP_BASE + accuracy;
    onWin(xpEarned);

    setIsSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("badges").insert({
          user_id: user.id,
          config_id: configId,
          chapter_number: chapterNumber,
          title: `منتصر على ${bossName}`,
          subject,
          accuracy,
        });

        /* 🪙 كوينز المتجر على الوسام. جوه `if (user)` عشان الزائر مالوش
           صف يتكتب عليه أصلاً، وبعد الـ insert عشان الوسام يبقى محفوظ
           حتى لو المتجر لسه ما اتسطّبش (db/shop.sql).

           ⚠️ في try مستقل: الـ catch اللي تحت بيطبع «Failed to save badge»
           — رسالة غلط لو اللي فشل هو الكوينز مش الوسام.

           المرجع = الفصل نفسه، مش معرّف صف الوسام. الفرق مهم: الفصل ثابت،
           فالفهرس الفريد في الداتابيز بيخلي الفصل الواحد يدفع **مرة واحدة
           بس مهما اتكرر** — لو المستخدم حفظ صفين وسام لنفس الفصل، الكوينز
           تنزل مرة. معرّف الصف كان هيبقى جديد كل مرة، يعني كل إعادة
           مكسب جديد لحد السقف اليومي. */
        try {
          await awardCoins(supabase, "badge", `${configId}:${chapterNumber}`);
        } catch (coinErr) {
          console.error("award badge failed (متجاهَل):", coinErr);
        }
      }
    } catch (err) {
      console.error("Failed to save badge:", err);
    } finally {
      setIsSaving(false);
    }
  }

  function handleRetry() {
    setCurrentQ(0);
    setLives(STARTING_LIVES);
    setCorrectCount(0);
    setSelectedOption(null);
    fetchQuestions();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-blur-sm p-4" dir="rtl">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="sheet-card sheet-card-live card-lift w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5"
      >
        {phase === "loading" && (
          <div className="text-center py-10 space-y-4">
            <div className="w-11 h-11 border-2 border-rule border-t-redpen rounded-full animate-spin mx-auto" />
            <p className="tag justify-center">بيتم الاستدعاء</p>
            <p className="text-sm font-bold text-ink m-0">جاري استدعاء {bossName}</p>
            <p className="text-xs text-ink-soft m-0">
              بنجهز <span className="tnum">{TOTAL_QUESTIONS}</span> سؤال من اللي ذاكرته
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="py-6 space-y-4">
            <div>
              <p className="eyebrow eyebrow-flush mb-1.5">تحدي نهاية الفصل</p>
              <h2 className="h3">التحدي مش جاهز دلوقتي</h2>
            </div>
            <div className="notice notice-error">
              <p className="m-0">تعذر تجهيز الأسئلة. جرب تاني بعد شوية.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={fetchQuestions} className="btn btn-quiet flex-1 text-sm">
                حاول تاني
              </button>
              <button onClick={onClose} className="btn btn-quiet flex-1 text-sm">
                إغلاق
              </button>
            </div>
          </div>
        )}

        {phase === "intro" && (
          <div className="py-2 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="eyebrow eyebrow-flush mb-1.5">تحدي نهاية الفصل</p>
                <h2 className="h2">{bossName}</h2>
                <p className="tag mt-2 ltr-num">
                  Chapter {chapterNumber}
                </p>
                <p className="tag mt-1">{subject}</p>
              </div>
              {/* ختم أحمر بدل السيوف — الأحمر لوحده كفاية يقول إن دي محطة جادة */}
              <span className="stamp bg-red-500 text-ondanger" aria-hidden="true">
                <span className="font-display font-extrabold text-base leading-none ltr-num">
                  {chapterNumber}
                </span>
                <span className="mono text-[9px]">فصل</span>
              </span>
            </div>

            <div className="bg-paper border border-rule rounded-[var(--r-sm)] p-4 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="tag">عدد الأسئلة</span>
                <span className="mono tnum font-bold text-ink">{questions.length}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="tag">أرواحك</span>
                <span className="mono tnum font-bold text-ink">{STARTING_LIVES}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="tag">الحد الأدنى للفوز</span>
                <span className="mono ltr-num tnum font-bold text-ink">60%</span>
              </div>
              <p className="text-xs text-ink-soft leading-relaxed m-0 border-t border-rule pt-3">
                كل إجابة غلط بتاخد روح. لو وصلت للحد الأدنى تكسب Badge و XP إضافي.
              </p>
            </div>

            <button
              onClick={() => setPhase("battle")}
              className="btn btn-block bg-red-500 text-ondanger hover:opacity-90 text-sm"
            >
              ابدأ التحدي
            </button>
            <button onClick={onClose} className="mono text-ink-soft hover:text-ink block mx-auto transition">
              مش دلوقتي
            </button>
          </div>
        )}

        {phase === "battle" && questions.length > 0 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex justify-between items-baseline gap-3">
                <span className="tag">{bossName}</span>
                <span className="mono ltr-num tnum text-ink-soft">{bossHealth}%</span>
              </div>
              <div className="meter">
                <motion.div
                  className="meter-fill bg-red-500"
                  animate={{ width: `${bossHealth}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              {/* الأرواح: مربّعات قلم أحمر بدل قلوب إيموجي */}
              <div className="flex items-center gap-2">
                <span className="tag">أرواح</span>
                <div className="flex gap-1" aria-label={`باقي ${lives} من ${STARTING_LIVES} أرواح`}>
                  {Array.from({ length: STARTING_LIVES }).map((_, i) => (
                    <span
                      key={i}
                      className={`w-3 h-3 rounded-[3px] ${i < lives ? "bg-redpen" : "bg-paper-3 border border-rule"}`}
                    />
                  ))}
                </div>
              </div>
              <span className="mono ltr-num tnum text-ink-soft">
                {currentQ + 1} / {questions.length}
              </span>
            </div>

            <motion.div key={currentQ} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
              <h3 className="h3">{questions[currentQ].question}</h3>
              <div className="space-y-2">
                {questions[currentQ].options.map((opt, i) => {
                  const isSelected = selectedOption === i;
                  const isCorrect = i === questions[currentQ].correctIndex;
                  // الصح أخضر والغلط أحمر — الأصفر ممنوع هنا، ده حكم مش "إنت فين"
                  let style = "bg-paper border-rule text-ink hover:border-ink-soft hover:bg-paper-3";
                  if (selectedOption !== null) {
                    if (isCorrect) style = "bg-emerald-950 border-emerald-500 text-emerald-400";
                    else if (isSelected) style = "bg-red-950 border-red-500 text-red-500";
                    else style = "bg-paper border-rule text-ink-soft opacity-60";
                  }
                  return (
                    <button
                      key={i}
                      onClick={() => handleAnswer(i)}
                      disabled={selectedOption !== null}
                      className={`w-full text-right p-3.5 rounded-[var(--r-sm)] border text-xs font-bold transition ${style}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}

        {phase === "won" && (
          <div className="py-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="eyebrow eyebrow-flush mb-1.5">نتيجة التحدي</p>
                <h2 className="h2">كسبت {bossName}</h2>
              </div>
              <span className="stamp bg-emerald-500 text-onmarker" aria-hidden="true">
                <span className="text-lg leading-none font-bold">✓</span>
                <span className="mono text-[9px]">فوز</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-paper rounded-[var(--r-sm)] p-4">
                <p className="tag mb-1.5">المكسب</p>
                <p className="ltr-num font-display font-extrabold text-2xl text-ink leading-none tnum m-0">
                  +{WIN_XP_BASE + Math.round((correctCount / questions.length) * 100)} XP
                </p>
              </div>
              <div className="bg-paper rounded-[var(--r-sm)] p-4">
                <p className="tag mb-1.5">إجابات صحيحة</p>
                <p className="ltr-num font-display font-extrabold text-2xl text-ink leading-none tnum m-0">
                  {correctCount} / {questions.length}
                </p>
              </div>
            </div>

            <p className="tag">{isSaving ? "بيتم حفظ الـ Badge" : "الـ Badge اتضاف لمجموعتك"}</p>

            <button
              onClick={onClose}
              className={`btn btn-block text-sm ${themeAccentBg[theme]} text-onmarker hover:opacity-90`}
            >
              تمام، يلا نكمّل
            </button>
          </div>
        )}

        {phase === "lost" && (
          <div className="py-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="eyebrow eyebrow-flush mb-1.5">نتيجة التحدي</p>
                <h2 className="h2">{bossName} كسبك المرة دي</h2>
              </div>
              <span className="stamp bg-red-500 text-ondanger" aria-hidden="true">
                <span className="text-lg leading-none font-bold">✕</span>
                <span className="mono text-[9px]">خسارة</span>
              </span>
            </div>

            <div className="bg-paper rounded-[var(--r-sm)] p-4">
              <p className="tag mb-1.5">إجابات صحيحة</p>
              <p className="ltr-num font-display font-extrabold text-2xl text-ink leading-none tnum m-0">
                {correctCount} / {questions.length}
              </p>
            </div>

            <p className="text-xs text-ink-soft leading-relaxed m-0">
              راجع الفصل تاني وارجع للتحدي. الأسئلة بتتغير كل مرة.
            </p>

            <div className="flex gap-2">
              <button onClick={handleRetry} className="btn flex-1 bg-red-500 text-ondanger hover:opacity-90 text-sm">
                حاول تاني
              </button>
              <button onClick={onClose} className="btn btn-quiet flex-1 text-sm">
                لاحقًا
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}