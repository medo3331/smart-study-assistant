"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: proper typing requires architecture change, tracked separately */

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { PERSONA_NAME } from "@/lib/persona";
import { ReadAloud } from "@/components/ReadAloud";
import { MicButton } from "@/components/MicButton";
import { setSlidesSeed } from "@/app/dashboard/components/nav-config";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { StudyTutorWidget } from "@/components/StudyTutorWidget";
import { UnifiedChat } from "@/components/unified-ai/UnifiedChat";
import { awardCoins } from "@/lib/shop/shop-data";

// 🎴 إعادة تصميم صفحة الدرس — نفس نظام الداشبورد المنفَّذ (بنفسجي/تيل/عنبري على داكن)
// كل الأرقام من نفس حالة الصفحة الحقيقية؛ مفيش مصدر بيانات جديد ولا منطق بديل.
import { LessonShell, GlassCard, Reveal } from "./components/LessonChrome";
import { LessonBreadcrumb, LessonUnitProgress } from "./components/LessonBreadcrumb";
import { LessonHero } from "./components/LessonHero";
import { LessonModeTabs } from "./components/LessonModeTabs";
import { LessonProgressPanel } from "./components/LessonProgressPanel";

/** صفّ مبسّط لأيام الخطة — من استعلام study_days الموجود أصلًا. */
interface UnitDayLite {
  day_number: number;
  is_completed: boolean;
}

// --- Types ---
type CategoryType = "عمل ومشاريع" | "تعلم مهارة" | "دراسة أكاديمية" | "تطوير شخصي";
type LearningStyle = "practical" | "visual" | "academic";
type SmartViewMode = "simple" | "academic" | "visual" | "practical" | null;

interface ResourceLink {
  title: string;
  url: string;
}

interface DayRow {
  id: string;
  config_id: string;
  user_id: string;
  day_number: number;
  title: string;
  topic: string;
  description: string;
  is_completed: boolean;
  xp_reward: number;
  learning_style: LearningStyle;
  resource_links: ResourceLink[];
}

interface ConfigRow {
  subject: string;
  category: CategoryType;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

// ✅ عنصر الظهور الموحّد اتقفل من مكوّن LessonChrome المشترك (نفس السلوك: Fade+Slide مرة واحدة)

// ✅ إضافة: عارض Markdown بسيط - بيحوّل **نص عريض** وقوائم النقاط (- / *) والعناوين (##)
// لعناصر HTML حقيقية بدل ما تظهر كرموز خام (** و * ظاهرة كنص) زي ما كان بيحصل قبل كده
function renderMarkdownLite(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = (key: string) => {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={key} className="list-disc pr-5 space-y-1 my-1">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  const renderInline = (line: string): React.ReactNode => {
    // يحوّل **bold** لـ <strong>، وباقي النص زي ما هو
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          // المصطلح المهم بيتعلّم بالحبر التقيل مش بلون تاني — الأصفر محجوز للضربة الواحدة في الصفحة
          <strong key={i} className="font-bold text-ink">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushList(`list-${idx}`);
      elements.push(<div key={`sp-${idx}`} className="h-2" />);
      return;
    }
    if (line.startsWith("## ")) {
      flushList(`list-${idx}`);
      elements.push(
        <h4 key={idx} className="h3 text-[13px] mt-3 mb-1.5">
          {renderInline(line.replace(/^##\s*/, ""))}
        </h4>
      );
      return;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      listBuffer.push(line.replace(/^[-*]\s*/, ""));
      return;
    }
    flushList(`list-${idx}`);
    elements.push(
      <p key={idx} className="leading-relaxed">
        {renderInline(line)}
      </p>
    );
  });
  flushList("list-end");

  return <div className="space-y-1">{elements}</div>;
}


function SmartContentViewer({ topic, subject }: { topic: string; subject: string }) {
  const router = useRouter();
  const [activeMode, setActiveMode] = useState<SmartViewMode>(null);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<string | null>(null);

  const handleModeClick = async (mode: SmartViewMode) => {
    setActiveMode(mode);
    setLoading(true);
    setContent(null);

    const modePrompt = {
      simple: `اشرح مفهوم "${topic}" (جزء من مادة ${subject}) بشكل مبسط في نقاط واضحة، مع مثال بسيط يوضح الفكرة. اكتب الشرح بالعربي، لكن حافظ على المصطلحات التقنية بالإنجليزية بين قوسين أو مباشرة (زي: Signal, System, Frequency) لأنها المصطلحات المستخدمة في المراجع والامتحانات.`,
      academic: `اشرح "${topic}" (جزء من مادة ${subject}) بأسلوب أكاديمي متعمق: عرّف المفهوم بدقة، اذكر القوانين/المعادلات الأساسية لو موجودة، وضّح الفروق بين الأنواع المختلفة لو فيه، واختم بملخص سريع. اكتب بالعربي مع الإبقاء على المصطلحات التقنية والرموز بالإنجليزية زي المراجع الأكاديمية القياسية.`,
      visual: `اشرح "${topic}" (جزء من مادة ${subject}) بأسلوب مرئي وتخيلي: استخدم تشبيهات من الحياة اليومية، وارسم بالكلمات مخططات نصية بسيطة (زي رسم موجة أو رسم بياني في شكل نصي) توضح الفكرة بصريًا. اكتب بالعربي مع إبقاء المصطلحات التقنية بالإنجليزية.`,
      practical: `اديني مثال تطبيقي حقيقي أو تمرين محلول خطوة بخطوة على "${topic}" (جزء من مادة ${subject})، زي مسألة أو سيناريو عملي بيوضح إزاي المفهوم بيتطبق فعليًا. اكتب بالعربي مع إبقاء المصطلحات والمعادلات بالإنجليزية.`,
    }[mode as "simple" | "academic" | "visual" | "practical"];

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction:
            "أنت أستاذ جامعي خبير في شرح المواد التقنية والعلمية بأسلوب واضح ومتعمق. اكتب بالعربية الفصحى المبسطة، مع الإبقاء على المصطلحات التقنية والمعادلات والرموز بالإنجليزية زي ما هي متعارف عليها في المراجع العلمية (متكتبش المصطلح العلمي بالعربي لو مفيش ترجمة شائعة ليه). استخدم تنسيق Markdown بسيط: **نص عريض** للمصطلحات المهمة، وقوائم نقطية (- أو *) للنقاط، وعناوين فرعية لو الشرح طويل. خلي الشرح عملي ومفيد فعلاً مش سطحي، لكن من غير حشو زيادة عن اللزوم.",
          messages: [{ role: "user", content: modePrompt }],
        }),
      });
      const data = await response.json();
      const reply = data?.choices?.[0]?.message?.content || "لم نتمكن من توليد المحتوى، حاول تاني.";
      setContent(reply);
    } catch {
      setContent("حصل خطأ أثناء توليد المحتوى، حاول تاني.");
    } finally {
      setLoading(false);
    }
  };

  // أربع طرق لشرح نفس الحاجة — مش تسلسل، فمفيش أرقام ولا أيقونات، الاسم لوحده كفاية
  const tabs: { id: SmartViewMode; label: string }[] = [
    { id: "simple", label: "شرح" },
    { id: "practical", label: "عملي" },
    { id: "visual", label: "مرئي" },
    { id: "academic", label: "أكاديمي" },
  ];

  return (
    <div dir="rtl">
      {/* التاب المفتوح بيتعلّم بالحبر: bg-ink — الأصفر مش لون "المختار" */}
      <div className="flex items-center gap-1 bg-paper border border-rule p-1 rounded-[var(--r-sm)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleModeClick(tab.id)}
            aria-pressed={activeMode === tab.id}
            className={`mono flex-1 px-2 py-2 rounded-[6px] transition ${
              activeMode === tab.id ? "bg-ink text-paper-2" : "text-ink-soft hover:text-ink hover:bg-paper-3"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeMode && (
          <motion.div
            key={activeMode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mt-3 bg-paper border border-rule p-4 rounded-[var(--r-sm)]"
          >
            {loading ? (
              <div className="py-8 text-center flex flex-col items-center gap-2.5">
                <span className="w-4 h-4 border-2 border-rule border-t-redpen rounded-full animate-spin" />
                <p className="tag justify-center">بيجهّز الشرح</p>
              </div>
            ) : (
              <>
                <div className="text-[12.5px] text-ink-soft leading-relaxed">{content && renderMarkdownLite(content)}</div>
                {/* القراءة بصوت عالي: مفيدة وإنت بتكتب كود وعينك على الإيديتور.
                    resetKey = التاب، فلو بدّلت النمط القراءة القديمة تقف. */}
                {content && (
                  <div className="mt-4 pt-3.5 border-t border-rule space-y-2.5">
                    <ReadAloud text={content} resetKey={activeMode ?? ""} />
                    {/* الشرح ده يبقى عرض شرائح — الشرح نفسه بيتبعت كمصدر
                        عشان الشرائح تطلع من كلام الدرس مش من معرفة عامة. */}
                    <button
                      onClick={() => {
                        setSlidesSeed(`${topic}${subject ? ` — ${subject}` : ""}`, content);
                        router.push("/dashboard/slides");
                      }}
                      className="btn btn-quiet text-xs px-3.5 py-2"
                    >
                      <span aria-hidden>🖥️</span>
                      اعمل عرض من الشرح ده
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LessonDetailPage() {
  const router = useRouter();
  const params = useParams();
  const dayId = params?.dayId as string;
  const [supabase] = useState(() => createClient());

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [dayRow, setDayRow] = useState<DayRow | null>(null);
  const [config, setConfig] = useState<ConfigRow | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileXp, setProfileXp] = useState(0);

  // ✅ إضافة: تقدم الخطة الكلي (بيظهر فوق الصفحة) + رابط الدرس التالي (لزر "الدرس التالي" بعد الاحتفال)
  const [planProgress, setPlanProgress] = useState<{ completed: number; total: number } | null>(null);
  // 🧩 أيام الخطة (id/day_number/is_completed) لتقدّم الوحدة المجزّأ — نفس الاستعلام الموجود
  const [planDays, setPlanDays] = useState<UnitDayLite[]>([]);
  const [nextDayId, setNextDayId] = useState<string | null>(null);

  // ✅ إضافة: حالة محلية لأزرار الإجراءات السريعة (حفظ/مفضلة) - بصرية بحتة
  const [isSaved, setIsSaved] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);

  // 🗃️ مستودع الموارد (Vault)
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [savingLink, setSavingLink] = useState(false);
  // ✅ إضافة: إظهار فورم إضافة مورد جديد بدل ما يكون ظاهر طول الوقت (شكل Google Drive)
  const [showAddResourceForm, setShowAddResourceForm] = useState(false);

  // 🧠 الاختبار الذكي
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  // ✅ إضافة: مودال الاحتفال بعد إنهاء الدرس بنجاح
  const [showCelebration, setShowCelebration] = useState(false);
  /* 🪙 الكوينز اللي اتكسبت من الدرس ده. صفر = ماحصلش (سقف يومي، أو جداول
     المتجر لسه ما اتعملتش) — والاحتفال ساعتها بيعدّي من غير ما يذكرها. */
  const [coinsWon, setCoinsWon] = useState(0);

  // 🤖 محادثة الـ AI التفاعلية
  const [chatMessages, setChatMessages] = useState<{ sender: "user" | "ai"; text: string }[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // ✅ إضافة: مرجع لقسم العارض الذكي عشان زر "ابدأ الدرس" في الـ Hero يعمل scroll ليه
  const smartViewerRef = useRef<HTMLDivElement | null>(null);

  // القلم المختار للصفحة دي: الأصفر بيستخدم للفعل الأساسي بس (ابدأ الدرس / أنهِ الدرس)

  // 🔴 تحميل بيانات الدرس والمادة والبروفايل
  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);

      const { data: day, error: dayError } = await supabase
        .from("study_days")
        .select("*")
        .eq("id", dayId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (dayError || !day) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const typedDay = { ...day, resource_links: day.resource_links || [] } as DayRow;
      setDayRow(typedDay);

      const { data: cfg } = await supabase
        .from("study_configs")
        .select("subject, category")
        .eq("id", day.config_id)
        .maybeSingle();
      if (cfg) setConfig(cfg as ConfigRow);

      const { data: profile } = await supabase.from("profiles").select("xp").eq("id", user.id).maybeSingle();
      setProfileXp(profile?.xp || 0);

      // ✅ إضافة: جلب كل أيام الخطة عشان نحسب التقدم الكلي (Progress Bar فوق الصفحة)
      // ونحدد id الدرس التالي (لزر "الدرس التالي" في شاشة الاحتفال)
      const { data: allDays } = await supabase
        .from("study_days")
        .select("id, day_number, is_completed")
        .eq("config_id", day.config_id)
        .order("day_number", { ascending: true });

      if (allDays) {
        const completed = allDays.filter((d: { is_completed: boolean }) => d.is_completed).length;
        setPlanProgress({ completed, total: allDays.length });
        // 🧩 حفظ أيام الخطة للشريط المجزّأ (نفس البيانات، صفر استعلامات إضافية)
        setPlanDays(
          allDays.map((d: { day_number: number; is_completed: boolean }) => ({
            day_number: d.day_number,
            is_completed: d.is_completed,
          }))
        );
        const next = allDays.find((d: { day_number: number }) => d.day_number === typedDay.day_number + 1);
        setNextDayId(next ? (next as any).id : null);
      }

      setLoading(false);
    };
    if (dayId) load();
  }, [dayId, supabase, router]);

  // 🔽 سكرول تلقائي لآخر رسالة في الشات
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isAiLoading]);

  // 🎨 تغيير نمط التعلم لهذا الدرس
  const changeLearningStyle = async (style: LearningStyle) => {
    if (!dayRow) return;
    setDayRow({ ...dayRow, learning_style: style });
    await supabase.from("study_days").update({ learning_style: style }).eq("id", dayRow.id);
  };

  // 🗃️ إضافة رابط جديد للمستودع
  const handleAddLink = async () => {
    if (!dayRow || !newLinkTitle.trim() || !newLinkUrl.trim()) return;
    setSavingLink(true);
    let cleanUrl = newLinkUrl.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = `https://${cleanUrl}`;

    const updatedLinks = [...dayRow.resource_links, { title: newLinkTitle.trim(), url: cleanUrl }];
    const { error } = await supabase.from("study_days").update({ resource_links: updatedLinks }).eq("id", dayRow.id);
    if (!error) {
      setDayRow({ ...dayRow, resource_links: updatedLinks });
      setNewLinkTitle("");
      setNewLinkUrl("");
      setShowAddResourceForm(false);
    }
    setSavingLink(false);
  };

  // 🗃️ حذف رابط من المستودع
  const handleRemoveLink = async (index: number) => {
    if (!dayRow) return;
    const updatedLinks = dayRow.resource_links.filter((_, i) => i !== index);
    setDayRow({ ...dayRow, resource_links: updatedLinks });
    await supabase.from("study_days").update({ resource_links: updatedLinks }).eq("id", dayRow.id);
  };

  // 📚 روابط مقترحة تلقائيًا حسب النمط (خارجية، للقراءة فقط)
  const getSuggestedResources = (topic: string, subject: string, style: LearningStyle) => {
    const query = encodeURIComponent(`${topic} ${subject}`);
    if (style === "visual") {
      return [
        { title: "فيديو شرح", icon: "🎥", url: `https://www.youtube.com/results?search_query=${query}` },
        { title: "خرائط ذهنية", icon: "🖼️", url: `https://www.google.com/search?tbm=isch&q=${query}+diagram` },
      ];
    } else if (style === "academic") {
      return [
        { title: "ملخصات PDF", icon: "📄", url: `https://www.google.com/search?q=${query}+filetype:pdf` },
        { title: "مراجع علمية", icon: "🏛️", url: `https://scholar.google.com/scholar?q=${query}` },
      ];
    }
    return [
      { title: "تمارين وتطبيقات", icon: "🖥️", url: `https://www.google.com/search?q=${query}+practical+exercises` },
      { title: "تطبيق عملي", icon: "🚀", url: `https://www.youtube.com/results?search_query=${query}+tutorial` },
    ];
  };

  // 🧠 توليد اختبار ذكي عبر الـ AI
  const handleStartQuiz = async () => {
    if (!dayRow || !config) return;
    setQuizLoading(true);
    setQuizSubmitted(false);
    setQuizScore(0);
    setSelectedAnswers([]);

    const prompt = `اكتب 4 أسئلة اختيار من متعدد (كل سؤال له 4 اختيارات وإجابة صحيحة واحدة) لاختبار فهم الطالب لموضوع "${dayRow.topic}" (جزء من مادة/مشروع "${config.subject}"، الوصف: "${dayRow.description}"). رجّع الإجابة بصيغة JSON فقط بدون أي نص إضافي أو علامات markdown، بالشكل ده بالظبط:
[{"question": "نص السؤال", "options": ["اختيار1", "اختيار2", "اختيار3", "اختيار4"], "correctIndex": 0}]
لازم تكون الأسئلة بالعربي، وcorrectIndex هو رقم الاختيار الصحيح (يبدأ من 0).`;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: "أنت مولّد اختبارات تعليمية. رجّع JSON صحيح فقط بدون أي شرح أو نص خارج الـ JSON.",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await response.json();
      const raw = data?.choices?.[0]?.message?.content || "[]";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed: QuizQuestion[] = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setQuizQuestions(parsed);
        setSelectedAnswers(new Array(parsed.length).fill(-1));
        setQuizStarted(true);
      } else {
        throw new Error("empty");
      }
    } catch {
      setQuizQuestions([]);
      setQuizStarted(false);
      alert("حصل خطأ أثناء توليد الاختبار، حاول تاني.");
    } finally {
      setQuizLoading(false);
    }
  };

  // 🤖 إرسال رسالة للمساعد الذكي والحصول على رد
  const handleSendMessage = async () => {
    if (!userInput.trim() || !dayRow || !config || isAiLoading) return;
    const userText = userInput;
    const updatedMessages = [...chatMessages, { sender: "user" as const, text: userText }];
    setChatMessages(updatedMessages);
    setUserInput("");
    setIsAiLoading(true);

    try {
      const styleGuide = {
        practical: "اشرح بالسرعة والأمثلة المباشرة والتشبيهات العملية.",
        visual: "اشرح باستخدام المخططات النصية والتجسيم والتخيل.",
        academic: "اشرح بالتعاريف العلمية والدقيقة مع تفكيك المفاهيم.",
      }[dayRow.learning_style];

      const systemInstruction = `أنت أستاذ جامعي خبير، بترد على أسئلة الطالب بشكل تفاعلي ومتعمق. المادة/المشروع: "${config.subject}" | الدرس الحالي: "${dayRow.topic}" (${dayRow.description}). النمط المطلوب: ${styleGuide} اكتب بالعربية مع الإبقاء على المصطلحات والمعادلات التقنية بالإنجليزية زي المراجع العلمية. استخدم **نص عريض** وقوائم نقطية لو الإجابة فيها أكتر من نقطة، وكن دقيقًا ومفيدًا فعليًا مش سطحي.`;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction,
          messages: updatedMessages.map((m) => ({ role: m.sender === "user" ? "user" : "assistant", content: m.text })),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "خطأ في الاتصال");

      const aiReply = data?.choices?.[0]?.message?.content || "لم يتم استقبال رد.";
      setChatMessages([...updatedMessages, { sender: "ai", text: aiReply }]);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "حدث خطأ غير معروف";
      setChatMessages([...updatedMessages, { sender: "ai", text: `خطأ: ${errorMsg}` }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSelectAnswer = (qIndex: number, optIndex: number) => {
    if (quizSubmitted) return;
    setSelectedAnswers((prev) => {
      const next = [...prev];
      next[qIndex] = optIndex;
      return next;
    });
  };

  const handleSubmitQuiz = () => {
    let correct = 0;
    quizQuestions.forEach((q, i) => {
      if (selectedAnswers[i] === q.correctIndex) correct++;
    });
    setQuizScore(correct);
    setQuizSubmitted(true);
  };

  const passThreshold = Math.ceil(quizQuestions.length * 0.6);
  const quizPassed = quizSubmitted && quizScore >= passThreshold;

  // 🏁 إنهاء الدرس رسميًا بعد نجاح الاختبار: يعلّم الدرس كمكتمل + يضيف XP + يسجل نشاط اليوم
  // ✅ تعديل: بعد النجاح بيظهر مودال احتفال (🎉 أحسنت! + XP + زر الدرس التالي) بدل ما تفضل رسالة نص بسيطة
  const handleCompleteLesson = async () => {
    if (!dayRow || !userId || completing) return;
    setCompleting(true);

    await supabase.from("study_days").update({ is_completed: true }).eq("id", dayRow.id);
    await supabase
      .from("profiles")
      .update({ xp: profileXp + dayRow.xp_reward })
      .eq("id", userId);

    const todayKey = new Date().toISOString().slice(0, 10);
    const { data: existingActivity } = await supabase
      .from("activity_log")
      .select("*")
      .eq("user_id", userId)
      .eq("activity_date", todayKey)
      .maybeSingle();

    if (existingActivity) {
      await supabase
        .from("activity_log")
        .update({ tasks_completed: (existingActivity.tasks_completed || 0) + 1 })
        .eq("user_id", userId)
        .eq("activity_date", todayKey);
    } else {
      await supabase.from("activity_log").insert({
        user_id: userId,
        activity_date: todayKey,
        focus_minutes: 0,
        tasks_completed: 1,
      });
    }

    setDayRow({ ...dayRow, is_completed: true });
    setProfileXp((prev) => prev + dayRow.xp_reward);
    setPlanProgress((prev) => (prev ? { ...prev, completed: Math.min(prev.completed + 1, prev.total) } : prev));
    setJustCompleted(true);
    setCompleting(false);
    setShowCelebration(true);

    /* 🪙 كوينز المتجر — بعد كل حاجة، وفي try مستقل.
       الترتيب مقصود: الـ XP والنشاط والاحتفال كلهم خلصوا فوق. لو جداول
       المتجر لسه ما اتعملتش (db/shop.sql) النداء ده بيفشل — ولازم يفضل
       فشل صامت مايلمسش إنهاء الدرس. الكوينز إضافة على الموجود مش شرط فيه.

       ⚠️ المبلغ والسقف اليومي من السيرفر (`award_coins`)، مش من هنا —
       الكلاينت مابيبعتش رقم خالص. */
    try {
      const res = await awardCoins(supabase, "day_done", dayRow.id);
      if (res.data && res.data.awarded > 0) setCoinsWon(res.data.awarded);
    } catch (err) {
      console.error("award day_done failed (متجاهَل):", err);
    }
  };

  const handleShareLesson = async () => {
    const text = `📚 بذاكر "${dayRow?.topic}" في ${config?.subject}! 🔥`;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ text });
      } catch {
        /* المستخدم لغى المشاركة */
      }
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        alert("تم النسخ.");
      } catch {
        alert(text);
      }
    }
  };

  if (loading) {
    return (
      <LessonShell>
        <div className="flex min-h-screen items-center justify-center" dir="rtl">
          <p className="text-sm text-[#9AA0C0]">بيحمّل الدرس…</p>
        </div>
      </LessonShell>
    );
  }

  if (notFound || !dayRow) {
    return (
      <LessonShell>
        <div className="flex min-h-screen items-center justify-center p-4" dir="rtl">
          <GlassCard className="w-full max-w-sm space-y-4 p-6">
            <div>
              <p className="mb-1.5 text-xs font-bold tracking-wide text-[#F5A25C]">مش موجود</p>
              <h1 className="text-lg font-bold text-white">الدرس ده مش متاح</h1>
            </div>
            <p className="text-xs leading-relaxed text-[#9AA0C0]">
              الدرس ده مش موجود، أو معندكش صلاحية توصله من الحساب ده.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex h-10 w-full items-center justify-center rounded-2xl bg-[#DC4C4C] text-sm font-semibold text-white transition-colors hover:bg-[#F2745C]"
            >
              الرجوع للداشبورد
            </button>
          </GlassCard>
        </div>
      </LessonShell>
    );
  }

  const suggestedResources = getSuggestedResources(dayRow.topic, config?.subject || "", dayRow.learning_style);
  const styleLabel = { practical: "عملي", visual: "مرئي", academic: "أكاديمي" }[dayRow.learning_style];
  const overallPercent = planProgress && planProgress.total > 0 ? Math.round((planProgress.completed / planProgress.total) * 100) : 0;
  // 🧩 أيام نفس الخطة للشريط المجزّأ — من حالة الصفحة المحفوظة (مفيش استعلام جديد)
  const unitDays: UnitDayLite[] = (planDays ?? [])
    .slice()
    .sort((a, b) => a.day_number - b.day_number);

  /* 🎯 حالة الـ CTA من الحالة الفعلية فقط:
     مكتمل → راجع · متُرك بدون إكمال وفيه أيام أبعد فُتحت → تابع · غير ده → ابدأ */
  const ctaState: "start" | "continue" | "review" = dayRow.is_completed
    ? "review"
    : unitDays.some((d) => !d.is_completed && d.day_number > dayRow.day_number)
      ? "continue"
      : "start";

  return (
    <LessonShell>
    <div className="min-h-screen p-4 sm:p-6 md:p-10 font-sans text-[#E7E9F5]" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* ─── فاتحة الصفحة: مسار التنقل (المادة + عنوان الدرس الحقيقي) ─── */}
        <Reveal index={0}>
          <LessonBreadcrumb subject={config?.subject} title={dayRow.topic} />
        </Reveal>

        {/* ─── تقدّم الوحدة المجزّأ: نقاط حقيقية من أيام نفس الخطة ─── */}
        {unitDays.length > 0 && (
          <Reveal index={1}>
            <LessonUnitProgress days={unitDays} currentDayNumber={dayRow.day_number} />
          </Reveal>
        )}

        {/* ─── هيرو الدرس: العنوان والوصف وXP الحقيقيين + CTA ديناميكي ─── */}
        <Reveal index={2}>
          <LessonHero
            subject={config?.subject}
            title={dayRow.topic}
            description={dayRow.description}
            xpReward={dayRow.xp_reward}
            state={ctaState}
            onStart={() => smartViewerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            isSaved={isSaved}
            onToggleSave={() => setIsSaved((v) => !v)}
            isFavorite={isBookmarked}
            onToggleFavorite={() => setIsBookmarked((v) => !v)}
            onShare={handleShareLesson}
          />
        </Reveal>

        {/* Study Tutor Widget — lesson integration (preserved, embedded in unified system) */}
        <Reveal index={3}>
          <StudyTutorWidget
            userRole="student"
            field={typeof config!=="undefined" ? config?.subject : "study"}
            subject={typeof config!=="undefined" ? config?.subject : "unknown"}
            studentLevel="unknown"
            currentLesson={dayRow?.topic ?? "current lesson"}
            progress="current"
            language="ar"
          />
        </Reveal>

        {/* Unified AI — single interface (upload + chat) on lesson page */}
        <Reveal index={4}>
          <section aria-label="مساعد Magic الموحد" className="max-w-3xl mx-auto px-4 py-5 mt-4">
            <UnifiedChat initialContext={{ language: "ar", preferences: { language: "ar", field: typeof config!=="undefined" ? config?.subject : "study" } }} />
          </section>
        </Reveal>


        {/* ─── التبويبات الموحّدة: نفس learning_style الموجود ─── */}
        <div className="flex justify-center sm:justify-start">
          <Reveal index={3}>
            <LessonModeTabs
              modes={[
                { id: "academic", label: "أكاديمي" },
                { id: "visual", label: "بصري" },
                { id: "practical", label: "تطبيقي" },
              ]}
              active={dayRow.learning_style as "academic" | "visual" | "practical"}
              onChange={(id) => void changeLearningStyle(id)}
            />
          </Reveal>
        </div>

        {/* ─── الشرح + لوحة التقدّم: عمودان على الشاشات الواسعة، متراكبان على الموبايل ─── */}
        <div className="grid gap-5 lg:grid-cols-[1fr_280px] lg:items-start">
          {/* العارض الذكي */}
          <Reveal delay={0.1} className="min-w-0">
            <div ref={smartViewerRef} className="sheet-card p-5 sm:p-6 space-y-4 scroll-mt-6">
              <div>
                <p className="eyebrow eyebrow-flush mb-1.5">الشرح</p>
                <h2 className="h3">اقرا الدرس بالطريقة اللي تعجبك</h2>
              </div>
              <SmartContentViewer topic={dayRow.topic} subject={config?.subject || ""} />
            </div>
          </Reveal>

          {/* لوحة التقدّم: نسبة الخطة الحقيقية + أقسام الدرس + XP الحقيقي */}
          <Reveal delay={0.14}>
            <LessonProgressPanel
              percent={overallPercent}
              xpReward={dayRow.xp_reward}
              sections={[
                { label: "الشرح", state: "current" },
                { label: "سؤال وجواب", state: "todo" },
                { label: "موارد الدرس", state: "todo" },
                {
                  label: dayRow.is_completed ? "الاختبار — مكتمل ✓" : "الاختبار القصير",
                  state: dayRow.is_completed ? "done" : "todo",
                },
              ]}
            />
          </Reveal>
        </div>

        {/* المحادثة: نص مكتوب بأسماء المتكلمين، مش بابلز */}
        <Reveal delay={0.12}>
          <div className="sheet-card p-5 sm:p-6 space-y-4">
            <div>
              <p className="eyebrow eyebrow-flush mb-1.5">سؤال وجواب</p>
              <h2 className="h3">اسأل أي حاجة في الدرس</h2>
            </div>

            <div className="bg-paper border border-rule rounded-[var(--r-sm)] p-4 max-h-80 overflow-y-auto space-y-3.5">
              {chatMessages.length === 0 && (
                <p className="text-[11px] text-ink-soft leading-relaxed text-center max-w-xs mx-auto py-8">
                  اسأل أي سؤال عن «{dayRow.topic}» وهيجيلك الرد على طول، مظبوط على نمط ({styleLabel}) اللي مختاره فوق.
                </p>
              )}
              {chatMessages.map((msg, index) => (
                <div key={index}>
                  <p className="tag mb-1">{msg.sender === "user" ? "أنت" : PERSONA_NAME}</p>
                  <div
                    className={`text-xs leading-relaxed text-ink p-3 rounded-[var(--r-sm)] border ${
                      msg.sender === "user"
                        ? "bg-paper-3 border-rule-strong whitespace-pre-wrap"
                        : "bg-paper-2 border-rule border-s-[3px] border-s-redpen"
                    }`}
                  >
                    {msg.sender === "ai" ? renderMarkdownLite(msg.text) : msg.text}
                  </div>
                </div>
              ))}
              {isAiLoading && (
                <div>
                  <p className="tag mb-1">{PERSONA_NAME}</p>
                  <div className="bg-paper-2 border border-rule border-s-[3px] border-s-redpen rounded-[var(--r-sm)] px-4 py-3 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-ink-soft rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-ink-soft rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-ink-soft rounded-full animate-bounce" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder="اكتب سؤالك أو اسأل بالصوت"
                className="field flex-1 py-2.5 text-xs"
              />
              {/* المايك بيكتب في نفس الحقل — مش بيبعت لوحده عن قصد،
                  عشان المستخدم يراجع النص قبل الإرسال (التعرّف مش مظبوط ١٠٠٪). */}
              <MicButton onText={setUserInput} disabled={isAiLoading} />
              <button
                onClick={handleSendMessage}
                disabled={isAiLoading || !userInput.trim()}
                aria-label="ابعت السؤال"
                className="btn bg-ink text-paper-2 border-ink hover:opacity-90 text-sm px-4 py-2.5 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ←
              </button>
            </div>
          </div>
        </Reveal>

        {/* الموارد: ليستة روابط في ورقة، مش كروت أيقونات */}
        <Reveal delay={0.14}>
          <div className="sheet-card p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow eyebrow-flush mb-1.5">مراجع</p>
                <h2 className="h3">موارد الدرس</h2>
              </div>
              <button
                onClick={() => setShowAddResourceForm((v) => !v)}
                aria-expanded={showAddResourceForm}
                className="btn btn-quiet text-xs px-3.5 py-2 shrink-0"
              >
                {showAddResourceForm ? "إلغاء" : "أضف رابط"}
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              {suggestedResources.map((res, i) => (
                <a
                  key={`suggested-${i}`}
                  href={res.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-paper border border-rule hover:border-rule-strong rounded-[var(--r-sm)] px-3.5 py-3 flex flex-col gap-1 transition"
                >
                  <span className="tag">مقترح</span>
                  <span className="text-[11.5px] font-bold text-ink truncate">{res.title}</span>
                </a>
              ))}

              {dayRow.resource_links.map((link, i) => (
                <div
                  key={`user-${i}`}
                  className="relative bg-paper border border-rule hover:border-rule-strong rounded-[var(--r-sm)] px-3.5 py-3 transition"
                >
                  <button
                    onClick={() => handleRemoveLink(i)}
                    aria-label={`شيل ${link.title}`}
                    className="mono absolute top-2 left-2 text-ink-soft hover:text-redpen w-5 h-5 flex items-center justify-center rounded-[6px] hover:bg-paper-3 transition"
                  >
                    ✕
                  </button>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-1">
                    <span className="tag">بتاعك</span>
                    <span className="text-[11.5px] font-bold text-ink truncate pe-6">{link.title}</span>
                  </a>
                </div>
              ))}
            </div>

            <AnimatePresence>
              {showAddResourceForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <input
                      type="text"
                      value={newLinkTitle}
                      onChange={(e) => setNewLinkTitle(e.target.value)}
                      placeholder="اسم الرابط (مثال: GitHub Repo)"
                      className="field flex-1 py-2.5 text-xs"
                    />
                    <input
                      type="text"
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      placeholder="الرابط"
                      className="field flex-1 py-2.5 text-xs"
                    />
                    <button
                      onClick={handleAddLink}
                      disabled={savingLink || !newLinkTitle.trim() || !newLinkUrl.trim()}
                      className="btn btn-marker text-xs px-4 py-2.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingLink ? "بيضيف" : "إضافة"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Reveal>

        {/* الاختبار: ورقة أسئلة — الاختيار بيتعلّم بالحبر، والتصحيح بأخضر/أحمر بعد التسليم */}
        <Reveal delay={0.16}>
          <div className="sheet-card p-5 sm:p-6 space-y-4">
            {!quizStarted && !justCompleted && !dayRow.is_completed && (
              <div className="space-y-4">
                <div>
                  <p className="eyebrow eyebrow-flush mb-1.5">اختبار</p>
                  <h2 className="h3">جرّب نفسك في الدرس</h2>
                </div>
                <p className="text-xs text-ink-soft leading-relaxed">
                  أسئلة سريعة على «{dayRow.topic}». لازم تعدّيها عشان الدرس يتحسب مكتمل.
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="tag tag-quiet">
                    <span className="ltr-num tnum">5</span> دقايق
                  </span>
                  <span className="tag tag-quiet">
                    <span className="ltr-num tnum">+{dayRow.xp_reward}</span> XP
                  </span>
                </div>
                <button
                  onClick={handleStartQuiz}
                  disabled={quizLoading}
                  className="btn bg-ink text-paper-2 border-ink hover:opacity-90 text-sm w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {quizLoading ? "بيجهّز الأسئلة" : "ابدأ الاختبار"}
                </button>
              </div>
            )}

            {(dayRow.is_completed || justCompleted) && !showCelebration && (
              <div className="flex items-center gap-4">
                <div className="stamp bg-emerald-500 text-onmarker" aria-hidden>
                  <span className="font-display font-extrabold text-xl leading-none">✓</span>
                </div>
                <div>
                  <p className="eyebrow eyebrow-flush mb-1">مخلّص</p>
                  <p className="text-sm font-bold text-ink">الدرس ده مكتمل ومتسجّل.</p>
                </div>
              </div>
            )}

            {quizStarted && !dayRow.is_completed && !justCompleted && (
              <div className="space-y-4">
                <div>
                  <p className="eyebrow eyebrow-flush mb-1.5">اختبار</p>
                  <h2 className="h3">
                    <span className="ltr-num tnum">{quizQuestions.length}</span> أسئلة
                  </h2>
                </div>

                {quizQuestions.map((q, qIndex) => (
                  <div key={qIndex} className="bg-paper border border-rule rounded-[var(--r-sm)] p-4 space-y-2.5">
                    <p className="text-xs font-bold text-ink leading-relaxed">
                      <span className="ltr-num tnum text-ink-soft me-1.5">{qIndex + 1}.</span>
                      {q.question}
                    </p>
                    <div className="grid gap-1.5">
                      {q.options.map((opt, optIndex) => {
                        const isSelected = selectedAnswers[qIndex] === optIndex;
                        const isCorrectOpt = optIndex === q.correctIndex;
                        let style = "bg-paper-2 border-rule text-ink hover:bg-paper-3";
                        if (quizSubmitted) {
                          if (isCorrectOpt) style = "bg-emerald-950 border-emerald-500 text-ink";
                          else if (isSelected && !isCorrectOpt) style = "bg-red-950 border-red-500 text-ink";
                        } else if (isSelected) {
                          style = "bg-ink border-ink text-paper-2";
                        }
                        return (
                          <button
                            key={optIndex}
                            onClick={() => handleSelectAnswer(qIndex, optIndex)}
                            disabled={quizSubmitted}
                            aria-pressed={isSelected}
                            className={`text-right px-3 py-2.5 rounded-[var(--r-sm)] text-[11.5px] font-semibold border transition ${style}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {!quizSubmitted ? (
                  <button
                    onClick={handleSubmitQuiz}
                    disabled={selectedAnswers.includes(-1)}
                    className="btn bg-ink text-paper-2 border-ink hover:opacity-90 btn-block text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    سلّم الإجابات
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className={`notice ${quizPassed ? "notice-ok" : "notice-error"}`}>
                      <p className="m-0 leading-relaxed">
                        نتيجتك{" "}
                        <span className="ltr-num tnum font-bold">
                          {quizScore} / {quizQuestions.length}
                        </span>{" "}
                        — {quizPassed ? "عدّيت الاختبار." : "محتاج مراجعة تانية."}
                      </p>
                    </div>

                    {quizPassed ? (
                      <button
                        onClick={handleCompleteLesson}
                        disabled={completing}
                        className="btn btn-marker btn-block text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {completing ? "بيحفظ" : `خلّص الدرس واستلم ${dayRow.xp_reward} XP`}
                      </button>
                    ) : (
                      <button onClick={handleStartQuiz} className="btn btn-quiet btn-block text-sm">
                        جرّب تاني بأسئلة جديدة
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </Reveal>
      </div>

      {/* مودال الاحتفال: ختم "تم" على الورقة — نفس ختم الداشبورد */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/45 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 24, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: "spring", damping: 18, stiffness: 240 }}
              className="sheet-card sheet-card-live card-lift p-6 w-full max-w-sm space-y-5 text-center"
              dir="rtl"
            >
              <motion.div
                initial={{ scale: 0, rotate: -14 }}
                animate={{ scale: 1, rotate: -2.5 }}
                transition={{ delay: 0.12, type: "spring", stiffness: 300 }}
                className="stamp w-20 h-20 mx-auto bg-marker text-onmarker"
                aria-hidden
              >
                <span className="font-display font-extrabold text-2xl leading-none">تم</span>
                <span className="mono ltr-num text-[9px] opacity-75">+{dayRow.xp_reward} XP</span>
              </motion.div>

              <div>
                <p className="eyebrow eyebrow-flush justify-center mb-1.5">مخلّص</p>
                <h3 className="h3">
                  خلّصت الدرس <span className="ltr-num tnum">{dayRow.day_number}</span>
                </h3>
                <p className="text-xs text-ink-soft mt-1.5">السلسلة مستمرة. متقطعهاش بكرة.</p>

                {/* الكوينز لما تنزل بس. صفر معناها السقف اليومي خلص (أو المتجر
                    لسه مش متسطّب) — والسكوت أحسن من «+0 كوين». */}
                {coinsWon > 0 && (
                  <motion.p
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.28 }}
                    className="tag tag-quiet mt-3"
                  >
                    🪙 <span className="ltr-num tnum">+{coinsWon}</span> كوين للمتجر
                  </motion.p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {nextDayId ? (
                  <button
                    onClick={() => router.push(`/lesson/${nextDayId}`)}
                    className="btn btn-marker btn-block text-sm"
                  >
                    الدرس اللي بعده
                  </button>
                ) : (
                  <button onClick={() => router.push("/dashboard")} className="btn btn-marker btn-block text-sm">
                    خلصت الخطة — ارجع للداشبورد
                  </button>
                )}
                <button onClick={() => setShowCelebration(false)} className="btn btn-quiet btn-block text-sm">
                  فضّل هنا شوية
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ⚠️ متعطّل وقت الاحتفال: الودجت بيقعد في نفس رُكن الشاشة اللي
          المودال بيغطّيه، فلو ظهر ورا الطبقة السودة المستخدم يشوف
          نُص إيموجي مقصوص ومايقدرش يضغطه. */}
      <FeedbackWidget page="lesson" featureLabel="صفحة الدرس" enabled={!showCelebration} />
    </div>
    </LessonShell>
  );
}