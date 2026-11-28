"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { IconBadge } from "@/components/ui/IconBadge";
import { Trophy, Brain, Sparkles, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { fetchWorshipQuizLeaderboard, type QuizLeaderboardRow } from "@/lib/worship-data";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ==========================================================================
   QuizGame — لعبة الأسئلة الدينية (مركز العبادات — db/120)
   حالة واحدة بتمشي بكل الصفحات: تحميل → سؤال بسؤال → نتيجة + مسابقات.
   التصحيح كله سيرفري — الكلاينت بيرجّع اختياراته بس.
   ========================================================================== */

interface ApiQuestion {
  question: string;
  options: string[];
  source: string;
}

interface ApiDetail {
  question: string;
  correctIndex: number;
  yourIndex: number;
  source: string;
  explanation: string;
}

type Stage = "loading" | "playing" | "submitting" | "result";

const TOTAL = 10;

export function QuizGame({
  supabase,
  signedIn,
  onCoins,
}: {
  supabase: SupabaseClient;
  signedIn: boolean;
  onCoins: (coins: number) => void;
}) {
  const [stage, setStage] = useState<Stage>("loading");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ApiQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{
    score: number;
    awarded: number;
    details: ApiDetail[];
  } | null>(null);

  const [leaderboard, setLeaderboard] = useState<QuizLeaderboardRow[] | null>(null);
  const [leaderboardState, setLeaderboardState] = useState<"loading" | "ready" | "empty">("loading");

  /** تحميل لوحة الترتيب — فشلها هادئ (مش معتمدة على المكافأة). */
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

  /** جلسة جديدة — generate من السيرفر (بالإجابات الصحيحة محفوظة عنده بس). */
  const startSession = useCallback(async () => {
    setStage("loading");
    setError(null);
    setResult(null);
    setAnswers([]);
    setCurrent(0);
    try {
      const res = await fetch("/api/worship/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const data = (await res.json().catch(() => null)) as
        | { sessionId?: string; questions?: ApiQuestion[]; error?: string | { message?: string } }
        | null;
      if (!res.ok || !data?.sessionId || !Array.isArray(data.questions)) {
        const message =
          typeof data?.error === "string"
            ? data.error
            : data?.error?.message ?? "تعذّر توليد الأسئلة — جرّب تاني.";
        setError(message);
        setStage("result"); // نجيب المستخدم لشاشة فيها زرار إعادة
        return;
      }
      setSessionId(data.sessionId);
      setQuestions(data.questions);
      setStage("playing");
    } catch {
      setError("تعذّر الاتصال بالسيرفر — اتأكد من الشبكة وجرّب تاني.");
      setStage("result");
    }
  }, []);

  /** اختيار إجابة → التالي → آخر سؤال يودّي للتصحيح السيرفري. */
  const chooseAnswer = useCallback(
    async (index: number) => {
      if (stage !== "playing") return;
      const next = [...answers, index];
      setAnswers(next);
      if (next.length < TOTAL) {
        setCurrent(next.length);
        return;
      }
      // آخر إجابة — نسلّم للسيرفر
      setStage("submitting");
      try {
        const res = await fetch("/api/worship/quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "submit", sessionId, answers: next }),
        });
        const data = (await res.json().catch(() => null)) as
          | { score?: number; awarded?: number; details?: ApiDetail[]; error?: string | { message?: string } }
          | null;
        if (!res.ok || typeof data?.score !== "number" || !Array.isArray(data.details)) {
          const message =
            typeof data?.error === "string"
              ? data.error
              : data?.error?.message ?? "تعذّر تسجيل النتيجة — جرّب تاني.";
          setError(message);
          setStage("result");
          return;
        }
        setResult({
          score: data.score,
          awarded: data.awarded ?? 0,
          details: data.details,
        });
        setStage("result");
        if ((data.awarded ?? 0) > 0) onCoins(data.awarded ?? 0);
        void refreshLeaderboard(); // لوحة الترتيب تتحدّث بعد النتيجة
      } catch {
        setError("تعذّر الاتصال بالسيرفر — اتأكد من الشبكة وجرّب تاني.");
        setStage("result");
      }
    },
    [answers, sessionId, stage, onCoins, refreshLeaderboard],
  );

  /* ── زائر — نفس رسالة باقي صفحات العبادة ── */
  if (!signedIn) {
    return (
      <GlassCard className="p-8 text-center">
        <IconBadge icon={Brain} color="text-[#6EE7B7]" bg="bg-[#10B981]/15" className="mx-auto mb-4" size={56} />
        <h2 className="mb-2 text-xl font-bold text-white">سجّل حساب تكسب كوينز</h2>
        <p className="mx-auto max-w-md leading-relaxed text-[#9AA0C0]">
          الأسئلة الدينية والمسابقات متاحة لأصحاب الحسابات — سجّل دخولك واكسب
          كوينز مع كل جلسة مكتملة.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── اللعبة ── */}
      {stage === "loading" && (
        <GlassCard className="p-8 text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[#10B981]/30 border-t-[#10B981]" />
          <p className="text-[#9AA0C0]">بنجهّز أسئلتك…</p>
        </GlassCard>
      )}

      {(stage === "playing" || stage === "submitting") && questions[current] && (
        <GlassCard className="p-6 md:p-8">
          {/* شريط التقدم */}
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-bold text-[#6EE7B7]">
                سؤال <bdi>{current + 1}</bdi> من <bdi>{TOTAL}</bdi>
              </span>
              <span className="text-[#9AA0C0]">📚 {questions[current].source}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-l from-[#10B981] to-[#6EE7B7] transition-all duration-300"
                style={{ width: `${((current + 1) / TOTAL) * 100}%` }}
              />
            </div>
          </div>

          <h2 className="mb-6 text-lg font-bold leading-relaxed text-white md:text-xl">
            {questions[current].question}
          </h2>

          <div className="flex flex-col gap-3">
            {questions[current].options.map((option, i) => (
              <button
                key={i}
                type="button"
                disabled={stage === "submitting"}
                onClick={() => void chooseAnswer(i)}
                className="rounded-2xl border border-white/[0.08] bg-[#0D1029]/60 p-4 text-right text-[#C7CBE6] transition-colors hover:border-[#10B981]/50 hover:bg-[#10B981]/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#10B981]/15 text-xs font-bold text-[#6EE7B7]">
                  {["أ", "ب", "ج", "د"][i] ?? i + 1}
                </span>
                {option}
              </button>
            ))}
          </div>

          {stage === "submitting" && (
            <p className="mt-6 text-center text-sm text-[#9AA0C0]">جاري التصحيح…</p>
          )}
        </GlassCard>
      )}

      {stage === "result" && error && !result && (
        <GlassCard className="p-8 text-center">
          <IconBadge icon={XCircle} color="text-[#FB923C]" bg="bg-[#FB923C]/15" className="mx-auto mb-4" size={56} />
          <h2 className="mb-2 text-xl font-bold text-white">حصلت مشكلة</h2>
          <p className="mb-6 text-[#9AA0C0]">{error}</p>
          <Button onClick={() => void startSession()} icon={RotateCcw}>
            جلسة جديدة
          </Button>
        </GlassCard>
      )}

      {stage === "result" && result && (
        <GlassCard className="p-6 md:p-8" glow>
          {/* النتيجة */}
          <div className="mb-6 text-center">
            <IconBadge icon={result.score >= 7 ? Trophy : Brain} color="text-[#6EE7B7]" bg="bg-[#10B981]/15" className="mx-auto mb-4" size={64} />
            <h2 className="text-2xl font-bold text-white">
              نتيجتك: <bdi>{result.score}/{TOTAL}</bdi>
            </h2>
            <p className="mt-2 text-[#9AA0C0]">
              {result.score === TOTAL
                ? "ماشاء الله — علامة كاملة! 🎉"
                : result.score >= 7
                  ? "نتيجة ممتازة، كمّل كده!"
                  : result.score >= 4
                    ? "حلو — راجع المصادر تحت وحاول تاني."
                    : "بداية طيبة — المصادر تحت هتساعدك المرة الجاية."}
            </p>
            {result.awarded > 0 ? (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#FFD54D]/15 px-4 py-2 text-sm font-bold text-[#FFD54D]">
                <Sparkles size={16} aria-hidden />
                كسبت <bdi>{result.awarded}</bdi> كوينز 🪙
              </p>
            ) : (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-4 py-2 text-sm text-[#9AA0C0]">
                مفيش كوينز إضافية — وصلت للسقف اليومي، جرّب بكرة
              </p>
            )}
          </div>

          {/* تفصيل كل سؤال */}
          <div className="mb-6 flex flex-col gap-3">
            {result.details.map((d, i) => {
              const correct = d.yourIndex === d.correctIndex;
              return (
                <div
                  key={i}
                  className={`rounded-2xl border p-4 ${
                    correct
                      ? "border-[#10B981]/30 bg-[#10B981]/[0.06]"
                      : "border-[#FB923C]/30 bg-[#FB923C]/[0.06]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {correct ? (
                      <CheckCircle2 size={18} className="mt-1 flex-shrink-0 text-[#6EE7B7]" aria-hidden />
                    ) : (
                      <XCircle size={18} className="mt-1 flex-shrink-0 text-[#FB923C]" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-white">{d.question}</p>
                      <p className="mt-1 text-sm text-[#C7CBE6]">
                        الإجابة الصحيحة: {(questions[i]?.options ?? [])[d.correctIndex] ?? "—"}
                      </p>
                      {!correct && (
                        <p className="mt-1 text-sm text-[#9AA0C0]">
                          اخترت: {(questions[i]?.options ?? [])[d.yourIndex] ?? "—"}
                        </p>
                      )}
                      <p className="mt-1 text-sm leading-relaxed text-[#9AA0C0]">{d.explanation}</p>
                      <p className="mt-2 text-xs text-[#6EE7B7]">📚 {d.source}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-center">
            <Button onClick={() => void startSession()} icon={RotateCcw}>
              جلسة جديدة
            </Button>
          </div>
        </GlassCard>
      )}

      {/* ── المسابقات 🏆 — لوحة الترتيب الأسبوعية ── */}
      <GlassCard className="p-6" glow>
        <div className="mb-4 flex items-center gap-3">
          <IconBadge icon={Trophy} color="text-[#FFD54D]" bg="bg-[#FFD54D]/15" />
          <div>
            <h2 className="text-lg font-bold text-white">المسابقات 🏆</h2>
            <p className="text-sm text-[#9AA0C0]">أعلى النتائج في آخر ٧ أيام</p>
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
