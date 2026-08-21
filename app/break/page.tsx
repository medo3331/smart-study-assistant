"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageShell, DataNotice } from '@/app/dashboard/components/PageShell';
import { useAuthUser } from '@/app/dashboard/components/use-page-data';

type Riddle = { question: string; hint: string; attempts_left: number; solved: boolean; studied: boolean };
type Quiz = { question: string; attempts_left: number; solved: boolean; subject: string };

export default function BreakPage() {
  const { supabase, session } = useAuthUser();
  const [riddle, setRiddle] = useState<Riddle | null>(null); const [answer, setAnswer] = useState(''); const [note, setNote] = useState('');
  const [seconds, setSeconds] = useState(300); const [running, setRunning] = useState(false); const [reaction, setReaction] = useState<'idle'|'wait'|'go'>('idle'); const [started, setStarted] = useState(0);
  const [memory, setMemory] = useState<string[]>([]); const [quiz, setQuiz] = useState<Quiz|null>(null); const [quizAnswer, setQuizAnswer] = useState('');
  useEffect(() => { if (!supabase || session.status !== 'ready') return; void Promise.all([supabase.rpc('daily_break_riddle'),supabase.rpc('daily_break_quiz')]).then(([riddleResult,quizResult]) => { if (riddleResult.error || quizResult.error) setNote('شغّل db/break-zone.sql ثم db/gamification.sql في Supabase لتفعيل البريك المرتبط بمادتك.'); else {setRiddle((Array.isArray(riddleResult.data) ? riddleResult.data[0] : riddleResult.data) as Riddle);setQuiz((Array.isArray(quizResult.data) ? quizResult.data[0] : quizResult.data) as Quiz);} }); }, [supabase, session]);
  useEffect(() => { if (!running || seconds === 0) return; const id = window.setInterval(() => setSeconds((v) => v - 1), 1000); return () => window.clearInterval(id); }, [running, seconds]);
  const claim = async (game: 'memory'|'reaction'|'quiz') => { const { data, error } = await supabase.rpc('claim_break_game', { p_game: game }); const row = Array.isArray(data) ? data[0] : data; setNote(error ? error.message : row?.message ?? 'تم'); };
  const submitRiddle = async () => { const { data, error } = await supabase.rpc('answer_break_riddle', { p_answer: answer }); const row = Array.isArray(data) ? data[0] : data; setNote(error ? error.message : row?.message ?? 'تم'); setAnswer(''); if (!error) void supabase.rpc('daily_break_riddle').then(({ data }) => setRiddle((Array.isArray(data) ? data[0] : data) as Riddle)); };
  const flip = (value: string) => { const next = memory.includes(value) ? memory.filter((v) => v !== value) : [...memory, value]; setMemory(next); if (next.length === 4) { setNote('أنهيت Memory Match!'); void claim('memory'); } };
  const startReaction = () => { setReaction('wait'); window.setTimeout(() => { setReaction('go'); setStarted(performance.now()); }, 1200 + Math.random() * 1800); };
  const tapReaction = () => { if (reaction !== 'go') return; setNote(`رد فعلك ${Math.round(performance.now() - started)}ms`); setReaction('idle'); void claim('reaction'); };
  const submitQuiz = async () => { const {data,error}=await supabase.rpc('answer_break_quiz',{p_answer:quizAnswer});const row=Array.isArray(data)?data[0]:data;setNote(error?.message??row?.message??'تم');setQuizAnswer('');if(!error){void supabase.rpc('daily_break_quiz').then(({data})=>setQuiz((Array.isArray(data)?data[0]:data) as Quiz));if(row?.correct)void claim('quiz');} };
  return <PageShell eyebrow="Break Zone" title="استراحة مذاكرة" lede="خد بريك قصير، ثم ارجع لخطة مذاكرتك. مكافآت الألعاب محدودة ومشروطة بنشاط دراسي حقيقي." action={<><Link href="/missions" className="btn btn-quiet text-sm">مهام اليوم</Link><Link href="/escape-room" className="btn btn-quiet text-sm">غرفة الهروب</Link></>}>
    {note && <DataNotice message={note} />}
    <section className="sheet-card p-5 space-y-3"><h2 className="h3">☕ Break Timer</h2><p className="text-3xl font-display ltr-num">{String(Math.floor(seconds / 60)).padStart(2,'0')}:{String(seconds % 60).padStart(2,'0')}</p><div className="flex gap-2"><button className="btn btn-marker text-sm" onClick={() => setRunning((v) => !v)}>{running ? 'إيقاف' : 'ابدأ ٥ دقائق'}</button><button className="btn btn-quiet text-sm" onClick={() => { setRunning(false); setSeconds(300); }}>إعادة</button></div></section>
    <div className="grid md:grid-cols-2 gap-4"><section className="sheet-card p-5 space-y-3"><h2 className="h3">🧠 Memory Match</h2><p className="text-sm text-ink-soft">اكشف الأربع بطاقات. مكافأة واحدة فقط ضمن الحد اليومي.</p><div className="grid grid-cols-2 gap-2">{['📚','⚡','🧩','🎯'].map((v) => <button key={v} className="btn btn-quiet" onClick={() => flip(v)}>{memory.includes(v) ? v : '؟'}</button>)}</div></section>
    <section className="sheet-card p-5 space-y-3"><h2 className="h3">⚡ Reaction Test</h2><p className="text-sm text-ink-soft">اضغط ابدأ، ثم اضغط فور ظهور «الآن».</p><button className={`btn text-sm ${reaction === 'go' ? 'btn-marker' : 'btn-quiet'}`} onClick={reaction === 'idle' ? startReaction : tapReaction}>{reaction === 'go' ? 'الآن!' : reaction === 'wait' ? 'استعد…' : 'ابدأ الاختبار'}</button></section>
    <section className="sheet-card p-5 space-y-3"><h2 className="h3">🏃 Quiz Rush</h2>{quiz?<><p className="tag">📚 {quiz.subject} · محاولات: {quiz.attempts_left}</p><p className="text-sm text-ink">{quiz.question}</p>{!quiz.solved&&<><input className="field" value={quizAnswer} onChange={(e) => setQuizAnswer(e.target.value)} placeholder="اكتب الإجابة"/><button className="btn btn-marker text-sm" onClick={()=>void submitQuiz()}>تحقق</button></>}</>:<p className="text-sm text-ink-soft">بيجهّز سؤال من خطتك…</p>}</section>
    <section className="sheet-card p-5 space-y-3"><h2 className="h3">🧩 فزورة اليوم</h2>{riddle ? <><p>{riddle.question}</p><p className="text-xs text-ink-soft">تلميح: {riddle.hint} · محاولات: {riddle.attempts_left}</p>{!riddle.solved && <div className="flex gap-2"><input className="field" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="إجابتك"/><button className="btn btn-marker text-sm" onClick={submitRiddle}>حل</button></div>}</> : <p className="text-sm text-ink-soft">بيحمّل الفزورة…</p>}</section></div>
  </PageShell>;
}
