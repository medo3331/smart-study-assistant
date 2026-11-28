// ===========================================================================
// MAGICLY — Community C16: بانى المسابقات المخصصة
// ---------------------------------------------------------------------------
// الأدمن/المشرف بيعمل مسابقة كويز بنفسه: عنوان + أسئلة (يدوي أو بتوليد Magic AI)
// والطلاب بيلعبوها من /community/competitions
// ===========================================================================

"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Sparkles, Trophy, Play, Square, RotateCcw } from "lucide-react";

type GenQuestion = { q: string; options: string[]; correct: number };
type Competition = {
  id: string; title: string; description: string | null; emoji: string;
  subject: string | null; questions: GenQuestion[];
  time_limit_seconds: number | null; ends_at: string; status: string;
  players: number; winners: number;
};

export default function QuizBuilderClient() {
  const [comps, setComps] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // نموذج الإنشاء
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🏆");
  const [subject, setSubject] = useState("");
  const [days, setDays] = useState("7");
  const [questions, setQuestions] = useState<GenQuestion[]>([
    { q: "", options: ["", "", "", ""], correct: 0 },
  ]);
  // توليد Magic AI
  const [genTopic, setGenTopic] = useState("");
  const [genCount, setGenCount] = useState("5");
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/community/quiz-builder", { cache: "no-store" });
      const d = await res.json();
      if (d.success) setComps(d.competitions ?? []);
      else setError(d.error || "فشل تحميل المسابقات.");
    } catch {
      setError("مشكلة شبكة.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const generate = async () => {
    if (genTopic.trim().length < 3) { setError("اكتب موضوع المسابقة أولًا."); return; }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/community/quiz-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", topic: genTopic, count: Number(genCount) || 5 }),
      });
      const d = await res.json();
      if (d.success && Array.isArray(d.questions)) {
        setQuestions(d.questions as GenQuestion[]);
        setNotice(`ولّد المساعد ${d.questions.length} سؤال — راجعهم وعدّل الإجابات الصحيحة قبل النشر.`);
      } else {
        setError(d.error || "التوليد فشل.");
      }
    } catch {
      setError("مشكلة شبكة — حاول تاني.");
    } finally {
      setGenerating(false);
    }
  };

  const create = async () => {
    if (busy) return;
    setBusy("create");
    setError(null);
    try {
      const res = await fetch("/api/admin/community/quiz-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title, description, emoji, subject,
          days: Number(days) || 7,
          questions,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setNotice("المسابقة نزلت وهي شغالة — الطلاب يلاقيوها في تاب المسابقات.");
        setTitle(""); setDescription(""); setSubject("");
        setQuestions([{ q: "", options: ["", "", "", ""], correct: 0 }]);
        void load();
      } else {
        setError(d.error || "الإنشاء فشل.");
      }
    } catch {
      setError("مشكلة شبكة.");
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (id: string, status: "active" | "ended") => {
    const ok = await fetch("/api/admin/community/quiz-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_status", id, status }),
    }).then((r) => r.json()).then((d) => d.success === true).catch(() => false);
    if (ok) void load();
  };

  const updateQ = (i: number, patch: Partial<GenQuestion>) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const updateOpt = (qi: number, oi: number, value: string) =>
    setQuestions((qs) =>
      qs.map((q, idx) => (idx === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) } : q)),
    );

  const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400";

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ إنشاء مسابقة */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Trophy className="h-4 w-4 text-amber-500" /> مسابقة كويز جديدة
        </h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">
          المكافأة ٥٠ كوين للنجاح ٦٠٪+ (مرتين في اليوم كحد أقصى للطالب). التصحيح بيحصل على السيرفر.
        </p>

        <div className="mb-3 grid gap-2 sm:grid-cols-4">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان المسابقة *" className={`${inputCls} sm:col-span-2`} />
          <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🏆" className={inputCls} />
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="المادة (اختياري)" className={inputCls} />
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف قصير (اختياري)" className={`${inputCls} sm:col-span-2`} />
          <label className="text-xs text-slate-500">
            المدة (أيام)
            <input type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} className={inputCls} />
          </label>
        </div>

        {/* توليد Magic AI */}
        <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-violet-700">
            <Sparkles className="h-3.5 w-3.5" /> Magic AI يولّد الأسئلة
          </p>
          <div className="flex flex-wrap gap-2">
            <input value={genTopic} onChange={(e) => setGenTopic(e.target.value)} placeholder="موضوع الأسئلة — مثال: تفاضل وتكامل، تاريخ مصر القديمة…" className={`${inputCls} max-w-md flex-1`} />
            <select value={genCount} onChange={(e) => setGenCount(e.target.value)} className={`${inputCls} w-24`} aria-label="عدد الأسئلة">
              {[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n} أسئلة</option>)}
            </select>
            <button
              onClick={() => void generate()}
              disabled={generating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} توليد
            </button>
          </div>
        </div>

        {/* محرر الأسئلة */}
        <div className="space-y-3">
          {questions.map((q, qi) => (
            <div key={qi} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">سؤال {qi + 1}</span>
                {questions.length > 1 ? (
                  <button
                    onClick={() => setQuestions((qs) => qs.filter((_, idx) => idx !== qi))}
                    className="mr-auto text-slate-400 hover:text-red-600" aria-label={`حذف سؤال ${qi + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <input value={q.q} onChange={(e) => updateQ(qi, { q: e.target.value })} placeholder="نص السؤال…" className={`${inputCls} mb-2`} />
              <div className="grid gap-1.5 sm:grid-cols-2">
                {q.options.map((o, oi) => (
                  <label key={oi} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name={`correct-${qi}`}
                      checked={q.correct === oi}
                      onChange={() => updateQ(qi, { correct: oi })}
                      className="accent-emerald-600"
                      aria-label={`الإجابة الصحيحة: اختيار ${oi + 1}`}
                    />
                    <input value={o} onChange={(e) => updateOpt(qi, oi, e.target.value)} placeholder={`اختيار ${oi + 1}`} className={inputCls} />
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">الدايرة المختارة = الإجابة الصحيحة.</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setQuestions((qs) => [...qs, { q: "", options: ["", "", "", ""], correct: 0 }])}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" /> سؤال تاني
          </button>
          <button
            onClick={() => void create()}
            disabled={busy !== null || title.trim().length < 3}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />} نشر المسابقة
          </button>
        </div>
      </section>

      {/* ------------------------------------------------ المسابقات الحالية */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-bold text-slate-800">المسابقات المخصصة</h2>
        {loading ? (
          <p className="text-sm text-slate-500"><Loader2 className="ml-1 inline h-4 w-4 animate-spin" /> جارٍ التحميل…</p>
        ) : comps.length === 0 ? (
          <p className="text-sm text-slate-500">مفيش مسابقات — اعمل أول واحدة من فوق.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {comps.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <span className="text-lg">{c.emoji}</span>
                <span className="font-bold text-slate-800">{c.title}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{c.questions.length} سؤال</span>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">{c.players} لاعب · {c.winners} ناجح</span>
                <span className="text-xs text-slate-500">لحد {new Date(c.ends_at).toLocaleDateString("ar-EG")}</span>
                <span className={`mr-auto rounded-full px-2 py-0.5 text-xs font-bold ${c.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {c.status === "active" ? "شغالة" : "انتهت"}
                </span>
                {c.status === "active" ? (
                  <button
                    onClick={() => void setStatus(c.id, "ended")}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1 rounded bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
                  >
                    <Square className="h-3 w-3" /> إنهاء
                  </button>
                ) : (
                  <button
                    onClick={() => void setStatus(c.id, "active")}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3 w-3" /> إعادة تشغيل
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {notice ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">{notice}</p>
      ) : null}
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}
