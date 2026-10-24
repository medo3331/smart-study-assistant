"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
export default function NotificationBell(){
 const [open,setOpen]=useState(false);
 const [data,setData]=useState<any>({notifications:[],unread:0});
 const [pulse,setPulse]=useState(false);
 const previousUnreadRef=useRef(0);
 const [error,setError]=useState<string|null>(null);
 const [authReady,setAuthReady]=useState(false);
 const [hasUser,setHasUser]=useState(false);
 const load=async()=>{const r=await fetch("/api/notifications");const d=await r.json().catch(()=>null);if(r.status===401){setData({notifications:[],unread:0});setError(null);return;}if(d?.success){if((d.unread||0)>previousUnreadRef.current){setPulse(true);window.setTimeout(()=>setPulse(false),2500);}previousUnreadRef.current=d.unread||0;setData(d);setError(null);}else{setData({notifications:[],unread:0});setError(d?.error||"Failed to load notifications.");}};
 useEffect(()=>{const supabase=createClient();let mounted=true;const sync=async()=>{try{const {data:a}=await supabase.auth.getUser();if(mounted)setHasUser(Boolean(a.user));}catch{if(mounted)setHasUser(false);}finally{if(mounted)setAuthReady(true);}};sync();const {data:s}=supabase.auth.onAuthStateChange((_e:any,session:any)=>{if(!mounted)return;setHasUser(Boolean(session?.user));setAuthReady(true);});return()=>{mounted=false;s.subscription.unsubscribe();};},[]);
 useEffect(()=>{if(!authReady||!hasUser){setData({notifications:[],unread:0});setError(null);return;}load();const i=setInterval(load,30000);return()=>clearInterval(i);},[authReady,hasUser]);
 const markRead=(id:string)=>fetch("/api/notifications",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})}).then(load);
 const markAll=()=>fetch("/api/notifications",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({all:true})}).then(load);
 if(!authReady||!hasUser)return null;
 return (
  <div className="relative">
    <button onClick={()=>setOpen(!open)} className={`relative flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-200 bg-white text-2xl shadow-sm transition hover:scale-105 dark:border-gray-700 dark:bg-gray-900 ${pulse ? "motion-safe:animate-pulse" : ""}`} aria-label="الإشعارات">{pulse ? "🔔" : "🔔"}{data.unread>0&&<span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">{data.unread}</span>}</button>
    {open&&(
      <div className="absolute right-0 mt-2 w-80 rounded border border-gray-200 bg-white p-2 text-gray-900 shadow z-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 max-h-96 overflow-auto">
        <div className="flex justify-between mb-2"><span className="font-bold">الإشعارات</span><button onClick={markAll} className="text-sm text-blue-600 dark:text-blue-400">تحديد الكل</button></div>
        {data.notifications.map((n:any)=>(
          <div key={n.id} className={`border border-gray-200 rounded p-2 mb-2 text-gray-900 dark:border-gray-700 dark:text-gray-100 ${n.read_at?"opacity-60":""}`} onClick={()=>!n.read_at&&markRead(n.id)}>
            <div className="font-semibold">{n.title}</div>
            {n.body&&<div className="text-sm">{n.body}</div>}
            {n.link_url&&<a href={n.link_url} className="text-xs text-blue-600 dark:text-blue-400">فتح</a>}
          </div>
        ))}
        {data.notifications.length===0&&<div className="text-sm">لا توجد إشعارات</div>}
         {error&&<div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
      </div>
    )}
  </div>
 );
}