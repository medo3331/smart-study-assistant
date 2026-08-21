"use client";
import { useEffect, useState } from 'react';
import { PageShell, DataNotice, LoadingSheets } from '@/app/dashboard/components/PageShell';
import { useAuthUser } from '@/app/dashboard/components/use-page-data';

type Mission = { mission: string; label: string; done: boolean; claimed: boolean; coins: number; xp: number };
export default function MissionsPage() {
 const { supabase, session } = useAuthUser(); const [items,setItems]=useState<Mission[]|null>(null); const [note,setNote]=useState('');
 const load=async()=>{ const {data,error}=await supabase.rpc('daily_missions'); if(error){setNote('شغّل db/gamification.sql في Supabase لتفعيل المهام اليومية.');return;} setItems((data??[]) as Mission[]); };
 useEffect(()=>{if(session.status==='ready') void load();},[session.status]);
 const claim=async(id:string)=>{const {data,error}=await supabase.rpc('claim_daily_mission',{p_mission:id}); const row=Array.isArray(data)?data[0]:data; setNote(error?.message??row?.message??'تم'); if(!error) void load();};
 if(session.status==='loading'||!items&&!note) return <PageShell eyebrow="Gamification" title="المهام اليومية"><LoadingSheets count={3}/></PageShell>;
 return <PageShell eyebrow="Gamification" title="المهام اليومية" lede="المهام تتأكد من نشاطك الحقيقي. كل مهمة تمنح ٥ كوين و١٠ XP مرة واحدة فقط.">
  {note&&<DataNotice message={note}/>}<section className="grid sm:grid-cols-2 gap-3">{items?.map(m=><article key={m.mission} className="sheet-card p-5 space-y-3"><div className="flex justify-between gap-2"><h2 className="h3">{m.done?'✅':'○'} {m.label}</h2><span className="tag">+٥ 🪙</span></div><p className="text-xs text-ink-soft">{m.claimed?'المكافأة في سجلك':m.done?'جاهزة للاستلام':'أكمل النشاط لتفتح المكافأة'}</p><button disabled={!m.done||m.claimed} className="btn btn-marker text-sm disabled:opacity-40" onClick={()=>void claim(m.mission)}>{m.claimed?'استلمتها':m.done?'استلم المكافأة':'مقفولة'}</button></article>)}</section>
 </PageShell>;
}
