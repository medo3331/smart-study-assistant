"use client";

import React from "react";
import { motion } from "framer-motion";
import type { Flashcard, LearningStyle, StudyConfig, StudyDay, ThemeStyles, UiText } from "./types";

interface Chapter {
  chapterNumber: number;
  isComplete: boolean;
  topics: string[];
}

const CHAPTER_SIZE = 5;

// 🔴 نفس الدالتين بتوع الموارد ونطق النمط - نقلناهم هنا لأنهم مش محتاجين أي state
// من بره، بس بياخدوا مدخلات ويرجعوا نتيجة (pure functions)
function getStyleArabicName(style: LearningStyle) {
  switch (style) {
    case "practical":
      return "عملي";
    case "visual":
      return "مرئي";
    case "academic":
      return "أكاديمي";
  }
}

// الإيموجي اتشال من العناوين — السهم ↗ لوحده كفاية يقول إن ده رابط بره.
function getResourcesByStyle(topic: string, subject: string, style: LearningStyle) {
  const query = encodeURIComponent(`${topic} ${subject}`);
  if (style === "visual") {
    return [
      { title: "فيديو شرح", url: `https://www.youtube.com/results?search_query=${query}` },
      { title: "خرائط ذهنية", url: `https://www.google.com/search?tbm=isch&q=${query}+diagram` },
    ];
  } else if (style === "academic") {
    return [
      { title: "ملخصات PDF", url: `https://www.google.com/search?q=${query}+filetype:pdf` },
      { title: "مراجع علمية", url: `https://scholar.google.com/scholar?q=${query}` },
    ];
  }
  return [
    { title: "تمارين وتطبيقات", url: `https://www.google.com/search?q=${query}+practical+exercises` },
    { title: "تطبيق عملي", url: `https://www.youtube.com/results?search_query=${query}+tutorial` },
  ];
}

const STYLE_OPTIONS: { id: LearningStyle; label: string }[] = [
  { id: "practical", label: "عملي" },
  { id: "visual", label: "مرئي" },
  { id: "academic", label: "أكاديمي" },
];

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

const QUIET_BTN =
  "mono px-3 py-2 rounded-[var(--r-sm)] border border-rule bg-paper text-ink-soft hover:text-ink hover:bg-paper-3 transition";

interface StudySectionsProps {
  config: StudyConfig;
  uiText: UiText;
  themeStyles: ThemeStyles;
  isEmergencyMode: boolean;

  // Pomodoro
  showPomodoro: boolean;
  onTogglePomodoro: () => void;
  pomoTime: number;
  isPomoRunning: boolean;
  onTogglePomoRunning: () => void;
  onResetPomo: () => void;

  // تقدم الخطة + تحذير التأخير
  completedCount: number;
  overallProgress: number;
  showLagWarning: boolean;
  daysSinceLastActivity: number | null;
  currentDayNumber: number;

  // قائمة الأيام
  days: StudyDay[];
  earlyUnlockedDays: number[];
  onToggleDayCompletion: (day: number) => void;
  onChangeLessonStyle: (day: number, style: LearningStyle) => void;
  onOpenFullLesson: (dayId: string) => void;
  onOpenAiLesson: (day: StudyDay) => void;
  onAddPlanStep: () => void;
  isAddingPlanStep: boolean;

  // Boss Fight
  chapters: Chapter[];
  onOpenBossFight: (chapterNumber: number) => void;

  // الملاحظات / الفلاش كاردز
  userNote: string;
  onChangeUserNote: (value: string) => void;
  onAddNote: () => void;
  flashcards: Flashcard[];
  onUpdateCardStatus: (id: string, status: "known" | "review") => void;
}

export function StudySections({
  config,
  uiText,
  themeStyles,
  isEmergencyMode,
  showPomodoro,
  onTogglePomodoro,
  pomoTime,
  isPomoRunning,
  onTogglePomoRunning,
  onResetPomo,
  completedCount,
  overallProgress,
  showLagWarning,
  daysSinceLastActivity,
  currentDayNumber,
  days,
  earlyUnlockedDays,
  onToggleDayCompletion,
  onChangeLessonStyle,
  onOpenFullLesson,
  onOpenAiLesson,
  onAddPlanStep,
  isAddingPlanStep,
  chapters,
  onOpenBossFight,
  userNote,
  onChangeUserNote,
  onAddNote,
  flashcards,
  onUpdateCardStatus,
}: StudySectionsProps) {
  return (
    <>
      <div className="space-y-4">
        {/* ---- عنوان القسم ----
            ملحوظة: ضربة الفسفوري مش هنا. الكارت اللي فوق (التركيز الحالي)
            بياخدها، ولو الاتنين خدوها بيبقى فيهم نفس الكلمة معلّمة مرتين
            على بعد ٦٠ بكسل — وده اللي حصل فعلاً في أول تجربة. */}
        <div className="flex flex-wrap justify-between items-end gap-3">
          <div>
            <p className="eyebrow eyebrow-flush mb-2">{uiText.sectionTitle}</p>
            <h2 className="h2">{config.subject}</h2>
          </div>

          <div className="flex items-center gap-2">
            {isEmergencyMode && (
              <span className="tag tag-box bg-red-950 text-red-400">وضع الطوارئ</span>
            )}
            <button onClick={onTogglePomodoro} className={QUIET_BTN}>
              {showPomodoro ? "إخفاء المؤقّت" : "مؤقّت التركيز"}
            </button>
          </div>
        </div>

        {/* ---- تقدم الخطة ---- */}
        <div className="sheet-card p-4 flex items-center gap-5">
          <div className="flex-1 space-y-2">
            <div className="flex justify-between items-baseline gap-3">
              <span className="tag">التقدم الكلي</span>
              <span className="mono text-ink-soft">
                <span className="ltr-num tnum">
                  <span className="font-bold text-ink">{completedCount}</span> / {days.length}
                </span>{" "}
                مكتمل
              </span>
            </div>
            <div className="meter meter-sm">
              <div
                className={`meter-fill meter-fill-shimmer ${themeStyles.accentBg}`}
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>
          <span className="ltr-num font-display font-extrabold text-2xl text-ink shrink-0 tnum leading-none">
            {overallProgress}<span className="text-base text-ink-soft">%</span>
          </span>
        </div>

        {showLagWarning && (
          <div className="notice notice-error">
            <p className="m-0">
              آخر نشاط ليك كان من <span className="font-bold tnum">{daysSinceLastActivity}</span> يوم.
              خطتك مستنياك — كمّل من {uiText.stepPrefix}{" "}
              <span className="font-bold tnum">{currentDayNumber}</span>.
            </p>
          </div>
        )}

        {showPomodoro && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="sheet-card p-4 flex flex-wrap items-center justify-between gap-4"
          >
            <div className="flex items-baseline gap-4">
              <span className="font-mono font-bold text-3xl text-ink tnum leading-none">
                {formatTime(pomoTime)}
              </span>
              <p className="mono text-ink-soft m-0">جلسة تركيز · ٢٥ دقيقة</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onTogglePomoRunning}
                className={`mono px-4 py-2 rounded-[var(--r-sm)] motion-press ${themeStyles.accentBg} text-onmarker hover:opacity-90 transition`}
              >
                {isPomoRunning ? "إيقاف مؤقّت" : "ابدأ"}
              </button>
              <button onClick={onResetPomo} className={QUIET_BTN}>
                إعادة ضبط
              </button>
            </div>
          </motion.div>
        )}

        {/* ---- أوراق الأيام ---- */}
        <div className="grid gap-3">
          {days.map((item) => {
            const isCurrent = item.day === currentDayNumber;
            const isCompleted = item.isCompleted;
            const isLocked = item.day > currentDayNumber && !earlyUnlockedDays.includes(item.day);

            // الهامش الأحمر بيحمل الحالة: صريح = اليوم الحالي، باهت = عادي،
            // رمادي = مقفول. مفيش ألوان خلفية صاخبة، الورقة تفضل ورقة.
            let sheetState = "";
            if (isCurrent && !isCompleted) sheetState = "sheet-card-live";
            else if (isLocked) sheetState = "sheet-card-idle opacity-60";

            return (
              <React.Fragment key={item.day}>
                <div
                  id={`day-${item.day}`}
                  className={`sheet-card ${sheetState} p-5 space-y-4 transition-all ${!isLocked ? "card-interactive" : ""}`}
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">

                      {/* مربّع الإنجاز: مربّع زي خانة الشطب في الملزمة، مش دايرة */}
                      <div className="flex flex-col items-center gap-1.5 shrink-0 w-12">
                        <button
                          onClick={() => onToggleDayCompletion(item.day)}
                          disabled={isLocked}
                          title={
                            isLocked
                              ? "مقفول — خلّص اليوم اللي قبله الأول"
                              : isCompleted
                              ? "إلغاء الإنجاز"
                              : "اضغط لتحديد اليوم كمنجز"
                          }
                          className={`w-10 h-10 rounded-[var(--r-sm)] flex items-center justify-center font-display font-extrabold text-base border-2 transition tnum ${
                            isLocked
                              ? "bg-paper border-rule text-ink-soft cursor-not-allowed"
                              : isCompleted
                              ? "bg-emerald-500 border-emerald-500 text-onmarker hover:opacity-85"
                              : isCurrent
                              ? `${themeStyles.accentBg} border-transparent text-onmarker hover:opacity-85`
                              : "bg-paper border-rule-strong text-ink-soft hover:border-ink-soft hover:text-ink"
                          }`}
                        >
                          {isCompleted ? "✓" : item.day}
                        </button>
                        <span className="mono text-[9px] text-ink-soft text-center leading-tight">
                          {isLocked ? "مقفول" : isCompleted ? "منجز" : "للإنجاز"}
                        </span>
                      </div>

                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* اللافتة دي هادية دايماً: مربّع الرقم اللي جنبها
                              هو اللي بيحمل حالة اليوم، فلو الاتنين اتلوّنوا
                              بيبقى لونين جنب بعض بيقولوا نفس الحاجة. */}
                          <span
                            className={`tag tag-box ${
                              isCompleted ? "bg-emerald-950 text-emerald-400" : "tag-quiet"
                            }`}
                          >
                            {uiText.stepPrefix} {item.day}
                          </span>
                          {isCurrent && !isCompleted && (
                            <span className="tag tag-box border border-redpen text-redpen">الحالي</span>
                          )}
                        </div>

                        <h3 className={`h3 ${isCompleted ? "struck" : ""}`}>{item.topic}</h3>

                        {item.description && (
                          <p className="text-xs text-ink-soft leading-relaxed m-0">{item.description}</p>
                        )}

                        {/* اختيار النمط: نص مونوسبيس، بدل تلات إيموجي.
                            المختار بيتعلّم بالحبر مش بالفسفوري — ده إعداد،
                            مش إشارة لمكانك في الخطة. */}
                        <div className="flex items-center gap-2 pt-1">
                          <span className="tag">النمط</span>
                          <div
                            className={`flex gap-1 bg-paper p-1 rounded-[var(--r-sm)] border border-rule ${
                              isLocked ? "opacity-40 pointer-events-none select-none" : ""
                            }`}
                          >
                            {STYLE_OPTIONS.map((st) => (
                              <button
                                key={st.id}
                                onClick={() => onChangeLessonStyle(item.day, st.id)}
                                disabled={isLocked}
                                className={`mono px-2.5 py-1 rounded-[6px] transition ${
                                  item.learningStyle === st.id
                                    ? "bg-ink text-paper-2"
                                    : "text-ink-soft hover:text-ink"
                                }`}
                              >
                                {st.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* الإجراءات */}
                    <div className="flex flex-wrap items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-rule shrink-0">
                      {item.id && !isLocked && (
                        <button
                          onClick={() => onOpenFullLesson(item.id!)}
                          className={`mono px-3.5 py-2 rounded-[var(--r-sm)] transition motion-press ${
                            isCurrent
                              ? `${themeStyles.accentBg} text-onmarker hover:opacity-90`
                              : "border border-rule-strong text-ink hover:bg-paper-3"
                          }`}
                        >
                          افتح الدرس
                        </button>
                      )}
                      {!isLocked && (
                        <button onClick={() => onOpenAiLesson(item)} className={QUIET_BTN}>
                          {uiText.aiDiscussBtn}
                        </button>
                      )}
                      {isLocked && (
                        <span className="mono text-ink-soft px-3.5 py-2">
                          يفتح بعد {uiText.stepPrefix} {item.day - 1}
                        </span>
                      )}
                    </div>
                  </div>

                  {!isLocked && (
                    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-rule">
                      <span className="tag shrink-0">مصادر {getStyleArabicName(item.learningStyle)}</span>
                      {getResourcesByStyle(item.topic, config.subject, item.learningStyle).map((res, i) => (
                        <a
                          key={i}
                          href={res.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mono px-2.5 py-1 rounded-[var(--r-sm)] bg-paper border border-rule text-ink-soft hover:text-ink hover:border-ink-soft transition"
                        >
                          {res.title} ↗
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* تحدي نهاية الفصل — الأحمر لوحده كفاية يقول إن دي محطة جادة */}
                {item.day % CHAPTER_SIZE === 0 &&
                  chapters.find((c) => c.chapterNumber === item.day / CHAPTER_SIZE)?.isComplete && (
                    <button
                      onClick={() => onOpenBossFight(item.day / CHAPTER_SIZE)}
                      className="btn btn-block bg-red-500 text-ondanger hover:opacity-90 mono"
                    >
                      تحدي نهاية الفصل {item.day / CHAPTER_SIZE}
                    </button>
                  )}
              </React.Fragment>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onAddPlanStep}
          disabled={isAddingPlanStep}
          className="btn btn-quiet btn-block text-sm disabled:opacity-60"
        >
          {isAddingPlanStep ? "بنجهّز الخطوة التالية…" : "＋ أضف خطوة جديدة للخطة"}
        </button>
        <p className="text-center text-xs text-ink-soft m-0">الخطة مفتوحة: أضف خطوة جديدة وقت ما تحتاج، حتى بعد إكمال كل الخطوات.</p>
      </div>

      {/* ---- الملاحظات ---- */}
      <div id="notes" className="sheet-card p-5 space-y-3 scroll-mt-6">
        <div>
          <p className="eyebrow eyebrow-flush mb-1">الملاحظات</p>
          <p className="mono text-ink-soft">مراجعة متباعدة — اكتب اللي عايز تفتكره</p>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={userNote}
            onChange={(e) => onChangeUserNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAddNote()}
            placeholder="اكتب ملاحظة أو عنصر للحفظ السريع…"
            className="field flex-1 min-w-0 text-sm"
          />
          <button
            onClick={onAddNote}
            className={`mono px-4 rounded-[var(--r-sm)] shrink-0 ${themeStyles.accentBg} text-onmarker hover:opacity-90 transition`}
          >
            إضافة
          </button>
        </div>

        {flashcards.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {flashcards.map((card) => (
              <div
                key={card.id}
                className={`p-4 rounded-[var(--r-sm)] border flex flex-col justify-between gap-3 ${
                  card.status === "known"
                    ? "bg-emerald-950 border-emerald-500/35"
                    : card.status === "review"
                    ? "bg-amber-950 border-amber-500/35"
                    : "bg-paper border-rule"
                }`}
              >
                <p className={`text-xs leading-relaxed m-0 ${card.status === "known" ? "struck" : "text-ink"}`}>
                  {card.text}
                </p>
                <div className="flex justify-end gap-2 border-t border-rule pt-2">
                  <button
                    onClick={() => onUpdateCardStatus(card.id, "review")}
                    className="mono text-amber-400 hover:opacity-80 transition"
                  >
                    أراجعها تاني
                  </button>
                  <button
                    onClick={() => onUpdateCardStatus(card.id, "known")}
                    className="mono text-emerald-400 hover:opacity-80 transition"
                  >
                    حفظتها
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
