"use client";
import { useEffect, useState } from "react";
export default function NotificationBell(){
 const [open,setOpen]=useState(false);
 const [data,setData]=useState<any>({notifications:[],unread:0});
 const load=async()=>{const r=await fetch("/api/notifications");const d=await r.json();if(d.success)setData(d);};
 useEffect(()=>{load();const i=setInterval(load,30000);return()=>clearInterval(i);},[]);
 const markRead=(id:string)=>fetch("/api/notifications",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})}).then(load);
 const markAll=()=>fetch("/api/notifications",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({all:true})}).then(load);
 return (
  <div className="relative">
    <button onClick={()=>setOpen(!open)} className="relative px-2">🔔{data.unread>0&&<span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full px-1">{data.unread}</span>}</button>
    {open&&(
      <div className="absolute right-0 mt-2 w-80 bg-white border rounded shadow p-2 z-50 max-h-96 overflow-auto">
        <div className="flex justify-between mb-2"><span className="font-bold">الإشعارات</span><button onClick={markAll} className="text-sm text-blue-600">تحديد الكل</button></div>
        {data.notifications.map((n:any)=>(
          <div key={n.id} className={`border p-2 rounded mb-2 ${n.read_at?"opacity-60":""}`} onClick={()=>!n.read_at&&markRead(n.id)}>
            <div className="font-semibold">{n.title}</div>
            {n.body&&<div className="text-sm">{n.body}</div>}
            {n.link_url&&<a href={n.link_url} className="text-xs text-blue-600">فتح</a>}
          </div>
        ))}
        {data.notifications.length===0&&<div className="text-sm">لا توجد إشعارات</div>}
      </div>
    )}
  </div>
 );
}