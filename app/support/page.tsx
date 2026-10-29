"use client";
import { useEffect, useState } from "react";
export default function SupportPage(){
 const [tickets,setTickets]=useState<any[]>([]);
 const [subject,setSubject]=useState("");
 const [message,setMessage]=useState("");
 const [selected,setSelected]=useState<any>(null);
 const [detail,setDetail]=useState<any>(null);
 const load=async()=>{const r=await fetch("/api/support/tickets");const d=await r.json();if(d.success)setTickets(d.tickets);};
 useEffect(()=>{load();},[]);
 const create=async(e:any)=>{e.preventDefault();await fetch("/api/support/tickets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subject,message,category:"other"})});setSubject("");setMessage("");load();};
 const open=async(t:any)=>{setSelected(t);const r=await fetch(`/api/support/tickets/${t.id}`);const d=await r.json();if(d.success)setDetail(d);};
 const reply=async(e:any)=>{e.preventDefault();const text=e.target.reply.value;await fetch(`/api/support/tickets/${selected.id}/messages`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:text})});e.target.reset();open(selected);};
 const close=async()=>{await fetch(`/api/support/tickets/${selected.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"closed"})});open(selected);load();};
 return (
  <div className="p-6 space-y-4">
    <h1 className="text-xl font-bold">الدعم</h1>
    <form onSubmit={create} className="space-y-2 border p-4 rounded">
      <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="الموضوع" className="border p-2 w-full" />
      <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="الرسالة" className="border p-2 w-full" />
      <button className="bg-blue-600 text-white px-4 py-2 rounded">إرسال</button>
    </form>
    <div className="grid grid-cols-2 gap-4">
      <ul className="border rounded p-2 space-y-2">
        {tickets.map(t=>(<li key={t.id} onClick={()=>open(t)} className="cursor-pointer p-2 hover:bg-gray-100">{t.subject} - {t.status}</li>))}
      </ul>
      <div className="border rounded p-2">
        {detail&&(<>
          <h2 className="font-bold">{detail.ticket.subject}</h2>
          <div className="space-y-2 my-2">{detail.messages.map((m:any)=>(<div key={m.id} className="border p-2 rounded"><b>{m.author_role}</b>: {m.body}</div>))}</div>
          <form onSubmit={reply} className="space-y-2"><textarea name="reply" className="border p-2 w-full" /><button className="bg-green-600 text-white px-4 py-2 rounded">رد</button></form>
          {detail.ticket.status!=="closed"&&<button onClick={close} className="mt-2 bg-red-600 text-white px-4 py-2 rounded">إغلاق</button>}
        </>)}
      </div>
    </div>
  </div>
 );
}