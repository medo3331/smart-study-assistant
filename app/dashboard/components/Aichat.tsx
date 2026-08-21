"use client";

import React, { useEffect, useRef, useState } from "react";
import { PERSONA_NAME } from "@/lib/persona";
import { prepareFileForUpload, isImageFile } from "@/lib/image-compress";
import { MicButton } from "@/components/MicButton";
import { ReadAloud } from "@/components/ReadAloud";
import { detectExamIntent, type ExamIntent } from "@/lib/exam-intent";
import { ExamPlanChatCard } from "./ExamPlanChatCard";
import type { StudyConfig, StudyDay, ThemeStyles } from "./types";

// أزرار الترويسة: نص مونوسبيس بدل إيموجي — نفس منطق باقي الداشبورد
const ICON_BTN =
  "mono text-ink-soft hover:text-ink hover:bg-paper-3 px-2 py-1.5 rounded-[6px] transition";

interface ChatMessage {
  sender: "user" | "ai";
  text: string;
  timestamp: number;
}

interface AttachedFile {
  name: string;
  content: string;
  truncated: boolean;
}

const TEXT_FILE_TYPES = ["text/plain", "text/markdown", "text/csv", "application/json"];
const MAX_FILE_CHARS = 6000;

type StudyMode = "explain" | "quiz" | "summarize" | "review" | "file" | "flashcards";

const STUDY_ACTIONS: Array<{ mode: StudyMode; label: string; prompt: string }> = [
  { mode: "explain", label: "اشرحلي", prompt: "اشرحلي الجزء ده ببساطة وبمثال." },
  { mode: "quiz", label: "اختبرني", prompt: "اختبرني سؤال سؤال في المحتوى ده." },
  { mode: "flashcards", label: "اعمل Flashcards", prompt: "اعمللي Flashcards من المحتوى ده." },
  { mode: "summarize", label: "لخصلي", prompt: "لخصلي أهم أفكار المحتوى ده." },
];

const MODE_CHOICES: Array<{ mode: StudyMode; label: string; needsFile?: boolean }> = [
  { mode: "explain", label: "اشرحلي" },
  { mode: "quiz", label: "اختبرني" },
  { mode: "summarize", label: "لخصلي" },
  { mode: "review", label: "راجعلي" },
  { mode: "file", label: "اسألني عن الملف", needsFile: true },
];

function formatMessageTime(timestamp: number) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

interface AiChatModalProps {
  activeAiLesson: StudyDay | null;
  onClose: () => void;
  onSwitchLesson: (day: StudyDay) => void;
  days: StudyDay[];
  configId: string | null;
  config: StudyConfig;
  themeStyles: ThemeStyles;
  /** بيتنده بعد ما خطة امتحان تتحفظ من جوه الشات. */
  onExamPlanSaved?: () => void;
}

export function AiChatModal({ activeAiLesson, onClose, onSwitchLesson, days, configId, config, themeStyles, onExamPlanSaved }: AiChatModalProps) {
  // 🔴 كل الـ state بتاع المحادثة عايش هنا جوه الكومبوننت نفسه
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const [studyMode, setStudyMode] = useState<StudyMode>("explain");
  const [showChatHistoryList, setShowChatHistoryList] = useState(false);
  /**
   * نية الامتحان اللي اتلقطت من آخر رسالة.
   *
   * لو مش null، الكارت بيظهر تحت المحادثة. بيترجّع null لما المستخدم
   * يقول «مش دلوقتي» أو يبعت رسالة جديدة عادية.
   */
  const [pendingExam, setPendingExam] = useState<{ intent: ExamIntent; sourceText: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ✅ تحميل محادثة اليوم الحالي لما المودال يفتح أو يتغير الدرس
  useEffect(() => {
    if (activeAiLesson && configId) {
      const key = `chat_${configId}_${activeAiLesson.day}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          setChatMessages(JSON.parse(saved));
        } catch {
          setChatMessages([]);
        }
      } else {
        setChatMessages([]);
      }
    }
  }, [activeAiLesson, configId]);

  // ✅ حفظ المحادثة أول ما تتغير
  useEffect(() => {
    if (activeAiLesson && configId) {
      const key = `chat_${configId}_${activeAiLesson.day}`;
      localStorage.setItem(key, JSON.stringify(chatMessages));
    }
  }, [chatMessages, activeAiLesson, configId]);

  if (!activeAiLesson) return null;

  const getChatHistoryDays = (): { day: number; topic: string; lastMessage: string; lastTimestamp: number }[] => {
    if (typeof window === "undefined" || !configId) return [];
    const result: { day: number; topic: string; lastMessage: string; lastTimestamp: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`chat_${configId}_`)) continue;
      const dayNum = parseInt(key.replace(`chat_${configId}_`, ""), 10);
      if (isNaN(dayNum)) continue;
      try {
        const saved = JSON.parse(localStorage.getItem(key) || "[]");
        if (Array.isArray(saved) && saved.length > 0) {
          const last = saved[saved.length - 1];
          const dayInfo = days.find((d) => d.day === dayNum);
          result.push({
            day: dayNum,
            topic: dayInfo?.topic || `اليوم ${dayNum}`,
            lastMessage: last.text,
            lastTimestamp: last.timestamp || 0,
          });
        }
      } catch {
        /* ignore */
      }
    }
    return result.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  };

  const handleClearChat = () => {
    if (!activeAiLesson || !configId) return;
    if (!confirm("متأكد إنك عايز تمسح المحادثة دي؟ الخطوة دي لا يمكن التراجع عنها.")) return;
    setChatMessages([]);
    localStorage.removeItem(`chat_${configId}_${activeAiLesson.day}`);
  };

  const handleRemoveAttachedFile = () => setAttachedFile(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = isImageFile(file);

    // الصور ليها سقف أعلى هنا لأنها بتتصغّر تحت في المتصفح قبل الرفع؛
    // باقي الملفات بتترفع زي ما هي فبتفضل على سقف السيرفر
    const clientMax = isImage ? 20 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size > clientMax) {
      alert(
        isImage
          ? "الصورة كبيرة جداً. خد سكرين شوت للجزء المهم بس أو صغّرها الأول."
          : "حجم الملف كبير أوي، أقصى حجم مسموح ٨ ميجا."
      );
      e.target.value = "";
      return;
    }

    const isTextType = TEXT_FILE_TYPES.includes(file.type) || /\.(txt|md|csv|json)$/i.test(file.name);

    if (isTextType) {
      const reader = new FileReader();
      reader.onload = () => {
        const rawText = (reader.result as string) || "";
        const truncated = rawText.length > MAX_FILE_CHARS;
        setAttachedFile({
          name: file.name,
          content: truncated ? rawText.slice(0, MAX_FILE_CHARS) : rawText,
          truncated,
        });
      };
      reader.readAsText(file);
    } else {
      setIsAnalyzingFile(true);
      try {
        // الصور بتتصغّر قبل الرفع عشان سقف الـ ١ ميجا بتاع خدمة القراءة
        const prepared = await prepareFileForUpload(file);
        if (prepared.error) throw new Error(prepared.error);

        const formData = new FormData();
        formData.append("file", prepared.file);
        const response = await fetch("/api/analyze-file", { method: "POST", body: formData });

        const data = await response.json().catch(() => null);

        // السيرفر بيرجّع سبب الفشل بالتفصيل في data.error —
        // الكود القديم كان بيبلعه ويحل مكانه نص ثابت غلط
        if (!response.ok) {
          throw new Error(data?.error || "مقدرتش أحلل الملف ده. جرّب تاني.");
        }

        const text = (data?.text || "").trim();
        if (!text) throw new Error("مفيش نص اتقرا من الملف ده.");

        setAttachedFile({ name: file.name, content: text, truncated: false });
      } catch (err) {
        console.error("File analysis failed:", err);
        alert(err instanceof Error ? err.message : "مقدرتش أحلل الملف ده. جرّب تاني.");
      } finally {
        setIsAnalyzingFile(false);
      }
    }
    e.target.value = "";
  };

  const handleSendMessageToGroq = async () => {
    if ((!userInput.trim() && !attachedFile) || isAiLoading) return;
    const userText = userInput.trim();

    /* ----------------------------------------------------------------------
       اعتراض نية الامتحان — قبل أي حاجة تروح للموديل

       ⚠️ الترتيب هنا مقصود: الكشف بيحصل **قبل** استدعاء /api/chat مش
       بعده. لو سيبنا الرسالة تروح للموديل الأول، الموديل هيرد رد عام
       («ذاكر كويس وبالتوفيق») وبعدين يظهر الكارت تحته — فالمستخدم يقرا
       ردين متناقضين لنفس السؤال.

       والمرفقات بتوقف الاعتراض: لو المستخدم رافع ملف ومكتوب معاه
       «امتحاني بعد ٣ أيام»، هو عايز الملف يتشرح مش خطة.
       ---------------------------------------------------------------------- */
    if (!attachedFile && userText) {
      const intent = detectExamIntent(userText);
      if (intent) {
        setChatMessages((prev) => [
          ...prev,
          { sender: "user", text: userText, timestamp: Date.now() },
          { sender: "ai", text: "تمام. هعملك خطة.", timestamp: Date.now() + 1 },
        ]);
        setUserInput("");
        setPendingExam({ intent, sourceText: userText });
        return;
      }
    }

    // رسالة عادية = الكارت القديم خلاص لازمته خلصت
    setPendingExam(null);

    const displayText = attachedFile
      ? `مرفق: ${attachedFile.name}${userText ? `\n${userText}` : "\nلخّصلي/اشرحلي الملف ده."}`
      : userText;

    const fullContentForAi = attachedFile
      ? `ملف مرفق: ${attachedFile.name}${attachedFile.truncated ? " (تم اقتطاع جزء منه لطوله)" : ""}\n\n--- محتوى الملف ---\n${attachedFile.content}\n--- نهاية الملف ---\n\n${userText || "لخّصلي المحتوى ده واشرحه بأسلوب واضح ومنظم."}`
      : userText;

    const updatedMessages = [...chatMessages, { sender: "user" as const, text: displayText, timestamp: Date.now() }];
    setChatMessages(updatedMessages);
    setUserInput("");
    setAttachedFile(null);
    setIsAiLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: attachedFile ? "file" : studyMode,
          context: {
            configId,
            lessonDay: activeAiLesson.day,
            subject: config?.subject,
            lesson: activeAiLesson.topic,
            learningStyle: activeAiLesson.learningStyle,
          },
          messages: [
            ...updatedMessages.slice(0, -1).map((m) => ({ role: m.sender === "user" ? "user" : "assistant", content: m.text })),
            { role: "user", content: fullContentForAi },
          ],
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "خطأ في الاتصال");

      const aiReply = data?.choices?.[0]?.message?.content || "لم يتم استقبال رد.";
      setChatMessages([...updatedMessages, { sender: "ai", text: aiReply, timestamp: Date.now() }]);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "حدث خطأ غير معروف";
      setChatMessages([...updatedMessages, { sender: "ai", text: `خطأ: ${errorMsg}`, timestamp: Date.now() }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleCloseModal = () => {
    onClose();
    setShowChatHistoryList(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-blur-sm p-4">
      {/* 📓 المحادثة بقت "كرّاسة أسئلة": كل رسالة سطر في نص مكتوب،
          عليه لافتة مونوسبيس باسم اللي بيتكلم — مش فقاعات بأفاتار إيموجي. */}
      <div className="sheet-card card-lift relative w-full max-w-lg h-[85vh] flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 border-b border-rule bg-paper">
          <div className="flex items-center gap-3 min-w-0">
            {/* نفس مونوجرام ماجيك اللي في كارت المدرّب — عشان يتعرف عليه فوراً */}
            <div className="w-10 h-10 rounded-[var(--r-sm)] bg-emerald-500 text-onmarker flex items-center justify-center shrink-0" aria-hidden>
              <span className="font-display font-extrabold text-xl leading-none">{PERSONA_NAME.charAt(0)}</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-ink truncate">{PERSONA_NAME}</h3>
              <p className="tag truncate">{activeAiLesson.topic}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowChatHistoryList((v) => !v)}
              aria-pressed={showChatHistoryList}
              className={`${ICON_BTN} ${showChatHistoryList ? "bg-ink text-paper-2 hover:text-paper-2" : ""}`}
            >
              المحادثات
            </button>
            <button onClick={handleClearChat} className={`${ICON_BTN} hover:text-red-500`}>
              مسح
            </button>
            <button onClick={handleCloseModal} aria-label="إغلاق" className={ICON_BTN}>
              ✕
            </button>
          </div>
        </div>

        {showChatHistoryList && (
          <div className="absolute inset-x-0 top-[73px] bottom-0 z-10 bg-paper-2 p-4 flex flex-col">
            <p className="tag mb-3">المحادثات السابقة</p>
            <div className="flex-1 overflow-y-auto space-y-2">
              {getChatHistoryDays().length === 0 ? (
                <p className="text-xs text-ink-soft text-center py-10">مفيش محادثات محفوظة لسه.</p>
              ) : (
                getChatHistoryDays().map((entry) => (
                  <button
                    key={entry.day}
                    onClick={() => {
                      const found = days.find((d) => d.day === entry.day);
                      if (found) onSwitchLesson(found);
                      setShowChatHistoryList(false);
                    }}
                    aria-current={entry.day === activeAiLesson.day}
                    className={`w-full text-right p-3 rounded-[var(--r-sm)] border transition ${
                      entry.day === activeAiLesson.day
                        ? "border-ink bg-paper-3"
                        : "bg-paper border-rule hover:border-rule-strong"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-ink truncate">{entry.topic}</span>
                      <span className="mono ltr-num shrink-0">{formatMessageTime(entry.lastTimestamp)}</span>
                    </div>
                    <p className="text-[11px] text-ink-soft truncate mt-1">{entry.lastMessage}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {chatMessages.length === 0 && (
            <div className="py-10 px-2 max-w-xs mx-auto text-center space-y-3">
              <p className="tag justify-center">ورقة فاضية</p>
              <p className="text-xs text-ink-soft leading-relaxed">
                اسأل أي حاجة عن الدرس ده، أو ارفع ملف وهلخّصهولك واشرحه بالنمط اللي مختاره.
              </p>
              {/* ⚠️ الاقتراح ده هو كل التعريف بميزة خطة الامتحان. من غيره
                  محدش هيعرف إن الشات بيفهم «عندي امتحان بعد ٣ أيام» —
                  ميزة مخفية = ميزة مش موجودة. */}
              <button
                onClick={() => setUserInput("عندي امتحان بعد ٣ أيام")}
                className="mono text-ink-soft hover:text-ink border border-rule hover:border-rule-strong rounded-[var(--r-sm)] px-2.5 py-1.5 transition"
              >
                أو قوللي «عندي امتحان بعد ٣ أيام»
              </button>
            </div>
          )}

          {chatMessages.map((msg, index) => {
            const isUser = msg.sender === "user";
            // القراءة بتظهر على آخر رد بس. لو ظهرت على كل رد، الشات
            // بيبقى ليستة زراير وضربة السرعة بتتكرر أربع مرات في الشاشة.
            const isLastAi = !isUser && index === chatMessages.length - 1;
            return (
              <div key={index} className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                <p className="tag mb-1">
                  {isUser ? "أنت" : PERSONA_NAME}
                  <span className="ltr-num">{formatMessageTime(msg.timestamp)}</span>
                </p>
                <div
                  className={`max-w-[85%] p-3 rounded-[var(--r-sm)] border text-xs leading-relaxed whitespace-pre-wrap text-ink ${
                    isUser
                      ? "bg-paper-3 border-rule-strong"
                      : "bg-paper border-rule border-s-[3px] border-s-redpen"
                  }`}
                >
                  {msg.text}
                </div>
                {isLastAi && (
                  <ReadAloud text={msg.text} resetKey={msg.timestamp} className="mt-2" />
                )}
              </div>
            );
          })}

          {/* كارت الخطة: UI مؤقت جوه المحادثة. النسخة النصية بتتحفظ
              في التاريخ من onSaved، الكارت نفسه لأ. */}
          {pendingExam && (
            <div className="flex flex-col items-start">
              <ExamPlanChatCard
                intent={pendingExam.intent}
                sourceText={pendingExam.sourceText}
                themeStyles={themeStyles}
                fallbackSubject={config?.subject}
                onSaved={(summary) => {
                  setChatMessages((prev) => [
                    ...prev,
                    { sender: "ai", text: summary, timestamp: Date.now() },
                  ]);
                  onExamPlanSaved?.();
                }}
                onDismiss={() => setPendingExam(null)}
              />
            </div>
          )}

          {isAiLoading && (
            <div className="flex flex-col items-start">
              <p className="tag mb-1">{PERSONA_NAME}</p>
              <div className="bg-paper border border-rule border-s-[3px] border-s-redpen rounded-[var(--r-sm)] px-4 py-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-ink-soft rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-ink-soft rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-ink-soft rounded-full animate-bounce" />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-rule bg-paper p-3 space-y-2">
          {attachedFile && (
            <div className="flex items-center justify-between bg-paper-2 border border-rule rounded-[var(--r-sm)] px-3 py-2 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="tag shrink-0">مرفق</span>
                <span className="text-[11px] text-ink truncate">{attachedFile.name}</span>
                {attachedFile.truncated && <span className="mono shrink-0">مقتطع</span>}
              </div>
              <button
                onClick={handleRemoveAttachedFile}
                aria-label="إزالة الملف"
                className="mono text-ink-soft hover:text-red-500 shrink-0"
              >
                ✕
              </button>
            </div>
          )}
          {isAnalyzingFile && (
            <div className="mono flex items-center gap-2 px-1">
              <span className="w-3 h-3 border-2 border-rule-strong border-t-transparent rounded-full animate-spin" />
              بيحلّل الملف…
            </div>
          )}
          {/* اختصارات الجلسة بتظهر بعد المرفق عشان التحليل يتحول فورًا
              لمذاكرة، مش مجرد نص اتقرا وانتهى. */}
          {attachedFile && !isAnalyzingFile && (
            <div className="flex flex-wrap gap-1.5" aria-label="اقتراحات للمذاكرة من الملف">
              {STUDY_ACTIONS.map((action) => (
                <button
                  key={action.mode}
                  type="button"
                  onClick={() => {
                    setStudyMode(action.mode);
                    setUserInput(action.prompt);
                  }}
                  className={`text-[11px] rounded-full border px-2.5 py-1 transition ${
                    studyMode === action.mode
                      ? "bg-paper-3 border-rule-strong text-ink"
                      : "bg-paper-2 border-rule text-ink-soft hover:text-ink hover:border-rule-strong"
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="وضع المذاكرة">
            {MODE_CHOICES.map((choice) => {
              const disabled = Boolean(choice.needsFile && !attachedFile);
              return (
                <button
                  key={choice.mode}
                  type="button"
                  disabled={disabled}
                  aria-pressed={studyMode === choice.mode}
                  onClick={() => setStudyMode(choice.mode)}
                  className={`shrink-0 text-[11px] rounded-full border px-2.5 py-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    studyMode === choice.mode
                      ? "bg-paper-3 border-rule-strong text-ink"
                      : "bg-paper-2 border-rule text-ink-soft hover:text-ink hover:border-rule-strong"
                  }`}
                >
                  {choice.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            {/* .doc القديم مش مدعوم في السيرفر (mammoth بيقرا .docx بس) فمشيلناه من القايمة */}
            <input ref={fileInputRef} type="file" accept=".txt,.md,.csv,.json,.pdf,.docx,image/*" onChange={handleFileSelect} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isAnalyzingFile}
              className="mono bg-paper-2 hover:bg-paper-3 border border-rule text-ink-soft hover:text-ink px-3 h-10 rounded-[var(--r-sm)] flex items-center justify-center shrink-0 transition disabled:opacity-40"
            >
              ملف
            </button>
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessageToGroq()}
              placeholder="اكتب سؤالك هنا…"
              className="flex-1 bg-paper-2 border border-rule rounded-[var(--r-sm)] px-3 py-2 text-xs text-ink placeholder:text-ink-soft focus:outline-none focus:border-rule-strong"
            />
            {/* المايك بيملا الحقل بس — الإرسال بيفضل بإيد المستخدم عشان
                يراجع النص، والمرفقات مالهاش لازمة تتبعت بالغلط. */}
            <MicButton onText={setUserInput} disabled={isAiLoading} variant="square" />
            {/* السهم لليسار لأن ده اتجاه "قدّام" في نص عربي */}
            <button
              onClick={handleSendMessageToGroq}
              disabled={isAiLoading || (!userInput.trim() && !attachedFile)}
              aria-label="إرسال"
              className={`${themeStyles.accentBg} disabled:opacity-40 disabled:cursor-not-allowed text-onmarker font-bold w-10 h-10 rounded-[var(--r-sm)] text-sm shrink-0 transition hover:opacity-90`}
            >
              ←
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
