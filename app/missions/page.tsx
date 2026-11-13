/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system is intentional */
"use client";
/* eslint-disable react-hooks/exhaustive-deps -- see exhaustive-deps note; will address with useCallback in follow-up */
import { useEffect, useState } from 'react';
import { PageShell, DataNotice, LoadingSheets } from '@/app/dashboard/components/PageShell';
import { useAuthUser } from '@/app/dashboard/components/use-page-data';

type Mission = { mission: string; label: string; done: boolean; claimed: boolean; coins: number; xp: number };

/* المهمة الأسبوعية (Phase 3) — صف واحد من RPC `weekly_missions`:
   الشروط (٥ مراحل + ٣ أيام) بتتحسب على السيرفر من coin_ledger بتوقيت القاهرة،
   والاستلام من `claim_weekly_mission` مرة واحدة في الأسبوع. */
type WeeklyMission = {
  id: string; label: string; week_key: string;
  steps_target: number; days_target: number;
  steps_done: number; days_done: number;
  done: boolean; claimed: boolean; coins: number; xp: number; ends_on: string;
};

const arNum = (n: number) => n.toLocaleString('ar-EG');

export default function MissionsPage() {
 const { supabase, session } = useAuthUser();
 const [items, setItems] = useState<Mission[] | null>(null);
 const [weekly, setWeekly] = useState<WeeklyMission | null>(null);
 const [note, setNote] = useState('');

 const load = async () => {
   const [{ data, error }, weeklyRes] = await Promise.all([
     supabase.rpc('daily_missions'),
     supabase.rpc('weekly_missions'),
   ]);
   if (error) { setNote('شغّل db/gamification.sql في Supabase لتفعيل المهام اليومية.'); return; }
   setItems((data ?? []) as Mission[]);
   // المهمة الأسبوعية اختيارية: لو الميجريشن الجديد لسه ما اتشغلش بنسكت
   const weeklyRow = (Array.isArray(weeklyRes.data) ? weeklyRes.data[0] : weeklyRes.data) as WeeklyMission | null;
   if (!weeklyRes.error && weeklyRow) setWeekly(weeklyRow);
 };

 useEffect(() => { if (session.status === 'ready') void load(); }, [session.status]);

 const claim = async (id: string) => {
   const { data, error } = await supabase.rpc('claim_daily_mission', { p_mission: id });
   const row = Array.isArray(data) ? data[0] : data;
   setNote(error?.message ?? row?.message ?? 'تم');
   if (!error) void load();
 };

 const claimWeekly = async () => {
   const { data, error } = await supabase.rpc('claim_weekly_mission');
   const row = Array.isArray(data) ? data[0] : data;
   setNote(error?.message ?? row?.message ?? 'تم');
   if (!error) {
     if ((row?.coins ?? 0) > 0) {
       window.dispatchEvent(new CustomEvent('foundation:coins', {
         detail: { source: 'weekly_mission', awarded: row?.coins ?? 0, balance: 0 },
       }));
     }
     void load();
   }
 };

 if (session.status === 'loading' || (!items && !note)) {
   return <PageShell eyebrow="Gamification" title="المهام اليومية"><LoadingSheets count={3} /></PageShell>;
 }

 const weeklyStepsPct = weekly ? Math.min(100, Math.round((Number(weekly.steps_done) / Math.max(1, Number(weekly.steps_target))) * 100)) : 0;
 const weeklyDaysPct = weekly ? Math.min(100, Math.round((Number(weekly.days_done) / Math.max(1, Number(weekly.days_target))) * 100)) : 0;

 return (
  <PageShell eyebrow="Gamification" title="المهام اليومية" lede="المهام تتأكد من نشاطك الحقيقي. كل مهمة تمنح ٥ كوين و١٠ XP مرة واحدة فقط.">
   {note && <DataNotice message={note} />}

   {/* ── المهمة الأسبوعية: مكافأة كبيرة على سلوك مستمر، مش على خطوة واحدة ── */}
   {weekly && (
     <section className="sheet-card sheet-card-live p-5 space-y-4" aria-label="مهمة الأسبوع">
       <div className="flex items-start justify-between gap-3 flex-wrap">
         <div className="min-w-0">
           <p className="eyebrow eyebrow-flush mb-1.5">مهمة الأسبوع</p>
           <h2 className="font-display font-extrabold text-base text-ink">{weekly.label}</h2>
           <p className="text-[11px] text-ink-soft mt-1">
             آخر يوم للاستلام: {new Date(`${weekly.ends_on}T00:00:00`).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}
           </p>
         </div>
         <span className="tag">
           <span className="ltr-num">{arNum(Number(weekly.coins))}</span> كوين
           <span>·</span>
           <span className="ltr-num">{arNum(Number(weekly.xp))}</span> XP
         </span>
       </div>

       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
         <div className="space-y-1.5">
           <div className="flex items-center justify-between gap-2 text-xs">
             <span className="text-ink-soft">مراحل مكتملة</span>
             <span className="mono ltr-num text-ink">{arNum(Number(weekly.steps_done))} / {arNum(Number(weekly.steps_target))}</span>
           </div>
           <div className="meter meter-sm"><div className="meter-fill" style={{ width: `${weeklyStepsPct}%` }} /></div>
         </div>
         <div className="space-y-1.5">
           <div className="flex items-center justify-between gap-2 text-xs">
             <span className="text-ink-soft">أيام مذاكرة</span>
             <span className="mono ltr-num text-ink">{arNum(Number(weekly.days_done))} / {arNum(Number(weekly.days_target))}</span>
           </div>
           <div className="meter meter-sm"><div className="meter-fill" style={{ width: `${weeklyDaysPct}%` }} /></div>
         </div>
       </div>

       <button
         disabled={!weekly.done || weekly.claimed}
         className="btn btn-marker text-sm transition-colors disabled:opacity-40"
         onClick={() => void claimWeekly()}
       >
         {weekly.claimed ? 'استلمت مكافأة الأسبوع' : weekly.done ? 'استلم مكافأة الأسبوع' : `فاضل ${arNum(Math.max(0, Number(weekly.steps_target) - Number(weekly.steps_done)))} مراحل و${arNum(Math.max(0, Number(weekly.days_target) - Number(weekly.days_done)))} أيام`}
       </button>
     </section>
   )}

   <section className="grid sm:grid-cols-2 gap-3">
     {items?.map(m => (
       <article key={m.mission} className="sheet-card p-5 space-y-3">
         <div className="flex justify-between gap-2">
           <h2 className="h3">{m.done ? '✅' : '○'} {m.label}</h2>
           <span className="tag">+٥ 🪙</span>
         </div>
         <p className="text-xs text-ink-soft">{m.claimed ? 'المكافأة في سجلك' : m.done ? 'جاهزة للاستلام' : 'أكمل النشاط لتفتح المكافأة'}</p>
         <button
           disabled={!m.done || m.claimed}
           className="btn btn-marker text-sm transition-colors disabled:opacity-40"
           onClick={() => void claim(m.mission)}
         >
           {m.claimed ? 'استلمتها' : m.done ? 'استلم المكافأة' : 'مقفولة'}
         </button>
       </article>
     ))}
   </section>
  </PageShell>
 );
}
