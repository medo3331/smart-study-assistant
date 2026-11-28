"use client";

// ===========================================================================
// MAGICLY — Community C16: المسابقات المخصصة (طلاب)
// كويزات بيعملها المشرف/الأدمن — العرض واللعب عبر RPCs (get/submit)
// ===========================================================================

import { useCallback, useEffect, useState } from "react";
import { Loader2, Trophy, X, Sparkles, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type CustomComp = {
  id: string;
  title: string;
  description: string | null;
  emoji: string;
  subject: string | null;
  question_count: number;
  time_limit_seconds: number | null;
  reward_coins: number;
  ends_at: string;
  players: number;
  my_attempt: { score: number; total: number } | null;
};

type PlayQuestion = { q: string; options: string[] };

const COMP_ERR_AR: Record<string, string> = {
  auth_required: "سجّل حسابك الأول عشان تلعب.",
  restricted: "حسابك مقيّد إشرافيًا حاليًا — مينفعش تشارك في المسابقات.",
  not_active: "المسابقة دي مش شغالة دلوقتي.",
  already_played: "لعبت المسابقة دي قبل كده — محاولة واحدة لكل مسابقة.",
  empty: "المسابقة فاضية.",
};

export default function CustomCompetitions() {
  const [comps, setComps] = useState<CustomComp[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  // حالة اللعب
  const [playing, setPlaying] = useState<{ id: string; title: string; emoji: string; questions: PlayQuestion[]; timeLimit: number | null } | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number; coins: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("active_community_competitions");
      const payload = (data ?? {}) as { ok?: boolean; competitions?: CustomComp[] };
      if (error || payload.ok !== true) setComps([]);
      else setComps(payload.competitions ?? []);
    } catch {
      setComps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startPlay = async (comp: CustomComp) => {
    setNote(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_competition_questions", { p_id: comp.id });
    const payload = (data ?? {}) as { ok?: boolean; code?: string; title?: string; emoji?: string; time_limit_seconds?: number | null; questions?: PlayQuestion[] };
    if (error || payload.ok !== true) {
      setNote(COMP_ERR_AR[payload.code ?? ""] ?? "المسابقة مش متاحة حاليًا.");
      return;
    }
    setPlaying({
      id: comp.id,
      title: payload.title ?? comp.title,
      emoji: payload.emoji ?? comp.emoji,
      questions: payload.questions ?? [],
      timeLimit: payload.time_limit_seconds ?? null,
    });
    setQIndex(0);
    setAnswers(new Array((payload.questions ?? []).length).fill(-1));
    setResult(null);
  };

  const pick = (optionIndex: number) => {
    setAnswers((prev) => prev.map((a, i) => (i === qIndex ? optionIndex : a)));
  };

  const submit = async () => {
    if (!playing || submitting) return;
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("submit_competition_attempt", {
        p_competition_id: playing.id,
        p_answers: answers,
      });
      const payload = (data ?? {}) as { ok?: boolean; code?: string; score?: number; total?: number; coins_awarded?: number };
      if (error || payload.ok !== true) {
        setNote(COMP_ERR_AR[payload.code ?? ""] ?? "التسجيل فشل — حاول تاني.");
      } else {
        setResult({ score: payload.score ?? 0, total: payload.total ?? 0, coins: payload.coins_awarded ?? 0 });
        void load();
      }
      setPlaying(null);
    } catch {
      setNote("مشكلة شبكة — حاول تاني.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-ink-soft text-center py-8">
        <Loader2 className="ml-1 inline h-4 w-4 animate-spin" /> بيحمّل مسابقات المجتمع…
      </p>
    );
  }

  if (comps.length === 0 && !note) {
    return (
      <div className="notice">
        <p className="m-0 text-[13px] leading-relaxed">
          مفيش مسابقات مخصصة شغالة دلوقتي — أول ما الإشراف ينزل مسابقة هتظهر هنا 🏆
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {note ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 m-0" role="status">{note}</p>
      ) : null}

      {result ? (
        <div className="sheet-card p-5 space-y-2 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="h3 m-0">نتيجتك: <span className="ltr-num tnum">{result.score}</span> / <span className="ltr-num tnum">{result.total}</span></p>
          {result.coins > 0 ? (
            <p className="text-sm text-ink-soft m-0">🎉 كسبت <span className="ltr-num tnum font-bold text-ink">{result.coins}</span> كوين — اتضافت لمحفظتك!</p>
          ) : (
            <p className="text-xs text-ink-soft m-0">نجح في المسابقة الجاية بـ ٦٠٪+ يكسب ٥٠ كوين 🪙</p>
          )}
          <button onClick={() => setResult(null)} className="btn btn-quiet text-sm mt-2">تمام</button>
        </div>
      ) : null}

      {comps.map((c) => {
        const played = c.my_attempt !== null;
        return (
          <div key={c.id} className="sheet-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{c.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink m-0 truncate">{c.title}</p>
                {c.subject ? <p className="tag m-0">{c.subject}</p> : null}
              </div>
              <span className="mono tnum ltr-num text-xs text-ink-soft shrink-0">👥 {c.players}</span>
            </div>
            {c.description ? <p className="text-xs text-ink-soft leading-relaxed m-0">{c.description}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <span className="tag">🎯 {c.question_count} أسئلة</span>
              <span className="tag">🪙 {c.reward_coins} كوين</span>
              <span className="tag">⏳ لحد {new Date(c.ends_at).toLocaleDateString("ar-EG")}</span>
              {c.time_limit_seconds ? <span className="tag">⏱️ {Math.round(c.time_limit_seconds / 60)} دقيقة</span> : null}
            </div>
            {played && c.my_attempt ? (
              <p className="text-xs text-emerald-700 font-bold m-0">
                لعبتها — نتيجتك: <span className="ltr-num tnum">{c.my_attempt.score}</span> / <span className="ltr-num tnum">{c.my_attempt.total}</span>
              </p>
            ) : (
              <button onClick={() => void startPlay(c)} className="btn btn-marker btn-block text-sm">
                <Trophy className="h-4 w-4" /> العب المسابقة
              </button>
            )}
          </div>
        );
      })}

      {/* نافذة اللعب */}
      {playing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl bg-paper p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">{playing.emoji}</span>
              <p className="font-bold text-ink m-0 flex-1 truncate">{playing.title}</p>
              <button
                onClick={() => setPlaying(null)}
                className="text-ink-soft hover:text-ink" aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="tag mb-2">سؤال {qIndex + 1} من {playing.questions.length}</p>
            <p className="text-sm font-bold text-ink leading-relaxed mb-3">{playing.questions[qIndex]?.q}</p>

            <div className="space-y-2">
              {(playing.questions[qIndex]?.options ?? []).map((opt, oi) => (
                <button
                  key={oi}
                  onClick={() => pick(oi)}
                  aria-pressed={answers[qIndex] === oi}
                  className={`w-full rounded-xl border px-3 py-2.5 text-start text-sm transition ${
                    answers[qIndex] === oi
                      ? "border-marker bg-marker/10 font-bold text-ink"
                      : "border-rule bg-paper-2 text-ink-soft hover:border-marker/50"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              {qIndex > 0 ? (
                <button onClick={() => setQIndex((i) => i - 1)} className="btn btn-quiet text-sm flex-1">السابق</button>
              ) : null}
              {qIndex < playing.questions.length - 1 ? (
                <button onClick={() => setQIndex((i) => i + 1)} className="btn btn-ink btn-block text-sm flex-1">التالي</button>
              ) : (
                <button
                  onClick={() => void submit()}
                  disabled={submitting || answers.every((a) => a === -1)}
                  className="btn btn-marker btn-block text-sm flex-1 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} تسليم
                </button>
              )}
            </div>
            <p className="mono text-[11px] text-ink-soft text-center mt-2 m-0">
              {answers.filter((a) => a !== -1).length} من {playing.questions.length} متجاوب عليه
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
