"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

/**
 * التقييم المبدئي (AI Placement Quiz)
 * أول ما يوزر جديد يدخل، بيسأله 3 أسئلة خفيفة، ويبني بداية خطة مرنة بناءً على إجاباته
 *
 * 👤 الشخصية والمستوى والتراك بيتختاروا في اللاندينج **قبل** التسجيل
 * (components/PersonaPicker.tsx) وبيعيشوا في localStorage عبر قفزة الدخول.
 * فالصفحة دي بتستهلك الاختيار وتقفز للكويز على طول بدل ما تسأل تاني.
 */

import type { CategoryType, FieldId, Persona, StudentLevel } from "@/lib/user-persona";
import {
  DEFAULT_FIELD,
  DEFAULT_PERSONA,
  FIELDS,
  PERSONAS,
  STUDENT_LEVELS,
  buildPersonaContext,
  clearPendingChoice,
  getStepPrefix,
  getTracks,
  readPendingChoice,
} from "@/lib/user-persona";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { setActiveCourse } from "@/lib/pages-data";
type LearningStyle = "practical" | "visual" | "academic";
type SkillLevel = "beginner" | "intermediate" | "advanced";
type Pace = "relaxed" | "standard" | "intensive";

interface QuizOption {
  label: string;
  level?: 1 | 2 | 3;
  pace?: Pace;
  style?: LearningStyle;
}

interface QuizQuestion {
  question: string;
  options: QuizOption[];
}

// الإيموجي اتشال من المجالات — الاسم لوحده كفاية، والمختار بيتعلّم بالحبر
const CATEGORIES: { id: CategoryType }[] = [
  { id: "دراسة أكاديمية" },
  { id: "تعلم مهارة" },
  { id: "عمل ومشاريع" },
  { id: "تطوير شخصي" },
];

const QUESTIONS: QuizQuestion[] = [
  {
    question: "قد إيه خبرتك الحالية في الموضوع ده؟",
    options: [
      { label: "لسه بادئ من الصفر", level: 1 },
      { label: "عندي أساسيات بسيطة", level: 2 },
      { label: "عندي خبرة كويسة وعايز أتعمق", level: 3 },
    ],
  },
  {
    question: "لما تتعلم حاجة جديدة، بتفهم أسرع لو...",
    options: [
      { label: "شفت صورة أو رسمة توضحها", style: "visual" },
      { label: "طبقتها بنفسي على طول", style: "practical" },
      { label: "قريت تعريفها العلمي الدقيق", style: "academic" },
    ],
  },
  {
    question: "قد إيه وقت متاح تذاكر كل يوم؟",
    options: [
      { label: "أقل من 30 دقيقة", pace: "relaxed" },
      { label: "من 30 لـ 60 دقيقة", pace: "standard" },
      { label: "أكتر من ساعة", pace: "intensive" },
    ],
  },
];

const LEVEL_LABEL: Record<SkillLevel, string> = {
  beginner: "مبتدئ",
  intermediate: "متوسط",
  advanced: "متقدم",
};

const STYLE_LABEL: Record<LearningStyle, string> = {
  practical: "عملي",
  visual: "مرئي",
  academic: "أكاديمي",
};


interface GeneratedDay {
  title: string;
  topic: string;
  description: string;
}

export default function AssessmentPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [supabase] = useState(() => createClient());

  const [step, setStep] = useState<"identity" | "subject" | "quiz" | "building" | "result">("identity");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<CategoryType>("دراسة أكاديمية");
  const [persona, setPersona] = useState<Persona>(DEFAULT_PERSONA);
  const [studentLevel, setStudentLevel] = useState<StudentLevel | null>(null);
  const [field, setField] = useState<FieldId>(DEFAULT_FIELD);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizOption[]>([]);
  const [startingSteps, setStartingSteps] = useState<1 | 3 | 5>(3);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [result, setResult] = useState<{ level: SkillLevel; style: LearningStyle; days: number } | null>(null);

  // الاختيار الجاهز من اللاندينج. localStorage مش موجود في السيرفر، فالقراءة
  // في effect — وبكده أول رندر بيطابق الـ SSR ومفيش hydration mismatch.
  // ⚠️ مش بنمسح الاختيار هنا: لو المستخدم عمل ريفريش قبل ما الخطة تتحفظ،
  // المسح المبكر كان هيرجّعه لخطوة المادة تاني. المسح بعد الحفظ بنجاح.
  useEffect(() => {
    const pending = readPendingChoice();
    if (!pending) return;
    setPersona(pending.persona);
    setStudentLevel(pending.studentLevel);
    setField(pending.field);
    setSubject(pending.subject);
    setStep("quiz");
  }, []);

  const suggestedTracks = getTracks(field, persona);
  const needsStudentLevel = persona === "student";

  function choosePersona(nextPersona: Persona) {
    setPersona(nextPersona);
    // المستوى خاص بالطالب؛ إبقاؤه بعد اختيار شخصية تانية يخلّي بيانات
    // الحساب تقول حاجتين متناقضتين.
    if (nextPersona !== "student") setStudentLevel(null);
  }

  const handleSelectOption = (option: QuizOption) => {
    const newAnswers = [...answers, option];
    setAnswers(newAnswers);
    if (questionIndex < QUESTIONS.length - 1) {
      setQuestionIndex(questionIndex + 1);
    } else {
      buildPlan(newAnswers);
    }
  };

  const handleGoBack = () => {
    if (questionIndex === 0) {
      setStep("subject");
      return;
    }
    setAnswers(answers.slice(0, -1));
    setQuestionIndex(questionIndex - 1);
  };

  function computeProfile(finalAnswers: QuizOption[]) {
    const levels = finalAnswers.map((a) => a.level).filter((v): v is 1 | 2 | 3 => !!v);
    const avgLevel = levels.reduce((s, v) => s + v, 0) / (levels.length || 1);
    const level: SkillLevel = avgLevel < 1.7 ? "beginner" : avgLevel < 2.4 ? "intermediate" : "advanced";

    const paceCount: Record<Pace, number> = { relaxed: 0, standard: 0, intensive: 0 };
    finalAnswers.forEach((a) => a.pace && paceCount[a.pace]++);
    const pace = (Object.keys(paceCount) as Pace[]).sort((a, b) => paceCount[b] - paceCount[a])[0];

    const styleCount: Record<LearningStyle, number> = { practical: 0, visual: 0, academic: 0 };
    finalAnswers.forEach((a) => a.style && styleCount[a.style]++);
    const style = (Object.keys(styleCount) as LearningStyle[]).sort((a, b) => styleCount[b] - styleCount[a])[0];

    return { level, pace, style, days: startingSteps };
  }

  function fallbackDays(count: number): GeneratedDay[] {
    const prefix = getStepPrefix(category, persona);
    return Array.from({ length: count }, (_, i) => ({
      title: `${prefix} ${i + 1}`,
      topic: `${prefix} ${i + 1}: في ${subject}`,
      description: `شرح وتطبيقات عملية لـ ${subject}.`,
    }));
  }

  async function buildPlan(finalAnswers: QuizOption[]) {
    setStep("building");
    setBuildError(null);
    const profile = computeProfile(finalAnswers);
    setResult({ level: profile.level, style: profile.style, days: profile.days });

    let generatedDays: GeneratedDay[] = fallbackDays(profile.days);

    try {
      // سطور بتتحقن من طبقة المحورين (شخصية + مستوى + مجال) — مش مسار كود منفصل
      const systemInstruction = `أنت مصمم خطط دراسية خبير. ${buildPersonaContext(persona, studentLevel, field)} هتصمم خطة من ${profile.days} خطوات بالظبط لموضوع "${subject}" في مجال "${category}"، لشخص مستواه "${LEVEL_LABEL[profile.level]}" وأسلوب تعلمه المفضل "${STYLE_LABEL[profile.style]}". رتب الخطوات من الأساسيات للأصعب تدريجيًا. رد بصيغة JSON فقط بدون أي نص إضافي أو Markdown، على شكل array بالظبط كده: [{"title":"...", "topic":"...", "description":"..."}]. الحقل title يكون قصير زي "الدرس 1"، topic عنوان الموضوع نفسه، description جملة أو اتنين شرح مختصر للمحتوى.`;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction,
          messages: [{ role: "user", content: "ابني الخطة دلوقتي." }],
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "فشل الاتصال بالـ AI");

      const raw = data?.choices?.[0]?.message?.content || "";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      if (Array.isArray(parsed) && parsed.length > 0) {
        generatedDays = parsed
          .slice(0, profile.days)
          .map((d: any, i: number) => ({
            title: d.title || `${getStepPrefix(category, persona)} ${i + 1}`,
            topic: d.topic || subject,
            description: d.description || "",
          }));
      }
    } catch (err) {
      console.error("AI plan generation failed, using fallback:", err);
    }

    await saveEverything(profile, generatedDays);
  }

  async function saveEverything(
    profile: { level: SkillLevel; style: LearningStyle; days: number },
    generatedDays: GeneratedDay[]
  ) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let currentUser = user;
      if (!currentUser) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          currentUser = session.user;
        } else {
          const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
          if (anonError || !anonData.user) throw anonError || new Error("تعذر إنشاء جلسة");
          currentUser = anonData.user;
        }
      }

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", currentUser.id)
        .maybeSingle();

      // 👤 الشخصية والمجال صفات المستخدم مش صفات الدرس، فمكانهم profiles.
      // upsert مش insert: اليوزر الموجود بالفعل لازم ياخد الاختيار الجديد كمان.
      const personaFields = {
        persona,
        student_level: persona === "student" ? studentLevel : null,
        field,
        subject,
      };
      if (existingProfile) {
        const { error: profileError } = await supabase.from("profiles").update(personaFields).eq("id", currentUser.id);
        if (profileError) throw profileError;
      } else {
        const { error: profileError } = await supabase
          .from("profiles")
          .insert({ id: currentUser.id, xp: 0, streak: 1, theme: "amber", ...personaFields });
        if (profileError) throw profileError;
      }

      const { data: newConfig, error: configError } = await supabase
        .from("study_configs")
        .insert({
          user_id: currentUser.id,
          subject,
          category,
          days_count: generatedDays.length,
        })
        .select()
        .single();

      if (configError || !newConfig) throw configError || new Error("فشل إنشاء الخطة");

      const rows = generatedDays.map((d, i) => ({
        config_id: newConfig.id,
        user_id: currentUser!.id,
        day_number: i + 1,
        title: d.title,
        topic: d.topic,
        description: d.description,
        is_completed: false,
        xp_reward: 100,
        learning_style: profile.style,
      }));

      const { error: daysError } = await supabase.from("study_days").insert(rows);
      if (daysError) throw daysError;

      // 📚 التراك الجديد هو اللي المفروض يفتح. من غير السطر ده، لو المستخدم
      // كان مختار تراك قديم من صفحة الكورسات، الداشبورد هتفضل تفتحه هو —
      // فالمستخدم يعمل خطة جديدة وما يشوفهاش.
      //
      // الاختيار بيتكتب في الحساب (profiles.active_config_id) مش على الجهاز.
      // فشله مش سبب نرمي: الخطة اتحفظت خلاص، ولو العمود ناقص الداشبورد
      // بترجع لأحدث تراك — وهو التراك ده بالظبط. فالنتيجة نفسها.
      const { error: activeError } = await setActiveCourse(supabase, currentUser.id, newConfig.id);
      if (activeError) {
        console.warn("ما قدرناش نحفظ التراك المفتوح في الحساب:", activeError.message);
      }

      // الخطة اتحفظت، فالاختيار المعلّق خلص دوره. لو مسحناه قبل كده وحصل
      // خطأ، كان المستخدم هيفقد اختياره ويبدأ من الأول.
      clearPendingChoice();

      setStep("result");
    } catch (err) {
      console.error("Failed to save assessment plan:", err);
      setBuildError("حصل خطأ أثناء حفظ خطتك. حاول تاني.");
      setStep("result");
    }
  }

  return (
    <div className="min-h-screen font-sans bg-paper text-ink flex items-center justify-center p-4 sm:p-6" dir="rtl">
      <div className="w-full max-w-lg">
        <AnimatePresence mode="wait">
          {/* الخطوة 1: «ليه بتتعلم؟» قبل «إيه بتتعلم؟». الشخصية بتغيّر
              نبرة الخطة والموارد، والمستوى يظهر للطالب فقط. */}
          {step === "identity" && (
            <motion.div
              key="identity"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="sheet-card sheet-card-live card-lift p-6 sm:p-8 space-y-6"
            >
              <div>
                <p className="eyebrow eyebrow-flush mb-1.5">ابدأ خطتك</p>
                <h1 className="h2"><span className="mark mark-tilt">خلّينا نعرفك الأول</span></h1>
                <p className="text-sm text-ink-soft mt-2">اختيارات قليلة عشان الخطة تبقى مناسبة لاحتياجك، مش جدولًا عامًا.</p>
              </div>

              <div>
                <p className="field-label">إنت بتتعلم كـ…</p>
                <div className="space-y-2">
                  {PERSONAS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => choosePersona(item.id)}
                      aria-pressed={persona === item.id}
                      className={`w-full text-right border p-4 rounded-[var(--r-sm)] transition ${
                        persona === item.id
                          ? "bg-ink border-ink text-paper-2"
                          : "bg-paper border-rule text-ink hover:border-ink-soft hover:bg-paper-3"
                      }`}
                    >
                      <span className="font-bold text-sm"><span aria-hidden="true">{item.emoji}</span> {t[item.labelKey]}</span>
                      <span className={`block text-xs mt-1 ${persona === item.id ? "text-paper-2/75" : "text-ink-soft"}`}>{t[item.descKey]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {needsStudentLevel && (
                <div>
                  <p className="field-label">مستواك الدراسي</p>
                  <div className="grid grid-cols-2 gap-2">
                    {STUDENT_LEVELS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setStudentLevel(item.id)}
                        aria-pressed={studentLevel === item.id}
                        className={`mono p-3 rounded-[var(--r-sm)] border transition ${
                          studentLevel === item.id
                            ? "bg-ink border-ink text-paper-2"
                            : "bg-paper border-rule text-ink-soft hover:text-ink hover:border-ink-soft"
                        }`}
                      >
                        {t[item.labelKey]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setStep("subject")}
                disabled={needsStudentLevel && !studentLevel}
                className="btn btn-marker btn-block text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                كمّل اختيار هدفك
              </button>
            </motion.div>
          )}

          {/* الخطوة 2: المجال ثم التراك المحدد. الاقتراحات تساعد ولا تحصر؛
              يمكن للمستخدم كتابة أي موضوع حتى لو مش ظاهر في القائمة. */}
          {step === "subject" && (
            <motion.div
              key="subject"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="sheet-card sheet-card-live card-lift p-6 sm:p-8 space-y-6"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="eyebrow eyebrow-flush mb-1.5">خطوتك التالية</p>
                  <button type="button" onClick={() => setStep("identity")} className="mono text-xs text-ink-soft hover:text-ink">رجوع</button>
                </div>
                {/* الضربة الوحيدة في الصفحة كلها */}
                <h1 className="h2">
                  <span className="mark mark-tilt">هنبني خطتك على مستواك</span>
                </h1>
                <p className="text-sm text-ink-soft mt-2">
                  ٣ أسئلة سريعة، وبعدها نبدأ بخطة تقدر تمدّها في أي وقت.
                </p>
              </div>

              <div>
                <label htmlFor="subject-input" className="field-label">
                  إيه الموضوع أو التراك اللي عايز تبدأ فيه؟
                </label>
                <input
                  id="subject-input"
                  autoFocus
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="مثال: تصميم UI/UX، اللغة الإنجليزية، React…"
                  className="field text-sm"
                />
              </div>

              {/* 🌍 المجال — نفس محور FIELDS بتاع اللاندينج. الخطوة دي بتظهر
                  للي دخل /assessment على طول من غير ما يعدّي على المختار،
                  وبتحدّد نبرة الشرح والموارد بعدين. */}
              <div>
                <p className="field-label">مجالك</p>
                <div className="grid grid-cols-2 gap-2">
                  {FIELDS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setField(f.id)}
                      aria-pressed={field === f.id}
                      className={`mono p-3 rounded-[var(--r-sm)] border transition ${
                        field === f.id
                          ? "bg-ink border-ink text-paper-2"
                          : "bg-paper border-rule text-ink-soft hover:text-ink hover:border-ink-soft"
                      }`}
                    >
                      <span aria-hidden="true">{f.emoji}</span> {t[f.labelKey]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="field-label">اقتراحات مناسبة ليك</p>
                <div className="chip-row" role="list">
                  {suggestedTracks.map((track) => (
                    <button
                      key={track}
                      type="button"
                      role="listitem"
                      onClick={() => setSubject(track)}
                      aria-pressed={subject === track}
                      className="chip"
                    >
                      {track}
                    </button>
                  ))}
                </div>
              </div>

              {/* نوع الخطة — محور قديم موروث، بيأثر على نصوص الواجهة
                  (خطة المذاكرة / مراحل التنفيذ...) مش على المحتوى. */}
              <div>
                <p className="field-label">نوع الخطة</p>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCategory(c.id)}
                      aria-pressed={category === c.id}
                      className={`mono p-3 rounded-[var(--r-sm)] border transition ${
                        category === c.id
                          ? "bg-ink border-ink text-paper-2"
                          : "bg-paper border-rule text-ink-soft hover:text-ink hover:border-ink-soft"
                      }`}
                    >
                      {c.id}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="field-label">نبدأ بكام خطوة؟</p>
                <div className="grid grid-cols-3 gap-2">
                  {([1, 3, 5] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setStartingSteps(count)}
                      aria-pressed={startingSteps === count}
                      className={`mono p-3 rounded-[var(--r-sm)] border transition ${startingSteps === count ? "bg-ink border-ink text-paper-2" : "bg-paper border-rule text-ink-soft hover:text-ink"}`}
                    >
                      {count} {count === 1 ? "خطوة" : "خطوات"}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-soft">مش مدة ثابتة — تقدر تضيف خطوات جديدة بعد كده وقت ما تحتاج.</p>
              </div>

              <button
                onClick={() => subject.trim() && setStep("quiz")}
                disabled={!subject.trim()}
                className="btn btn-marker btn-block text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                يلا نبدأ الأسئلة
              </button>
            </motion.div>
          )}

          {/* أسئلة قصيرة لتخصيص أول خطوات الخطة */}
          {step === "quiz" && (
            <motion.div
              key={`q-${questionIndex}`}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="sheet-card sheet-card-live card-lift p-6 sm:p-8 space-y-6"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={handleGoBack}
                    className="mono text-ink-soft hover:text-ink px-2 py-1 rounded-[6px] hover:bg-paper-3 transition"
                  >
                    → رجوع
                  </button>
                  <span className="mono ltr-num tnum text-ink-soft">
                    {questionIndex + 1} / {QUESTIONS.length}
                  </span>
                </div>
                {/* الفسفوري هنا معناه "إنت واقف فين" — مفيش أصفر تاني في الشاشة */}
                <div className="meter meter-sm">
                  <motion.div
                    className="meter-fill bg-marker"
                    initial={{ width: 0 }}
                    animate={{ width: `${((questionIndex + 1) / QUESTIONS.length) * 100}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              </div>

              <h2 className="h3">{QUESTIONS[questionIndex].question}</h2>

              <div className="space-y-2.5">
                {QUESTIONS[questionIndex].options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectOption(opt)}
                    className="w-full text-right bg-paper border border-rule text-ink hover:border-ink-soft hover:bg-paper-3 p-4 rounded-[var(--r-sm)] text-sm font-bold transition"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* شاشة البناء */}
          {step === "building" && (
            <motion.div
              key="building"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="sheet-card sheet-card-live card-lift p-8 text-center space-y-4"
            >
              <div className="w-11 h-11 border-2 border-rule border-t-ink rounded-full animate-spin mx-auto" />
              <p className="tag justify-center">بيتم التجهيز</p>
              <h2 className="h3">بنجهّز بداية خطتك</h2>
              <p className="text-xs text-ink-soft leading-relaxed">
                على أساس إجاباتك، بنرتب خطوات مخصصة ليك في {subject}.
              </p>
            </motion.div>
          )}

          {/* النتيجة */}
          {step === "result" && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="sheet-card sheet-card-live card-lift p-6 sm:p-8 space-y-5"
            >
              {buildError ? (
                <>
                  <div>
                    <p className="eyebrow eyebrow-flush mb-1.5">التقييم المبدئي</p>
                    <h2 className="h3">الخطة مش اتحفظت</h2>
                  </div>
                  <div className="notice notice-error">
                    <p className="m-0">{buildError}</p>
                  </div>
                  <button
                    onClick={() => result && buildPlan(answers)}
                    className="btn btn-quiet btn-block text-sm"
                  >
                    حاول تاني
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="eyebrow eyebrow-flush mb-1.5">التقييم المبدئي</p>
                      <h2 className="h2">خطتك جاهزة</h2>
                    </div>
                    {/* ختم مضروب على الورقة بدل إيموجي احتفال */}
                    <span className="stamp bg-emerald-500 text-onmarker" aria-hidden="true">
                      <span className="text-lg leading-none font-bold">✓</span>
                      <span className="mono text-[9px]">تم</span>
                    </span>
                  </div>

                  {result && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-paper rounded-[var(--r-sm)] p-3">
                        <p className="tag mb-1.5">مستواك</p>
                        <p className="text-sm font-bold text-ink m-0">{LEVEL_LABEL[result.level]}</p>
                      </div>
                      <div className="bg-paper rounded-[var(--r-sm)] p-3">
                        <p className="tag mb-1.5">أسلوبك</p>
                        <p className="text-sm font-bold text-ink m-0">{STYLE_LABEL[result.style]}</p>
                      </div>
                      <div className="bg-paper rounded-[var(--r-sm)] p-3">
                        <p className="tag mb-1.5">بداية الخطة</p>
                        <p className="font-display font-extrabold text-xl text-ink tnum leading-none m-0">
                          {result.days}
                        </p>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => router.push("/dashboard")}
                    className="btn btn-marker btn-block text-sm"
                  >
                    يلا نبدأ
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
