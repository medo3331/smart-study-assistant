"use client";
import { useEffect, useState } from 'react';
import { PageShell, DataNotice, LoadingSheets } from '@/app/dashboard/components/PageShell';
import { useAuthUser } from '@/app/dashboard/components/use-page-data';
type Room = { step:number; subject:string; question:string|null; hint:string|null; attempts_left:number; solved:boolean; studied:boolean };
export default function EscapeRoomPage(){
 const {supabase,session}=useAuthUser(); const [room,setRoom]=useState<Room|null>(null);const [answer,setAnswer]=useState('');const [note,setNote]=useState('');const [started]=useState(Date.now());const [elapsed,setElapsed]=useState(0);
 const load=async()=>{const {data,error}=await supabase.rpc('escape_room_status');if(error){setNote(`غرفة الهروب غير مفعّلة: ${error.message.split('\n')[0]}. شغّل db/break-zone.sql ثم db/gamification.sql في Supabase.`);return;}setRoom((Array.isArray(data)?data[0]:data) as Room);};
 useEffect(()=>{if(session.status==='ready')void load();},[session.status]);
 useEffect(()=>{const id=window.setInterval(()=>setElapsed(Math.floor((Date.now()-started)/1000)),1000);return()=>window.clearInterval(id);},[started]);
 const solve=async()=>{const {data,error}=await supabase.rpc('solve_escape_step',{p_answer:answer});const row=Array.isArray(data)?data[0]:data;setNote(error?.message??row?.message??'تم');setAnswer('');if(!error)void load();};
 if(session.status==='loading'||!room&&!note)return <PageShell eyebrow="Escape Room" title="غرفة الهروب التعليمية"><LoadingSheets count={2}/></PageShell>;
 return <PageShell eyebrow="Escape Room" title="غرفة الهروب التعليمية" lede="ثلاثة ألغاز قصيرة، ست محاولات، ومكافأة واحدة في اليوم بعد نشاط دراسي حقيقي.">
  {note&&<DataNotice message={note}/>} {room&&<article className="sheet-card p-6 space-y-5 max-w-2xl"><div className="flex justify-between gap-2 flex-wrap"><span className="tag">📚 {room.subject}</span><span className="tag">اللغز {Math.min(room.step,3)} من ٣</span><span className="tag">⏱ {elapsed}ث</span></div>{room.solved?<><h2 className="h2">🎉 فتحت باب الخروج</h2><p className="text-ink-soft">أنهيت مراجعة مسار «{room.subject}». ارجع بكرة لغرفة جديدة.</p></>:<><h2 className="h2">{room.question}</h2><p className="text-sm text-ink-soft">تلميح: {room.hint} · المحاولات المتبقية: {room.attempts_left}</p><div className="flex flex-wrap gap-2"><input className="field flex-1" value={answer} onChange={e=>setAnswer(e.target.value)} placeholder="اكتب الحل"/><button className="btn btn-marker text-sm" onClick={()=>void solve()}>افتح الباب</button></div></>}</article>}
 </PageShell>;
}
