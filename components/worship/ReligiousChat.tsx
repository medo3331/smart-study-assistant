"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { IconBadge } from "@/components/ui/IconBadge";
import {
  Send,
  RotateCcw,
  Brain,
  MessagesSquare,
  Trophy,
  ListChecks,
} from "lucide-react";
import {
  fetchWorshipQuizLeaderboard,
  type QuizLeaderboardRow,
} from "@/lib/worship-data";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  formatQuizFeedbackMessage,
  formatQuizQuestionMessage,
  formatQuizSummaryMessage,
  loadChatState,
  newMessageId,
  saveChatState,
  type ChatMessage,
} from "@/lib/religious-chat";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ==========================================================================
   ReligiousChat — الشات الديني التفاعلي (صفحة /worship/quiz الجديدة)
   محادثة طبيعية مع مساعد ديني (بيجاوب وبيسأل) + وضع «اختبرني» جوّه الشات:
   سؤال من بنك الأسئلة → المستخدم يجاوب نصاً → تصحيح سيرفري بالمصدر →
   السؤال اللي بعده → بعد ١٠ أسئلة خلاصة + كوينز (عقد db/120/121 سيرفري).
   سجل المحادثة محفوظ محلياً (localStorage) لكل مستخدم + زرار «محادثة جديدة».
   ========================================================================== */

interface ChatQuestion {
  question: string;
  options: string[];
  source: string;
}

interface AskResponse {
  reply?: string;
  error?: string | { message?: string };
}

interface QuizStartResponse {
  sessionId?: string;
  total?: number;
  question?: ChatQuestion;
  error?: string | { message?: string };
}

interface QuizAnswerResponse {
  finished?: boolean;
  correct?: boolean;
  correctText?: string;
  explanation?: string;
  source?: string;
  score?: number;
  total?: number;
  awarded?: number;
  next?: ChatQuestion;
  error?: string | { message?: string };
}

/** جولة «اختبرني» الجارية — السيرفر شايف أسئلتها فالاستئناف بعد التحديث شغّال. */
interface ActiveQuiz {
  sessionId: string;
  asked: number;
}

export function ReligiousChat({
  supabase,
  signedIn,
  userId,
  onCoins,
}: {
  supabase: SupabaseClient;
  signedIn: boolean;
  userId: string | null;
  onCoins: (coins: number) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false); // طلب شغّال (شات أو اختبرني)
  const [quizStarting, setQuizStarting] = useState(false);
  const [quiz, setQuiz] = useState<ActiveQuiz | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** حالة المكافأة والبيانات... — (بدون refs للحفظ: state مكتفي) */

  /* ── لوحة الترتيب الأسبوعية (المسابقات) — فشلها هادئ ── */
  const [leaderboard, setLeaderboard] = useState<QuizLeaderboardRow[] | null>(null);
  const [leaderboardState, setLeaderboardState] = useState<"loading" | "ready" | "empty">("loading");
  const refreshLeaderboard = useCallback(async () => {
    const rows = await fetchWorshipQuizLeaderboard(supabase);
    if (rows && rows.length > 0) {
      setLeaderboard(rows);
      setLeaderboardState("ready");
    } else {
      setLeaderboard(null);
      setLeaderboardState("empty");
    }
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await fetchWorshipQuizLeaderboard(supabase);
      if (cancelled) return;
      if (rows && rows.length > 0) {
        setLeaderboard(rows);
        setLeaderboardState("ready");
      } else {
        setLeaderboard(null);
        setLeaderboardState("empty");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  /* ── تحميل سجل المحادثة محلياً لكل مستخدم ──
     بنعمله أثناء الـ render (نمط React الموصى به لتغيير الحالة مع تغيّر
     prop) بدل effect — عشان مابحصلش render زائد ومافيهاش setState في effect. */
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  if (loadedUserId !== userId) {
    setLoadedUserId(userId);
    if (!userId) {
      setMessages([]);
      setQuiz(null);
    } else {
      const state = loadChatState(userId);
      setMessages(state.messages);
      setQuiz(state.quiz);
    }
  }

  useEffect(() => {
    // بنحفظ بعد اكتمال التحميل فقط — عشان مابنمسحش التاريخ بالغلط.
    if (!userId || loadedUserId !== userId) return;
    saveChatState(userId, { messages, quiz });
  }, [messages, quiz, userId, loadedUserId]);

  /* ── تمرير تلقائي لآخر رسالة ── */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const appendMessage = useCallback((role: ChatMessage["role"], content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: newMessageId(), role, content, ts: Date.now() },
    ]);
  }, []);

  /** نداء موحّد للـ API — يرجّع البيانات أو يرمي برسالة عربية واضحة. */
  const postAction = useCallback(async <T,>(payload: Record<string, unknown>): Promise<T> => {
    const res = await fetch("/api/worship/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: string | { message?: string } }) | null;
    if (!res.ok || !data) {
      const message =
        typeof data?.error === "string"
          ? data.error
          : data?.error?.message ?? "تعذّر الاتصال بالسيرفر — اتأكد من الشبكة وجرّب تاني.";
      throw new Error(message);
    }
    return data;
  }, []);

  /* ── إرسال رسالة شات عادية (أو إجابة «اختبرني» لو الجولة شغّالة) ── */
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    appendMessage("user", text);
    setBusy(true);
    try {
      if (quiz) {
        // إجابة سؤال «اختبرني» — التصحيح سيرفري من الجلسة المحفوظة.
        const data = await postAction<QuizAnswerResponse>({
          action: "quiz-answer",
          sessionId: quiz.sessionId,
          answer: text,
        });
        appendMessage(
          "assistant",
          formatQuizFeedbackMessage({
            correct: Boolean(data.correct),
            yourAnswer: text,
            correctText: data.correctText ?? "—",
            explanation: data.explanation ?? "",
            source: data.source ?? "",
          }),
        );
        if (data.finished) {
          appendMessage(
            "assistant",
            formatQuizSummaryMessage({
              score: data.score ?? 0,
              total: data.total ?? 10,
              awarded: data.awarded ?? 0,
            }),
          );
          setQuiz(null);
          if ((data.awarded ?? 0) > 0) onCoins(data.awarded ?? 0);
          void refreshLeaderboard();
        } else if (data.next) {
          const asked = quiz.asked + 1;
          appendMessage(
            "assistant",
            formatQuizQuestionMessage(data.next, asked, data.total ?? 10),
          );
          setQuiz({ sessionId: quiz.sessionId, asked });
        } else {
          // السيرفر قال «مش خلصنا» من غير سؤال تاني — حالة غير متوقعة، ننهي الجولة محلياً.
          setQuiz(null);
        }
      } else {
        // شات عادي — نبعث آخر سياق المحادثة (السيرفر بيعمل التشذيب النهائي).
        const context = [
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: text },
        ];
        const data = await postAction<AskResponse>({ action: "ask", messages: context });
        appendMessage("assistant", data.reply ?? "…");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "حصل خطأ غير متوقع — جرّب تاني.");
    } finally {
      setBusy(false);
    }
  }, [input, busy, quiz, messages, appendMessage, postAction, onCoins, refreshLeaderboard]);

  /* ── زرار «اختبرني» — أول سؤال من البنك جوّه الشات ── */
  const startQuiz = useCallback(async () => {
    if (quiz || quizStarting || busy) return;
    setQuizStarting(true);
    setError(null);
    try {
      const data = await postAction<QuizStartResponse>({ action: "quiz-start" });
      if (!data.sessionId || !data.question) {
        throw new Error("تعذّر بدء جولة الاختبار — جرّب تاني.");
      }
      appendMessage(
        "assistant",
        `🎯 تمام — جولة «اختبرني»! ${data.total ?? 10} أسئلة، وبعد الخلاصة مكافأة كوينز إن شاء الله.\n\n${formatQuizQuestionMessage(data.question, 1, data.total ?? 10)}`,
      );
      setQuiz({ sessionId: data.sessionId, asked: 1 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "حصل خطأ غير متوقع — جرّب تاني.");
    } finally {
      setQuizStarting(false);
    }
  }, [quiz, quizStarting, busy, postAction, appendMessage]);

  /* ── محادثة جديدة — تمسح السجل المحلي والجولة الجارية ── */
  const resetChat = useCallback(() => {
    if (busy || quizStarting) return;
    setMessages([]);
    setQuiz(null);
    setError(null);
    if (userId) saveChatState(userId, { messages: [], quiz: null });
  }, [busy, quizStarting, userId]);

  /* ── زائر — نفس رسالة باقي صفحات العبادة ── */
  if (!signedIn) {
    return (
      <GlassCard className="p-8 text-center">
        <IconBadge icon={MessagesSquare} color="text-[#6EE7B7]" bg="bg-[#10B981]/15" className="mx-auto mb-4" size={56} />
        <h2 className="mb-2 text-xl font-bold text-white">سجّل حساب وابدأ المحادثة</h2>
        <p className="mx-auto max-w-md leading-relaxed text-[#9AA0C0]">
          الشات الديني ووضع «اختبرني» متاحين لأصحاب الحسابات — سجّل دخولك
          واسأل أي سؤال ديني واكسب كوينز مع كل جولة مكتملة.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── الشات ── */}
      <GlassCard className="flex flex-col overflow-hidden" glow>
        {/* شريط الأدوات */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] p-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={MessagesSquare} color="text-[#6EE7B7]" bg="bg-[#10B981]/15" />
            <div>
              <h2 className="text-lg font-bold text-white">الشات الديني</h2>
              <p className="text-sm text-[#9AA0C0]">اسأل أي سؤال — والإجابات بمصادر موثوقة</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => void startQuiz()}
              icon={ListChecks}
              disabled={Boolean(quiz) || busy || quizStarting}
              loading={quizStarting}
            >
              اختبرني
            </Button>
            <Button onClick={resetChat} icon={RotateCcw} variant="ghost" disabled={busy || quizStarting}>
              محادثة جديدة
            </Button>
          </div>
        </div>

        {/* سجل الرسائل */}
        <div
          ref={scrollRef}
          className="flex max-h-[55vh] min-h-[320px] flex-col gap-3 overflow-y-auto p-4"
          aria-live="polite"
        >
          {messages.length === 0 && !busy && (
            <div className="my-auto flex flex-col items-center gap-3 py-10 text-center">
              <IconBadge icon={Brain} color="text-[#6EE7B7]" bg="bg-[#10B981]/15" size={48} />
              <p className="font-bold text-white">ابدأ المحادثة</p>
              <p className="max-w-sm text-sm leading-relaxed text-[#9AA0C0]">
                اسأل عن آية أو حديث أو عبادة — والمساعد بيجاوب بمصادر موثوقة
                (آيات بأسماء السور وأرقامها، وأحاديث من الصحيحين والكتب الستة).
                ولو حابب تتحدى نفسك، دوس «اختبرني».
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl border p-4 text-sm leading-relaxed md:text-[15px] ${
                m.role === "user"
                  ? "self-end border-[#10B981]/30 bg-[#10B981]/[0.12] text-white"
                  : "self-start border-white/[0.06] bg-[#0D1029]/70 text-[#C7CBE6]"
              }`}
            >
              {m.content}
            </div>
          ))}

          {/* مؤشر الكتابة أثناء انتظار الرد */}
          {busy && (
            <div
              className="flex items-center gap-2 self-start rounded-2xl border border-white/[0.06] bg-[#0D1029]/70 px-4 py-3"
              role="status"
              aria-label="المساعد بيكتب"
            >
              <span className="h-2 w-2 animate-bounce rounded-full bg-[#6EE7B7] [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[#6EE7B7] [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[#6EE7B7] [animation-delay:300ms]" />
            </div>
          )}
        </div>

        {/* خطأ غير متوقع — بانر فوق حقل الإدخال */}
        {error && (
          <p role="alert" className="mx-4 mb-2 rounded-xl border border-[#FB923C]/30 bg-[#FB923C]/[0.08] p-3 text-sm text-[#FB923C]">
            {error}
          </p>
        )}

        {/* حقل الإدخال */}
        <form
          className="flex items-end gap-2 border-t border-white/[0.06] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, CHAT_MESSAGE_MAX_LENGTH))}
            onKeyDown={(e) => {
              // Enter يبعت — Shift+Enter سطر جديد (نمط الشات المعتاد).
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            dir="auto"
            placeholder={quiz ? "اكتب إجابتك…" : "اكتب سؤالك الديني…"}
            disabled={busy}
            aria-label="حقل المحادثة"
            className="max-h-32 min-h-[44px] flex-1 resize-y rounded-2xl border border-white/[0.08] bg-[#0D1029]/60 p-3 text-[15px] text-white placeholder:text-[#9AA0C0] focus:border-[#10B981]/50 focus:outline-none disabled:opacity-50"
          />
          <Button type="submit" icon={Send} disabled={busy || !input.trim()} loading={busy}>
            إرسال
          </Button>
        </form>
      </GlassCard>

      {/* ── المسابقات 🏆 — لوحة الترتيب الأسبوعية (زي ما كانت) ── */}
      <GlassCard className="p-6" glow>
        <div className="mb-4 flex items-center gap-3">
          <IconBadge icon={Trophy} color="text-[#FFD54D]" bg="bg-[#FFD54D]/15" />
          <div>
            <h2 className="text-lg font-bold text-white">المسابقات 🏆</h2>
            <p className="text-sm text-[#9AA0C0]">أعلى نتائج «اختبرني» في آخر ٧ أيام</p>
          </div>
        </div>

        {leaderboardState === "loading" && (
          <p className="text-center text-sm text-[#9AA0C0]">جاري تحميل الترتيب…</p>
        )}

        {leaderboardState === "empty" && (
          <p className="text-center text-sm text-[#9AA0C0]">
            لسه مفيش نتائج الأسبوع ده — كن أول واحد يظهر هنا!
          </p>
        )}

        {leaderboardState === "ready" && leaderboard && (
          <ol className="flex flex-col gap-2">
            {leaderboard.map((row, i) => (
              <li
                key={row.userId}
                className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#0D1029]/60 p-3"
              >
                <span
                  className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                    i === 0
                      ? "bg-[#FFD54D]/20 text-[#FFD54D]"
                      : i === 1
                        ? "bg-white/15 text-[#E0E4F5]"
                        : i === 2
                          ? "bg-[#FB923C]/20 text-[#FB923C]"
                          : "bg-[#10B981]/15 text-[#6EE7B7]"
                  }`}
                >
                  <bdi>{i + 1}</bdi>
                </span>
                <span className="min-w-0 flex-1 truncate font-bold text-white">
                  {row.playerName}
                </span>
                <span className="flex-shrink-0 text-sm font-bold text-[#6EE7B7]">
                  <bdi>{row.bestScore}</bdi> نقطة
                </span>
              </li>
            ))}
          </ol>
        )}
      </GlassCard>
    </div>
  );
}
